/* eslint-disable no-await-in-loop -- 远程检查必须串行：鉴权失败后续跳过，网络失败不继续探测 */
import { stat } from 'node:fs/promises';
import { CliError, type CliErrorCode } from '../cli/errors';
import { ExitCode, type ExitCodeValue } from '../cli/exitCodes';
import { isLoggedInOffline } from './auth';
import { authorizationServerUrlFromMcpUrl } from '../auth/oauth';
import { ensureFreshCredentials } from '../auth/refresh';
import { readConfig } from '../config/store';
import { resolveSite } from '../config/profiles';
import { CONFIG_DIR_MODE, CONFIG_FILE_MODE, getConfigDir, getConfigFilePath } from '../config/paths';
import { createMcpClient } from '../mcp/client';
import { executeToolCall } from '../mcp/callTool';
import { getToolCatalog } from '../mcp/toolCatalog';
import type {
    AuthCredentials,
    CommandContext,
    CommandSpec,
    McpClient,
    SiteProfile,
    ToolCall,
} from '../types';

/**
 * `msy-x doctor`（设计稿 §5.3 / dev-plan P0-8）：本地自检 + `--remote` 真实连通验证。
 *
 * - 本地：Node 版本、配置目录/文件权限位、站点解析、凭证（只报布尔与时间，**绝不打印 token 值**）；
 * - `--remote`：initialize + tools/list（期望 25 个工具，不一致 warn 列差异），
 *   再用 `run_metric_query` 对不存在的 explore 做能力探测（§10.4 判别键修复）：
 *   错误含 `Invalid literal value` → 服务端镜像缺修复（fail，退 5）；
 *   其它业务错误（explore 不存在/权限）→ 修复已就绪（ok）；
 *   再 POST {site}/api/v1/oauth/device 探测设备码（扫码）能力：
 *   400 + unauthorized_client（故意用未注册 client）→ 端点存在（ok）；
 *   404 → 站点不支持扫码登录（fail，退 5）；其它非 2xx/网络错误 → warn；
 * - 输出：默认逐行 `[ok]/[warn]/[fail] name — detail`；ctx.format 为 json
 *   （含非 TTY 默认与显式 --json，与其它命令同口径）时输出
 *   `{ ok, checks }`（ok = 无 fail）；
 * - 退出码（fail 类别优先级 local > auth > network > server）：
 *   本地配置类 → 2；登录/鉴权 → 3；远程不可达/超时 → 6；服务端能力缺失 → 5；
 *   仅 warn → 0；
 * - 本命令不走 ToolCall 通道（spec.build 抛 NOT_IMPLEMENTED），
 *   集成层调 `runDoctor(opts, ctx)`（与 runAuthCommand 同风格）。
 */

export type DoctorCheckStatus = 'ok' | 'warn' | 'fail';

export type DoctorCheck = {
    name: string;
    status: DoctorCheckStatus;
    detail: string;
};

/** fail 的类别 → 退出码（设计稿 §8.2）；优先级见 FAIL_CATEGORY_PRIORITY */
type FailCategory = 'local' | 'auth' | 'network' | 'server';

const FAIL_EXIT_CODE: Record<FailCategory, ExitCodeValue> = {
    local: ExitCode.USAGE,
    auth: ExitCode.AUTH_REQUIRED,
    network: ExitCode.NETWORK,
    server: ExitCode.SERVER_ERROR,
};

/** 多类 fail 并存时的取舍：先修本地，再修登录，再修网络，最后才是服务端能力 */
const FAIL_CATEGORY_PRIORITY: FailCategory[] = ['local', 'auth', 'network', 'server'];

const FAIL_ERROR_CODE: Record<FailCategory, CliErrorCode> = {
    local: 'CONFIG',
    auth: 'AUTH_REQUIRED',
    network: 'NETWORK',
    server: 'SERVER_ERROR',
};

const FAIL_ERROR_HINT: Record<FailCategory, string> = {
    local: '按上面 [fail] 行的提示修复本地配置后重试 msy-x doctor',
    auth: '运行 msy-x auth login 重新登录',
    network: '检查网络与站点地址；慢查询可用 --timeout <ms> 调大超时',
    server: '升级主站到包含 MCP 判别键修复的版本后重试 msy-x doctor --remote',
};

export type DoctorErrorSummary = {
    code: CliErrorCode;
    message: string;
    hint: string;
};

export type DoctorResult = {
    /** 要写到 stdout 的内容（逐行检查或 --json，已含结尾换行） */
    stdout: string;
    exitCode: ExitCodeValue;
    /** 非 0 时给集成层抛 CliError 用的摘要（stderr 单行 JSON，§8.1） */
    error: DoctorErrorSummary | null;
};

export type RunDoctorOptions = {
    /** `--remote`：加做 initialize + tools/list + 能力探测 */
    remote: boolean;
};

export type RunDoctorDeps = {
    /** 客户端工厂（默认 createMcpClient）；单测注入假实现 */
    createClient?: typeof createMcpClient;
    /** 注入时钟（凭证过期判定） */
    now?: () => Date;
    /** 注入 Node 版本串（默认 process.versions.node） */
    nodeVersion?: string;
    /** 注入平台（默认 process.platform；win32 权限位检查降级为 warn） */
    platform?: NodeJS.Platform;
    /** 注入环境变量（默认 process.env；配置文件定位用） */
    env?: Record<string, string | undefined>;
    /** 注入 fetch（--remote 设备码端点探测用；默认 globalThis.fetch） */
    fetchFn?: typeof globalThis.fetch;
};

const localOnlyBuild = (name: string) => (): never => {
    throw new CliError({
        code: 'NOT_IMPLEMENTED',
        message: `${name} 是本地自检命令，不走 ToolCall 通道`,
        hint: '集成层应调用 runDoctor（src/commands/doctor.ts）',
    });
};

export const doctorCommands: CommandSpec[] = [
    {
        name: 'doctor',
        description: '自检本地配置与凭证；--remote 加做真实连通与服务端能力验证',
        options: [
            {
                flags: '--remote',
                description:
                    '发真实请求：initialize + tools/list + run_metric_query 与设备码端点能力探测',
            },
        ],
        example: 'msy-x doctor --remote',
        dataCommand: false,
        build: localOnlyBuild('doctor'),
    },
];

/**
 * v2 工具目录的期望清单（25 个，与 backend McpToolName 一一对应）。
 * 数量或名单不一致 → warn（新工具无需 CLI 发版即可见，缺工具通常是镜像过旧）。
 * `list_verified_content` 已随服务端下线（content-verification 未移植，工具只能
 * 返回「不支持」），不在期望清单内；若镜像仍暴露它，warn 会提示镜像已过新/过旧。
 */
export const EXPECTED_MCP_TOOL_NAMES: string[] = [
    'find_charts',
    'find_content',
    'find_dashboards',
    'find_explores',
    'find_fields',
    'find_spaces',
    'get_current_project',
    'get_dashboard_code',
    'get_dashboard_tiles',
    'get_lightdash_version',
    'get_mcp_docs',
    'get_my_access',
    'get_saved_chart',
    'get_site_info',
    'list_charts',
    'list_dashboard_explore_map',
    'list_dashboards',
    'list_explores',
    'list_projects',
    'list_spaces',
    'run_dashboard_tiles',
    'run_metric_query',
    'run_saved_chart',
    'run_semantic_metric_query',
    'search_field_values',
    'set_project',
].sort();

/**
 * 能力探测调用（设计稿 §10.4）：对不存在的 explore 发一次最小查询。
 * - 已修复镜像 → 业务错误（explore 不存在 / 权限），视为通过；
 * - 未修复镜像 → zod 二次 parse 报 `Invalid literal value`，视为服务端能力缺失。
 */
export const DOCTOR_PROBE_CALL: ToolCall = {
    tool: 'run_metric_query',
    args: {
        vizConfig: {
            exploreName: '__msy_x_doctor_probe__',
            metrics: [],
            dimensions: [],
            sorts: [],
            limit: 1,
        },
    },
};

const MISSING_DISCRIMINATOR_PATTERN = /Invalid literal value/;

const MISSING_DISCRIMINATOR_DETAIL =
    '服务端镜像缺少 MCP 判别键修复（需升级主站），' +
    'run_metric_query / search_field_values 暂不可用';

const PROBE_READY_DETAIL = '判别键修复已就绪（业务错误即视为通过）';

/** 设备码（扫码）能力探测：故意用未注册 client_id，保证不会真创建会话 */
const DEVICE_FLOW_PROBE_CLIENT_ID = '__msy_x_doctor_probe__';

const DEVICE_FLOW_OK_DETAIL =
    '设备码端点存在（未注册 client 被正确拒绝），可支持 msy-x auth login --qr';

const DEVICE_FLOW_MISSING_DETAIL = '站点不支持扫码登录';

const DEVICE_FLOW_MISSING_HINT =
    '服务端镜像需 ≥ 2.7.5（2.7.4 的设备码会话存内存，多副本会随机失败）；暂时改用 msy-x auth login --no-browser 或 --token <pat>';

/** 服务端没暴露 run_metric_query（或被裁掉）时，探测无法证明修复已就绪 */
const PROBE_TOOL_MISSING_PATTERN = /tool .*not found|unknown tool|no such tool/i;

const AUTH_LOGIN_HINT = '运行 msy-x auth login 重新登录';

/* ------------------------------------------------------------------ */
/* 本地检查                                                            */
/* ------------------------------------------------------------------ */

const formatMode = (mode: number): string =>
    `0${mode.toString(8)}`; // eslint-disable-line no-bitwise

type CheckWithCategory = { check: DoctorCheck; category: FailCategory };

const check = (
    name: string,
    status: DoctorCheckStatus,
    detail: string,
    category: FailCategory = 'local',
): CheckWithCategory => ({ check: { name, status, detail }, category });

const checkNodeVersion = (nodeVersion: string): CheckWithCategory => {
    const major = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] ?? '', 10);
    if (Number.isInteger(major) && major >= 20) {
        return check('node-version', 'ok', `Node ${nodeVersion}（要求 ≥ 20）`);
    }
    return check(
        'node-version',
        'fail',
        `Node ${nodeVersion} 不满足要求（需 ≥ 20），请升级 Node 后重试`,
    );
};

const checkConfigPermissions = async (
    env: Record<string, string | undefined>,
    platform: NodeJS.Platform,
): Promise<CheckWithCategory> => {
    if (platform === 'win32') {
        return check(
            'config-permissions',
            'warn',
            'Windows 不校验 POSIX 权限位；共享机器建议用 MSY_X_CONFIG 指向个人目录内的配置文件',
        );
    }
    const dir = getConfigDir(env);
    const file = getConfigFilePath(env);
    let dirMode: number | null = null;
    let fileMode: number | null = null;
    try {
        // eslint-disable-next-line no-bitwise
        dirMode = (await stat(dir)).mode & 0o777;
    } catch {
        dirMode = null; // 目录尚未创建（首次写配置时自动建为 0700）
    }
    try {
        // eslint-disable-next-line no-bitwise
        fileMode = (await stat(file)).mode & 0o777;
    } catch {
        fileMode = null; // 配置文件尚未创建（使用内置默认配置）
    }
    const parts: string[] = [];
    let loose = false;
    if (dirMode === null) {
        parts.push('目录尚未创建（首次写入时自动创建为 0700）');
    } else if (dirMode === CONFIG_DIR_MODE) {
        parts.push(`目录 ${formatMode(dirMode)}`);
    } else {
        parts.push(`目录 ${formatMode(dirMode)}（应为 ${formatMode(CONFIG_DIR_MODE)}）`);
        loose = true;
    }
    if (fileMode === null) {
        parts.push('文件尚未创建（首次写入时自动创建为 0600）');
    } else if (fileMode === CONFIG_FILE_MODE) {
        parts.push(`文件 ${formatMode(fileMode)}`);
    } else {
        parts.push(`文件 ${formatMode(fileMode)}（应为 ${formatMode(CONFIG_FILE_MODE)}）`);
        loose = true;
    }
    // 权限位过宽是安全卫生问题（凭证文件），CLI 仍可用 → warn 而不是 fail
    return check('config-permissions', loose ? 'warn' : 'ok', parts.join('，'));
};

const checkSiteResolution = async (
    ctx: CommandContext,
    env: Record<string, string | undefined>,
): Promise<CheckWithCategory> => {
    let site: SiteProfile;
    try {
        const config = await readConfig(env);
        site = resolveSite({ options: ctx.options, config, env });
    } catch (error) {
        const detail =
            error instanceof CliError
                ? `${error.message}${error.hint !== null ? `（${error.hint}）` : ''}`
                : String(error);
        return check('site-resolution', 'fail', detail);
    }
    return check(
        'site-resolution',
        'ok',
        `${site.name} → ${site.mcpUrl}（${site.authMode} / ${site.authHeader}）`,
    );
};

const checkCredentials = (
    credentials: AuthCredentials | null,
    now: Date,
): CheckWithCategory => {
    if (credentials === null) {
        return check(
            'credentials',
            'warn',
            '本机没有该站点的凭证；用 msy-x auth login 登录，或设 MSY_X_PAT',
        );
    }
    if (credentials.mode === 'pat') {
        return check('credentials', 'ok', 'mode=pat，hasToken=true（PAT 无过期概念）');
    }
    const expired = Date.parse(credentials.accessExpiresAt) <= now.getTime();
    const detail =
        `mode=oauth，expiresAt=${credentials.accessExpiresAt}` +
        `${expired ? '（access 已过期）' : ''}，` +
        `hasAccessToken=true，hasRefreshToken=${credentials.refreshToken !== null}`;
    return check(
        'credentials',
        expired && credentials.refreshToken === null ? 'warn' : 'ok',
        detail,
    );
};

/* ------------------------------------------------------------------ */
/* 远程检查（--remote）                                                */
/* ------------------------------------------------------------------ */

const describeToolDiff = (names: string[]): string => {
    const actual = new Set(names);
    const expected = new Set(EXPECTED_MCP_TOOL_NAMES);
    const added = names.filter((name) => !expected.has(name)).sort();
    const missing = EXPECTED_MCP_TOOL_NAMES.filter((name) => !actual.has(name)).sort();
    const parts = [`tools/list 返回 ${names.length} 个（期望 ${EXPECTED_MCP_TOOL_NAMES.length} 个）`];
    if (added.length > 0) {
        parts.push(`新增：${added.join(', ')}`);
    }
    if (missing.length > 0) {
        parts.push(`缺失：${missing.join(', ')}`);
    }
    return parts.join('；');
};

const classifyRemoteError = (error: unknown): FailCategory | null => {
    if (!(error instanceof CliError)) return null;
    switch (error.code) {
        case 'AUTH_REQUIRED':
            return 'auth';
        case 'NETWORK':
            return 'network';
        case 'SERVER_ERROR':
            return 'server';
        default:
            // FORBIDDEN / DASHBOARD_STRICT / 其它：按服务端侧问题归类
            return 'server';
    }
};

/**
 * 设备码（扫码）能力探测：POST {site}/api/v1/oauth/device（镜像 ≥ 2.7.5 才有；
 * 2.7.4 的设备码会话存进程内存，多副本会随机失败）。
 * 故意用未注册 client_id（不会真创建会话）：
 * - 400 + JSON error=unauthorized_client → 端点存在且校验 client（ok）；
 * - 404（旧镜像无该路由，JSON/HTML 均算）→ 站点不支持扫码登录（fail，退 5）；
 * - 其它非 2xx / 网络错误 → warn（不影响退出码）。
 */
const checkDeviceFlow = async (
    mcpUrl: string,
    fetchFn: typeof globalThis.fetch,
): Promise<CheckWithCategory> => {
    const endpoint = `${authorizationServerUrlFromMcpUrl(mcpUrl)}/device`;
    let response: Response;
    try {
        response = await fetchFn(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: DEVICE_FLOW_PROBE_CLIENT_ID }),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return check('device-flow', 'warn', `设备码端点探测请求失败：${message}`);
    }
    if (response.status === 404) {
        return check(
            'device-flow',
            'fail',
            `${DEVICE_FLOW_MISSING_DETAIL}（POST ${endpoint} 返回 404）；${DEVICE_FLOW_MISSING_HINT}`,
            'server',
        );
    }
    let bodyError: string | null = null;
    try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string') bodyError = body.error;
    } catch {
        bodyError = null; // 响应非 JSON（如 HTML 错误页）
    }
    if (response.status === 400 && bodyError === 'unauthorized_client') {
        return check('device-flow', 'ok', DEVICE_FLOW_OK_DETAIL);
    }
    if (response.ok) {
        // 未注册 client 竟被接受：端点行为不符合预期，提示但不拦截
        return check(
            'device-flow',
            'warn',
            `设备码端点对未注册 client 返回 ${response.status}（预期 400 unauthorized_client）`,
        );
    }
    const parts = [`设备码端点探测返回 ${response.status}`];
    if (bodyError !== null) parts.push(`error=${bodyError}`);
    return check('device-flow', 'warn', parts.join('，'));
};

const runRemoteChecks = async (
    ctx: CommandContext,
    deps: RunDoctorDeps,
    checks: CheckWithCategory[],
): Promise<void> => {
    if (!isLoggedInOffline(ctx.credentials)) {
        checks.push(
            check(
                'remote-auth',
                'fail',
                `未登录或凭证已失效；${AUTH_LOGIN_HINT}`,
                'auth',
            ),
        );
        return; // 未登录时后续远程检查无意义，跳过
    }
    checks.push(check('remote-auth', 'ok', '已登录（离线判定，与 auth status 同口径）'));

    const createClient = deps.createClient ?? createMcpClient;
    const env = deps.env ?? process.env;
    const { credentials: initialCredentials } = ctx;
    let credentials = initialCredentials;

    const openClient = (): Promise<McpClient> =>
        createClient({
            site: ctx.site,
            credentials,
            timeoutMs: ctx.options.timeoutMs,
        });

    /** 401 时尝试刷新一次凭证（与 runToolCommand 语义一致）；不可刷新返回 false */
    const refreshOnAuthError = async (error: unknown): Promise<boolean> => {
        if (
            !(error instanceof CliError) ||
            error.code !== 'AUTH_REQUIRED' ||
            credentials === null
        ) {
            return false;
        }
        try {
            const config = await readConfig(env);
            credentials = await ensureFreshCredentials({
                site: ctx.site,
                credentials,
                config,
            });
            return true;
        } catch (refreshError) {
            // 暂时性刷新失败（网络/5xx）要交给外层按 network 类归类，不能当成
            // 「未登录」吞掉：凭证其实还在本地
            if (
                refreshError instanceof CliError &&
                refreshError.code === 'NETWORK'
            ) {
                throw refreshError;
            }
            return false; // 凭证真失效（已清盘）：按未登录处理
        }
    };

    let client: McpClient;
    try {
        client = await openClient();
    } catch (error) {
        if (error instanceof CliError && error.code === 'NETWORK') {
            checks.push(
                check(
                    'remote-connect',
                    'fail',
                    `无法连接 MCP 端点（${error.message}）；${error.hint ?? ''}`,
                    'network',
                ),
            );
            return;
        }
        if (!(await refreshOnAuthError(error))) {
            const category = classifyRemoteError(error) ?? 'server';
            checks.push(
                check(
                    'remote-connect',
                    'fail',
                    error instanceof CliError
                        ? `${error.message}${error.hint !== null ? `（${error.hint}）` : ''}`
                        : String(error),
                    category,
                ),
            );
            return;
        }
        try {
            client = await openClient();
        } catch (secondError) {
            const category = classifyRemoteError(secondError) ?? 'server';
            checks.push(
                check(
                    'remote-connect',
                    'fail',
                    secondError instanceof CliError
                        ? `刷新后重连仍失败：${secondError.message}`
                        : `刷新后重连仍失败：${String(secondError)}`,
                    category,
                ),
            );
            return;
        }
    }

    try {
        // 1) initialize + tools/list：应为 25 个且名单一致，不一致 warn 列差异
        try {
            const catalog = await getToolCatalog(client);
            const names = catalog.map((tool) => tool.name);
            const matches =
                names.length === EXPECTED_MCP_TOOL_NAMES.length &&
                EXPECTED_MCP_TOOL_NAMES.every((name) => names.includes(name));
            if (matches) {
                checks.push(
                    check(
                        'tools-catalog',
                        'ok',
                        `tools/list 返回 ${names.length} 个工具（25/25）`,
                    ),
                );
            } else {
                checks.push(check('tools-catalog', 'warn', describeToolDiff(names)));
            }
        } catch (error) {
            if (error instanceof CliError && error.code === 'AUTH_REQUIRED') {
                checks.push(
                    check(
                        'tools-catalog',
                        'fail',
                        `tools/list 被拒绝（401）；${AUTH_LOGIN_HINT}`,
                        'auth',
                    ),
                );
            } else {
                const category = classifyRemoteError(error) ?? 'server';
                checks.push(
                    check(
                        'tools-catalog',
                        'fail',
                        error instanceof CliError
                            ? `tools/list 失败：${error.message}`
                            : `tools/list 失败：${String(error)}`,
                        category,
                    ),
                );
            }
        }

        // 2) 能力探测：run_metric_query 对不存在的 explore 发最小查询（§10.4）
        try {
            await executeToolCall({
                client,
                call: DOCTOR_PROBE_CALL,
                timeoutMs: ctx.options.timeoutMs,
            });
            checks.push(
                check('capability-probe', 'ok', `${PROBE_READY_DETAIL}（探测查询成功返回）`),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof CliError && error.code === 'NETWORK') {
                checks.push(
                    check(
                        'capability-probe',
                        'fail',
                        `探测请求网络失败或超时：${message}`,
                        'network',
                    ),
                );
            } else if (error instanceof CliError && error.code === 'AUTH_REQUIRED') {
                checks.push(
                    check(
                        'capability-probe',
                        'fail',
                        `探测请求被拒绝（401）；${AUTH_LOGIN_HINT}`,
                        'auth',
                    ),
                );
            } else if (
                error instanceof CliError &&
                error.code === 'SERVER_ERROR' &&
                MISSING_DISCRIMINATOR_PATTERN.test(message)
            ) {
                checks.push(check('capability-probe', 'fail', MISSING_DISCRIMINATOR_DETAIL, 'server'));
            } else if (
                error instanceof CliError &&
                error.code === 'SERVER_ERROR' &&
                PROBE_TOOL_MISSING_PATTERN.test(message)
            ) {
                // 探测工具本身不存在：不能据此声称修复已就绪
                checks.push(
                    check(
                        'capability-probe',
                        'warn',
                        `服务端未暴露 run_metric_query，能力探测跳过：${message}`,
                    ),
                );
            } else if (error instanceof CliError) {
                // explore 不存在 / 权限 / 其它业务错误：判别键已能通过服务端第一层校验
                checks.push(
                    check(
                        'capability-probe',
                        'ok',
                        `${PROBE_READY_DETAIL}：${message}`,
                    ),
                );
            } else {
                checks.push(
                    check(
                        'capability-probe',
                        'fail',
                        `探测请求失败：${message}`,
                        'server',
                    ),
                );
            }
        }
        // 3) 设备码（扫码）能力探测：POST /api/v1/oauth/device（镜像 ≥ 2.7.5）
        checks.push(
            await checkDeviceFlow(
                ctx.site.mcpUrl,
                deps.fetchFn ?? globalThis.fetch,
            ),
        );
    } finally {
        await client.close().catch(() => undefined);
    }
};

/* ------------------------------------------------------------------ */
/* 输出与退出码                                                        */
/* ------------------------------------------------------------------ */

const renderLines = (checks: DoctorCheck[]): string =>
    `${checks.map((item) => `[${item.status}] ${item.name} — ${item.detail}`).join('\n')}\n`;

const renderDoctorJson = (ok: boolean, checks: DoctorCheck[]): string =>
    `${JSON.stringify({ ok, checks })}\n`;

export const runDoctor = async (
    opts: RunDoctorOptions,
    ctx: CommandContext,
    deps: RunDoctorDeps = {},
): Promise<DoctorResult> => {
    const env = deps.env ?? process.env;
    const platform = deps.platform ?? process.platform;
    const nodeVersion = deps.nodeVersion ?? process.versions.node;
    const now = deps.now ?? (() => new Date());

    const checks: CheckWithCategory[] = [];
    checks.push(checkNodeVersion(nodeVersion));
    checks.push(await checkConfigPermissions(env, platform));
    checks.push(await checkSiteResolution(ctx, env));
    checks.push(checkCredentials(ctx.credentials, now()));

    if (opts.remote) {
        await runRemoteChecks(ctx, deps, checks);
    }

    const doctorChecks = checks.map(({ check: item }) => item);
    const failed = checks.filter(({ check: item }) => item.status === 'fail');
    const ok = failed.length === 0;

    let exitCode: ExitCodeValue = ExitCode.OK;
    let error: DoctorErrorSummary | null = null;
    if (!ok) {
        const category =
            FAIL_CATEGORY_PRIORITY.find((candidate) =>
                failed.some((item) => item.category === candidate),
            ) ?? 'local';
        exitCode = FAIL_EXIT_CODE[category];
        const worst = failed.find((item) => item.category === category) ?? failed[0];
        error = {
            code: FAIL_ERROR_CODE[category],
            message: `doctor 自检未通过：${worst.check.name} — ${worst.check.detail}`,
            hint: FAIL_ERROR_HINT[category],
        };
    }

    // D6：用已解析的 ctx.format（非 TTY 默认 json），与其它命令一致；
    // 不再用未解析的 ctx.options.format（管道下丢 JSON）
    const stdout =
        ctx.format === 'json'
            ? renderDoctorJson(ok, doctorChecks)
            : renderLines(doctorChecks);
    return { stdout, exitCode, error };
};
