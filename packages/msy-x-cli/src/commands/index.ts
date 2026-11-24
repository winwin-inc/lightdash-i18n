import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { CliError } from '../cli/errors';
import { readNoBrowser } from '../cli/flags';
import {
    GLOBAL_FLAG_SPECS,
    parseGlobalOptions,
} from '../cli/globalOptions';
import { runToolCommand } from '../cli/run';
import { readConfig } from '../config/store';
import { resolveSite } from '../config/profiles';
import { logInfo, logWarn, setQuiet, setVerbose } from '../lib/logger';
import { readStdinIfPiped } from '../lib/stdin';
import type {
    AuthCredentials,
    CliConfig,
    CommandBuildInput,
    CommandContext,
    CommandSpec,
    SiteProfile,
} from '../types';
import { runAuthCommand, authCommands } from './auth';
import { runSiteCommand, siteCommands } from './site';
import { infoCommands } from './info';
import { accessCommands } from './access';
import { projectCommands } from './project';
import { searchCommands } from './search';
import { spacesCommands } from './spaces';
import { exploresCommands } from './explores';
import { fieldsCommands } from './fields';
import { valuesCommands } from './values';
import { buildQueryFileCalls, queryCommands } from './query';
import {
    DASHBOARDS_TILE_NOTICE,
    dashboardsCommands,
    filterDashboardTiles,
} from './dashboards';
import { chartsCommands } from './charts';
import { docsCommands } from './docs';
import { runToolsCommand, toolsCommands } from './tools';
import { runCallCommand, callCommands } from './call';
import { runDoctor, doctorCommands } from './doctor';

/**
 * 命令注册唯一挂载点（设计稿 §6.2 命令面）。
 *
 * - 各分组文件导出 CommandSpec（纯映射），本文件负责：commander 装配、
 *   全局选项、--help 示例（addHelpText after）、CommandContext 组装与分发；
 * - 本地命令（auth/site/doctor）与 tools/call 走专门 handler，其余走
 *   spec.build → runToolCommand（--dry-run / 401 刷新重试 / 渲染统一在该管道）；
 * - `dashboards get` 的 `code` 别名、`dashboards run --tile` 的本地磁贴过滤
 *   也在本文件特判（types.ts 契约层不含这些字段）；
 * - `doctor` 不走 buildContext 的失败即中止语义：配置损坏时降级占位上下文，
 *   由 runDoctor 的 site-resolution 检查逐条报告（这正是 doctor 的职责）。
 */

const GROUP_DESCRIPTIONS: Record<string, string> = {
    project: '项目管理（列表 / 默认项目 / 查看）',
    site: '站点管理（本地命令，不发请求）',
    auth: '登录 / 登录状态 / 登出（豆包 CLI 连接器契约命令）',
    spaces: 'space 列表与搜索',
    explores: '表（explore）列表与详情',
    fields: '字段搜索',
    values: '字段去重取值',
    query: '查数（语义化 / 实验性 flat）',
    dashboards: '看板（列表 / 搜索 / 磁贴 / 执行 / 定义）',
    charts: '图表（列表 / 搜索 / 详情 / 执行）',
    doctor: '本地自检与远程连通验证',
    tools: 'MCP 工具目录（tools/list）',
};

/** spec.name → commander 别名（dashboards get 的 code 别名） */
const COMMAND_ALIASES: Record<string, string> = {
    'dashboards get <dashboardUuid>': 'code',
};

/** 挂载树节点：path 上无 spec 的中间命令（如 dashboards）只承载子命令 */
type MountNode = {
    command: Command;
    children: Map<string, MountNode>;
    spec: CommandSpec | null;
    positionalTokens: string[];
};

const isPositionalToken = (token: string): boolean =>
    token.startsWith('<') || token.startsWith('[');

/** '--timeout <ms>' → '--timeout'（用于重复 flag 检测） */
const longFlagOf = (flags: string): string | null => {
    const long = flags
        .split(/[ ,]+/)
        .find((token) => token.startsWith('--'));
    return long === undefined ? null : long;
};

const str = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

/** 环境变量直连凭证（设计稿 §4.3：MSY_X_ACCESS_TOKEN / MSY_X_PAT 覆盖文件） */
const resolveCredentials = (
    site: SiteProfile,
    config: CliConfig,
    env: Record<string, string | undefined>,
): AuthCredentials | null => {
    const accessToken = str(env.MSY_X_ACCESS_TOKEN);
    if (accessToken !== null) {
        // CI 直连：无 refresh token，按 1h 有效期处理（401 重试不触发清盘刷新）
        return {
            mode: 'oauth',
            clientId: '',
            clientSecret: null,
            redirectUri: '',
            accessToken,
            accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            refreshToken: null,
            scope: 'mcp:read',
        };
    }
    const pat = str(env.MSY_X_PAT);
    if (pat !== null) {
        return { mode: 'pat', pat };
    }
    return config.auth[site.name] ?? null;
};

/** 沿父链收集祖先（含根 program）的选项；全局选项可出现在子命令前或后 */
const ancestorOptsOf = (cmd: Command): Record<string, unknown> => {
    const collected: Array<Record<string, unknown>> = [];
    let current: Command | null = cmd.parent;
    while (current !== null) {
        collected.unshift(current.opts());
        current = current.parent;
    }
    return Object.assign({}, ...collected);
};

/**
 * 本地凭证命令的子命令解析：规范形式 `auth login|status|logout`，
 * 顶层 `login` / `logout` 是别名（共用同一 runner，避免两套语义）。
 */
export const resolveAuthSub = (
    specName: string,
): 'login' | 'status' | 'logout' | null => {
    if (specName === 'login' || specName === 'logout') return specName;
    if (specName.startsWith('auth ')) {
        const sub = specName.split(' ')[1];
        if (sub === 'login' || sub === 'status' || sub === 'logout') {
            return sub;
        }
    }
    return null;
};

const buildContext = async (
    cmd: Command,
    dataCommand: boolean,
): Promise<CommandContext> => {
    // 叶子命令自身的选项优先于根 program 上同名选项（如 auth login --timeout）
    const mergedOpts = {
        ...ancestorOptsOf(cmd),
        ...(cmd.opts() as Record<string, unknown>),
    };
    const options = parseGlobalOptions({
        opts: mergedOpts,
        dataCommand,
        env: process.env,
    });
    setQuiet(options.quiet);
    // doctor 等不走 runToolCommand 的路径也要点亮 --verbose（D10）
    setVerbose(options.verbose);
    // --config 覆盖：config/* 全部通过 env.MSY_X_CONFIG 定位文件（paths.ts）
    if (options.configPath !== null) {
        process.env.MSY_X_CONFIG = options.configPath;
    }
    const config = await readConfig();
    const site = resolveSite({ options, config, env: process.env });
    const credentials = resolveCredentials(site, config, process.env);
    const format =
        options.format ?? (process.stdout.isTTY === true ? 'table' : 'json');
    return { options, site, credentials, format, startedAt: performance.now() };
};

/**
 * doctor 专用降级上下文：buildContext 因 CliError CONFIG（坏 YAML / 未知站点名）
 * 失败时使用。site 用占位（runDoctor 的 site-resolution 检查会真正报错因），
 * credentials 置 null；全局选项照常解析（--json / --config / --quiet 仍生效）。
 */
const buildDegradedDoctorContext = async (cmd: Command): Promise<CommandContext> => {
    const mergedOpts = {
        ...ancestorOptsOf(cmd),
        ...(cmd.opts() as Record<string, unknown>),
    };
    const options = parseGlobalOptions({
        opts: mergedOpts,
        dataCommand: false,
        env: process.env,
    });
    setQuiet(options.quiet);
    setVerbose(options.verbose);
    if (options.configPath !== null) {
        process.env.MSY_X_CONFIG = options.configPath;
    }
    return {
        options,
        site: {
            name: '(未解析)',
            mcpUrl: '',
            authMode: 'oauth',
            authHeader: 'authorization',
        },
        credentials: null,
        format: options.format ?? (process.stdout.isTTY === true ? 'table' : 'json'),
        startedAt: performance.now(),
    };
};

/* ------------------------------------------------------------------ */
/* query --file：读盘 / stdin + 本地翻译（v2 不收 metricQuery）          */
/* ------------------------------------------------------------------ */

const QUERY_FLAG_KEYS = [
    'explore',
    'dimensions',
    'metrics',
    'filter',
    'filtersJson',
    'limit',
    'valueFormat',
    'dashboard',
] as const;

const readQueryFile = async (file: string): Promise<string> => {
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        throw new CliError({
            code: 'USAGE',
            message: `无法读取文件：${file}`,
            cause: error,
        });
    }
};

const readQueryStdin = async (): Promise<string> => {
    if (process.stdin.isTTY === true) {
        throw new CliError({
            code: 'USAGE',
            message: '--file - 仅在 stdin 非 TTY（管道输入）时可用',
            hint: '例如 cat metric-query.json | msy-x query --file -',
        });
    }
    const piped = await readStdinIfPiped();
    if (piped === null || piped.trim() === '') {
        throw new CliError({
            code: 'USAGE',
            message: 'stdin 没有可读内容（--file -）',
            hint: '用管道传入 metricQuery JSON，或改用 --file <path>',
        });
    }
    return piped;
};

const runQueryFile = async (
    opts: Record<string, unknown>,
    ctx: CommandContext,
): Promise<void> => {
    const conflicting = QUERY_FLAG_KEYS.filter((key) => {
        const value = opts[key];
        if (value === undefined || value === false) return false;
        if (typeof value === 'string') return value.trim() !== '';
        return true;
    });
    if (conflicting.length > 0) {
        throw new CliError({
            code: 'USAGE',
            message: `--file 与其他查询参数互斥（检测到：${conflicting.join(', ')}）`,
            hint: '--file 直接翻译文件内容；要改参数请编辑文件，或改用 flags 形式',
        });
    }
    const file = str(opts.file);
    if (file === null) {
        throw new CliError({ code: 'USAGE', message: '--file 缺少路径参数' });
    }
    const text = file === '-' ? await readQueryStdin() : await readQueryFile(file);
    const { calls, warnings } = buildQueryFileCalls(text, ctx.options.projectUuid);
    for (const warning of warnings) {
        logWarn(warning);
    }
    await runToolCommand(calls, ctx);
};

/* ------------------------------------------------------------------ */
/* 分发                                                                */
/* ------------------------------------------------------------------ */

/** 服务端 pageSize 上限（与各命令文件内的 MAX_PAGE_SIZE 一致） */
const PAGE_SIZE_LIMIT = 100;

/** D9：--page-size 超过上限时 build 已本地截断，stderr 告警（--quiet 关闭） */
const warnPageSizeTruncation = (
    opts: Record<string, unknown>,
    ctx: CommandContext,
): void => {
    if (ctx.options.quiet) return;
    const raw = str(opts.pageSize);
    if (raw === null) return;
    const requested = Number(raw);
    if (!Number.isInteger(requested) || requested <= PAGE_SIZE_LIMIT) return;
    logWarn(
        `--page-size ${requested} 超过服务端上限 ${PAGE_SIZE_LIMIT}，已本地截断为 ${PAGE_SIZE_LIMIT}`,
    );
};

const dispatch = async (
    spec: CommandSpec,
    cmd: Command,
    positional: Record<string, string | undefined>,
): Promise<void> => {
    const opts = cmd.opts() as Record<string, unknown>;

    // doctor：配置损坏（buildContext 护 CliError CONFIG）不能阻断自检本身，
    // 降级为占位上下文，交给 runDoctor 逐条报告（exit 2 / stderr 单行 JSON）
    if (spec.name === 'doctor') {
        let ctx: CommandContext;
        try {
            ctx = await buildContext(cmd, spec.dataCommand);
        } catch (error) {
            if (error instanceof CliError && error.code === 'CONFIG') {
                ctx = await buildDegradedDoctorContext(cmd);
            } else {
                throw error;
            }
        }
        const result = await runDoctor({ remote: opts.remote === true }, ctx);
        process.stdout.write(result.stdout);
        if (result.error !== null) {
            throw new CliError({ ...result.error, exitCode: result.exitCode });
        }
        return;
    }

    const ctx = await buildContext(cmd, spec.dataCommand);

    // 本地命令与专门通道（不走 spec.build 的 ToolCall 管道）
    const authSub = resolveAuthSub(spec.name);
    if (authSub !== null) {
        // --dry-run 对本地凭证命令没有意义，直接拒绝而不是静默真的写盘
        if (ctx.options.dryRun) {
            throw new CliError({
                code: 'USAGE',
                message: `msy-x ${spec.name} 不支持 --dry-run（本地凭证命令）`,
                hint: '要看将执行什么，直接运行不带 --dry-run 的命令；--dry-run 只用于工具调用类命令',
            });
        }
        const sub = authSub;
        const result = await runAuthCommand(
            sub,
            {
                token: str(opts.token) ?? undefined,
                timeoutMs:
                    str(opts.timeout) !== null
                        ? Number(str(opts.timeout))
                        : undefined,
                noBrowser: readNoBrowser(opts),
                qr: opts.qr === true,
            },
            ctx,
        );
        process.stdout.write(result.stdout);
        return;
    }

    if (
        spec.name === 'site list' ||
        spec.name === 'site show' ||
        spec.name === 'site use <name>'
    ) {
        const sub = spec.name.split(' ')[1] as 'list' | 'show' | 'use';
        const result = await runSiteCommand(sub, { name: positional.name });
        process.stdout.write(result.stdout);
        return;
    }

    if (spec.name === 'tools list' || spec.name === 'tools describe <name>') {
        await runToolsCommand({
            sub: spec.name === 'tools list' ? 'list' : 'describe',
            name: positional.name,
            verbose: opts.verbose === true,
            ctx,
        });
        return;
    }

    if (spec.name === 'call <tool>') {
        await runCallCommand({
            tool: positional.tool ?? '',
            argsJson: str(opts.args) ?? undefined,
            file: str(opts.file) ?? undefined,
            ctx,
        });
        return;
    }

    // query --file：需读盘/stdin 且翻译告警走 stderr
    if (spec.name === 'query' && str(opts.file) !== null) {
        await runQueryFile(opts, ctx);
        return;
    }

    const input: CommandBuildInput = {
        args: positional,
        // 运行时含 commander 收集的数组（可重复 flag 如 --filter），由各 build 自行归一化
        options: opts as Record<string, string | boolean | undefined>,
        projectUuid: ctx.options.projectUuid,
    };
    const calls = spec.build(input);

    // D9：--page-size 超过服务端上限 100 → build 已本地截断，stderr 告警
    // （--quiet 关闭）；覆盖 search/explores/spaces/dashboards/charts
    warnPageSizeTruncation(opts, ctx);

    // dashboards run --tile：服务端仍跑整板，CLI 只在渲染前过滤磁贴
    if (spec.name === 'dashboards run <dashboardUuid>') {
        const tile = str(opts.tile);
        if (tile !== null) {
            logInfo(DASHBOARDS_TILE_NOTICE);
            await runToolCommand(calls, ctx, {
                transformResult: (result) => filterDashboardTiles(result, tile),
            });
            return;
        }
    }

    await runToolCommand(calls, ctx);
};

/* ------------------------------------------------------------------ */
/* commander 装配                                                       */
/* ------------------------------------------------------------------ */

/** spec.name 里的位置参数名（'<dashboardUuid>' / '[topic]' → 原名） */
const positionalNamesOf = (specName: string): string[] =>
    specName
        .split(/\s+/)
        .filter((token) => token.startsWith('<') || token.startsWith('['))
        .map((token) => token.replace(/[<>[\]]/g, ''));

const makeAction =
    (spec: CommandSpec) =>
    async (...actionArgs: unknown[]): Promise<void> => {
        const cmd = actionArgs[actionArgs.length - 1] as Command;
        // cmd.args：commander 解析后该命令的位置参数值（与声明顺序一致）
        const positionalValues = (cmd.args as unknown[]).map((value) =>
            typeof value === 'string' ? value : undefined,
        );
        const positional: Record<string, string | undefined> = {};
        positionalNamesOf(spec.name).forEach((name, index) => {
            positional[name] = positionalValues[index];
        });
        await dispatch(spec, cmd, positional);
    };

const ALL_SPECS: CommandSpec[] = [
    ...infoCommands,
    ...accessCommands,
    ...projectCommands,
    ...siteCommands,
    ...authCommands,
    ...searchCommands,
    ...spacesCommands,
    ...exploresCommands,
    ...fieldsCommands,
    ...valuesCommands,
    ...queryCommands,
    ...dashboardsCommands,
    ...chartsCommands,
    ...docsCommands,
    ...doctorCommands,
    ...toolsCommands,
    ...callCommands,
];

/** 供映射完整性断言：全部已挂载的 CommandSpec */
export const registeredSpecs = (): CommandSpec[] => [...ALL_SPECS];

export const registerCommands = (program: Command): void => {
    const root: MountNode = {
        command: program,
        children: new Map(),
        spec: null,
        positionalTokens: [],
    };

    const ensurePath = (tokens: string[]): MountNode => {
        let node = root;
        for (const token of tokens) {
            let child = node.children.get(token);
            if (child === undefined) {
                // 注意：.command(name, desc) 两参形式会标记为外部可执行并返回父命令，
                // 这里必须用单参形式再 .description()
                const sub = node.command.command(token);
                sub.description(GROUP_DESCRIPTIONS[token] ?? `${token} 相关命令`);
                child = {
                    command: sub,
                    children: new Map(),
                    spec: null,
                    positionalTokens: [],
                };
                node.children.set(token, child);
            }
            node = child;
        }
        return node;
    };

    for (const spec of ALL_SPECS) {
        const tokens = spec.name.split(/\s+/);
        const pathTokens = tokens.filter((token) => !isPositionalToken(token));
        const positionalTokens = tokens.filter(isPositionalToken);
        const node = ensurePath(pathTokens);
        if (node.spec !== null) {
            throw new Error(`命令重复注册：${spec.name}`);
        }
        node.spec = spec;
        node.positionalTokens = positionalTokens;
    }

    const mount = (node: MountNode): void => {
        const { spec, command, positionalTokens } = node;
        if (spec !== null) {
            // 纯叶子命令（无子命令）用 spec 自身描述；
            // 兼具子命令的（如 query 之于 query flat）保留分组描述
            if (node.children.size === 0) {
                command.description(spec.description);
            }
            for (const token of positionalTokens) {
                command.argument(token, token.replace(/[<[\]>]/g, ''));
            }
            for (const option of spec.options) {
                if (option.defaultValue !== undefined) {
                    command.option(option.flags, option.description, option.defaultValue);
                } else {
                    command.option(option.flags, option.description);
                }
            }
            // 全局选项挂到每个叶子命令（与命令自身选项重名时以命令为准，如 auth login --timeout）
            const ownLongFlags = new Set(
                spec.options
                    .map((option) => longFlagOf(option.flags))
                    .filter((flag): flag is string => flag !== null),
            );
            for (const global of GLOBAL_FLAG_SPECS) {
                const long = longFlagOf(global.flags);
                if (long === null || !ownLongFlags.has(long)) {
                    command.option(global.flags, global.description);
                }
            }
            command.addHelpText('after', `\n示例:\n  ${spec.example}`);
            const alias = COMMAND_ALIASES[spec.name];
            if (alias !== undefined) {
                command.alias(alias);
            }
            command.action(makeAction(spec));
        }
        for (const child of node.children.values()) {
            mount(child);
        }
    };

    for (const child of root.children.values()) {
        mount(child);
    }

    // 根 program 也挂全局选项：允许 `msy-x --dry-run query …` 把全局选项放在子命令前；
    // 值解析时与叶子命令选项合并（ancestorOptsOf）
    for (const global of GLOBAL_FLAG_SPECS) {
        program.option(global.flags, global.description);
    }
};
