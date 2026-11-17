import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CliError } from '../cli/errors';
import type {
    AuthCredentials,
    CommandContext,
    GlobalOptions,
    McpClient,
    OutputFormat,
    ToolDescriptor,
    ToolResult,
} from '../types';
import {
    DOCTOR_PROBE_CALL,
    EXPECTED_MCP_TOOL_NAMES,
    doctorCommands,
    runDoctor,
} from './doctor';

/**
 * `msy-x doctor` 单测（设计稿 §5.3/§10.4，dev-plan P0-8）：
 * 本地全 ok / 权限位异常 warn / 坏配置 fail(2) / 未登录 --remote → 3 /
 * tools 数量不符 warn / Invalid literal value → 5 / 业务错误 → ok /
 * 网络 → 6 / --json 形状（全部注入假实现与临时目录，不联网）。
 */

const NOW = new Date('2026-06-01T00:00:00.000Z');

const OAUTH_CREDENTIALS: AuthCredentials = {
    mode: 'oauth',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://127.0.0.1:1234/callback',
    accessToken: 'access-token-value-never-printed',
    accessExpiresAt: '2026-06-01T01:00:00.000Z',
    refreshToken: 'refresh-token-value-never-printed',
    scope: 'mcp:read',
};

const baseOptions: GlobalOptions = {
    site: null,
    projectUuid: null,
    format: null,
    envelope: false,
    out: null,
    timeoutMs: 5000,
    mcpUrl: null,
    authHeader: null,
    configPath: null,
    dryRun: false,
    raw: false,
    verbose: false,
    quiet: true,
};

const makeCtx = (overrides: {
    options?: Partial<GlobalOptions>;
    credentials?: AuthCredentials | null;
    /** 已解析的输出格式（D6：runDoctor 读 ctx.format 而非 options.format） */
    format?: OutputFormat;
} = {}): CommandContext => ({
    options: { ...baseOptions, ...overrides.options },
    site: {
        name: 'x',
        mcpUrl: 'https://x.invalid.test/api/v1/mcp',
        authMode: 'oauth',
        authHeader: 'authorization',
    },
    credentials: overrides.credentials === undefined ? OAUTH_CREDENTIALS : overrides.credentials,
    format: overrides.format ?? 'table',
    startedAt: performance.now(),
});

/** 临时配置文件（0700 目录 + 0600 文件 + 合法 YAML） */
const makeConfigEnv = async (): Promise<Record<string, string>> => {
    const dir = await mkdtemp(path.join(tmpdir(), 'msy-x-doctor-'));
    await chmod(dir, 0o700);
    const file = path.join(dir, 'config.yaml');
    await writeFile(
        file,
        [
            'currentSite: x',
            'sites:',
            '  x:',
            '    mcpUrl: https://x.invalid.test/api/v1/mcp',
            '    authMode: oauth',
            '    authHeader: authorization',
            'auth: {}',
            '',
        ].join('\n'),
        'utf8',
    );
    await chmod(file, 0o600);
    return { MSY_X_CONFIG: file };
};

const localDeps = (env: Record<string, string>) => ({
    env,
    nodeVersion: 'v22.12.0',
    platform: 'linux' as NodeJS.Platform,
    now: () => NOW,
});

const parseLines = (stdout: string): Array<{ status: string; name: string; detail: string }> =>
    stdout
        .trim()
        .split('\n')
        .map((line) => {
            const match = /^\[(ok|warn|fail)\] (\S+) — (.*)$/.exec(line);
            assert.ok(match !== null, `doctor 输出行形状不符：${line}`);
            return { status: match[1] as string, name: match[2], detail: match[3] };
        });

const byName = (
    lines: ReturnType<typeof parseLines>,
    name: string,
): { status: string; detail: string } => {
    const found = lines.find((line) => line.name === name);
    assert.ok(found !== undefined, `缺少检查项 ${name}：${JSON.stringify(lines)}`);
    return found;
};

/* ------------------------------------------------------------------ */
/* spec                                                                */
/* ------------------------------------------------------------------ */

test('doctor spec：单命令、--remote flag、build 抛 NOT_IMPLEMENTED', () => {
    assert.equal(doctorCommands.length, 1);
    const spec = doctorCommands[0];
    assert.ok(spec !== undefined);
    assert.equal(spec.name, 'doctor');
    assert.deepEqual(
        spec.options.map((option) => option.flags),
        ['--remote'],
    );
    assert.equal(spec.dataCommand, false);
    assert.throws(
        () => spec.build({ args: {}, options: {}, projectUuid: null }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.code, 'NOT_IMPLEMENTED');
            return true;
        },
    );
});

test('EXPECTED_MCP_TOOL_NAMES 共 26 个且与探测工具一致', () => {
    assert.equal(EXPECTED_MCP_TOOL_NAMES.length, 26);
    assert.ok(EXPECTED_MCP_TOOL_NAMES.includes('list_verified_content'));
    assert.ok(EXPECTED_MCP_TOOL_NAMES.includes('run_metric_query'));
    assert.equal(DOCTOR_PROBE_CALL.tool, 'run_metric_query');
    assert.deepEqual(DOCTOR_PROBE_CALL.args, {
        vizConfig: {
            exploreName: '__msy_x_doctor_probe__',
            metrics: [],
            dimensions: [],
            sorts: [],
            limit: 1,
        },
    });
});

/* ------------------------------------------------------------------ */
/* 本地检查                                                            */
/* ------------------------------------------------------------------ */

test('doctor 本地全 ok：0700/0600、合法配置、未过期凭证 → 退出 0', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: false },
            makeCtx(),
            localDeps(env),
        );
        const lines = parseLines(result.stdout);
        assert.equal(byName(lines, 'node-version').status, 'ok');
        assert.equal(byName(lines, 'config-permissions').status, 'ok');
        assert.ok(
            byName(lines, 'config-permissions').detail.includes('0700'),
            '应报告目录权限位',
        );
        assert.ok(byName(lines, 'config-permissions').detail.includes('0600'));
        assert.equal(byName(lines, 'site-resolution').status, 'ok');
        assert.ok(byName(lines, 'site-resolution').detail.includes('x.invalid.test'));
        const credentials = byName(lines, 'credentials');
        assert.equal(credentials.status, 'ok');
        assert.ok(credentials.detail.includes('mode=oauth'));
        assert.ok(credentials.detail.includes('hasRefreshToken=true'));
        // 绝不打印 token 值
        assert.ok(!result.stdout.includes('access-token-value-never-printed'));
        assert.ok(!result.stdout.includes('refresh-token-value-never-printed'));
        assert.equal(result.exitCode, 0);
        assert.equal(result.error, null);
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor 权限位异常（0755/0644）→ config-permissions warn，整体仍退 0', async () => {
    const env = await makeConfigEnv();
    const file = env.MSY_X_CONFIG as string;
    const dir = path.dirname(file);
    try {
        await chmod(dir, 0o755);
        await chmod(file, 0o644);
        const result = await runDoctor(
            { remote: false },
            makeCtx(),
            localDeps(env),
        );
        const lines = parseLines(result.stdout);
        const perms = byName(lines, 'config-permissions');
        assert.equal(perms.status, 'warn');
        assert.ok(perms.detail.includes('0755'));
        assert.ok(perms.detail.includes('0644'));
        assert.equal(result.exitCode, 0, '仅 warn 应退 0');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('doctor win32：权限位检查降级为 warn 并提示 MSY_X_CONFIG', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: false },
            makeCtx(),
            { ...localDeps(env), platform: 'win32' },
        );
        const perms = byName(parseLines(result.stdout), 'config-permissions');
        assert.equal(perms.status, 'warn');
        assert.ok(perms.detail.includes('MSY_X_CONFIG'));
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor 坏 YAML → site-resolution fail、退 2、error 摘要 CONFIG', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'msy-x-doctor-bad-'));
    const file = path.join(dir, 'config.yaml');
    await writeFile(file, 'currentSite: [unclosed', 'utf8');
    try {
        const result = await runDoctor(
            { remote: false },
            makeCtx(),
            localDeps({ MSY_X_CONFIG: file }),
        );
        const lines = parseLines(result.stdout);
        const site = byName(lines, 'site-resolution');
        assert.equal(site.status, 'fail');
        assert.ok(site.detail.includes('YAML'));
        assert.equal(result.exitCode, 2);
        assert.equal(result.error?.code, 'CONFIG');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('doctor 无凭证 → credentials warn（本地模式不退 3）', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: false },
            makeCtx({ credentials: null }),
            localDeps(env),
        );
        const credentials = byName(parseLines(result.stdout), 'credentials');
        assert.equal(credentials.status, 'warn');
        assert.ok(credentials.detail.includes('auth login'));
        assert.equal(result.exitCode, 0);
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor Node < 20 → node-version fail、退 2', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: false },
            makeCtx(),
            { ...localDeps(env), nodeVersion: 'v18.20.4' },
        );
        assert.equal(byName(parseLines(result.stdout), 'node-version').status, 'fail');
        assert.equal(result.exitCode, 2);
        assert.equal(result.error?.code, 'CONFIG');
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

/* ------------------------------------------------------------------ */
/* 输出格式（D6/T8：读已解析的 ctx.format，非 TTY 默认 JSON 同口径）      */
/* ------------------------------------------------------------------ */

test('D6/T8：runDoctor 读已解析的 ctx.format（options.format 为 null 也输出 JSON）', async () => {
    const env = await makeConfigEnv();
    try {
        // options.format 为 null（未显式给 --json），但解析后的 ctx.format=json
        // （非 TTY 默认）→ 必须输出 JSON；旧实现读 options.format 会误出文本行
        const ctx = makeCtx({ format: 'json' });
        assert.equal(ctx.options.format, null, '前置：未显式指定 --json');
        const result = await runDoctor({ remote: false }, ctx, localDeps(env));
        const payload = JSON.parse(result.stdout) as { ok: boolean };
        assert.equal(payload.ok, true);
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor ctx.format=table：输出逐行 [status] 文本（TTY 默认）', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: false },
            makeCtx({ format: 'table' }),
            localDeps(env),
        );
        assert.match(result.stdout, /^\[ok\] node-version — /);
        assert.ok(!result.stdout.startsWith('{'));
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor --json：输出 { ok, checks } 且 ok=false 时含 fail 项', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: false },
            makeCtx({ options: { format: 'json' }, format: 'json' }),
            localDeps(env),
        );
        const payload = JSON.parse(result.stdout) as {
            ok: boolean;
            checks: Array<{ name: string; status: string; detail: string }>;
        };
        assert.equal(typeof payload.ok, 'boolean');
        assert.ok(Array.isArray(payload.checks));
        assert.ok(payload.checks.length >= 4);
        assert.equal(payload.ok, true, '全 ok 时 ok=true');
        for (const item of payload.checks) {
            assert.deepEqual(Object.keys(item).sort(), ['detail', 'name', 'status']);
            assert.ok(['ok', 'warn', 'fail'].includes(item.status));
        }
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

/* ------------------------------------------------------------------ */
/* --remote（注入假 client，不联网）                                    */
/* ------------------------------------------------------------------ */

const toolDescriptor = (name: string): ToolDescriptor => ({
    name,
    description: null,
    inputSchema: {},
});

const fakeCatalogClient = (overrides: {
    tools?: ToolDescriptor[];
    probeResult?: ToolResult;
    probeError?: Error;
} = {}): { client: McpClient; closes: number } => {
    const state = { closes: 0 };
    const client: McpClient = {
        listTools: async () =>
            overrides.tools ?? EXPECTED_MCP_TOOL_NAMES.map(toolDescriptor),
        callTool: async () => {
            if (overrides.probeError !== undefined) {
                throw overrides.probeError;
            }
            return (
                overrides.probeResult ?? {
                    content: [{ type: 'text', text: 'probe ok' }],
                    isError: false,
                }
            );
        },
        close: async () => {
            state.closes += 1;
        },
    };
    return { client, closes: state.closes };
};

const businessErrorResult = (text: string): ToolResult => ({
    content: [{ type: 'text', text }],
    isError: true,
});

test('doctor --remote 未登录 → remote-auth fail + auth login hint、退 3、不建连', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: true },
            makeCtx({ credentials: null }),
            {
                ...localDeps(env),
                createClient: async () => {
                    throw new Error('未登录时不应创建客户端');
                },
            },
        );
        const lines = parseLines(result.stdout);
        const remoteAuth = byName(lines, 'remote-auth');
        assert.equal(remoteAuth.status, 'fail');
        assert.ok(remoteAuth.detail.includes('auth login'));
        assert.ok(!lines.some((line) => line.name === 'tools-catalog'), '未登录应跳过后续远程检查');
        assert.equal(result.exitCode, 3);
        assert.equal(result.error?.code, 'AUTH_REQUIRED');
        assert.equal(result.error?.hint, '运行 msy-x auth login 重新登录');
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor --remote：26 个工具 + 探测业务错误 → tools-catalog ok、capability-probe ok、退 0', async () => {
    const env = await makeConfigEnv();
    const fake = fakeCatalogClient({
        probeResult: businessErrorResult(
            'Not found: explore __msy_x_doctor_probe__ does not exist',
        ),
    });
    try {
        const result = await runDoctor(
            { remote: true },
            makeCtx(),
            { ...localDeps(env), createClient: async () => fake.client },
        );
        const lines = parseLines(result.stdout);
        assert.equal(byName(lines, 'remote-auth').status, 'ok');
        assert.equal(byName(lines, 'tools-catalog').status, 'ok');
        const probe = byName(lines, 'capability-probe');
        assert.equal(probe.status, 'ok');
        assert.ok(probe.detail.includes('判别键修复已就绪'));
        assert.ok(probe.detail.includes('业务错误'));
        assert.equal(result.exitCode, 0);
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor --remote：tools 数量/名单不符 → warn 并列出新增/缺失', async () => {
    const env = await makeConfigEnv();
    const names = [
        ...EXPECTED_MCP_TOOL_NAMES.filter((name) => name !== 'find_content'),
        'extra_new_tool',
    ];
    const fake = fakeCatalogClient({
        tools: names.map(toolDescriptor),
        probeResult: businessErrorResult('Forbidden: no access to explore'),
    });
    try {
        const result = await runDoctor(
            { remote: true },
            makeCtx(),
            { ...localDeps(env), createClient: async () => fake.client },
        );
        const catalog = byName(parseLines(result.stdout), 'tools-catalog');
        assert.equal(catalog.status, 'warn');
        assert.ok(catalog.detail.includes('26 个'), `应报告实际数量：${catalog.detail}`);
        assert.ok(catalog.detail.includes('extra_new_tool'), `应列新增：${catalog.detail}`);
        assert.ok(catalog.detail.includes('find_content'), `应列缺失：${catalog.detail}`);
        assert.equal(result.exitCode, 0, 'warn 不影响退出码');
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor --remote：Invalid literal value → capability-probe fail、退 5', async () => {
    const env = await makeConfigEnv();
    const fake = fakeCatalogClient({
        probeResult: businessErrorResult(
            'Invalid literal value, expected "run_metric_query"',
        ),
    });
    try {
        const result = await runDoctor(
            { remote: true },
            makeCtx(),
            { ...localDeps(env), createClient: async () => fake.client },
        );
        const probe = byName(parseLines(result.stdout), 'capability-probe');
        assert.equal(probe.status, 'fail');
        assert.ok(probe.detail.includes('判别键修复'));
        assert.ok(probe.detail.includes('run_metric_query / search_field_values'));
        assert.ok(probe.detail.includes('升级主站'));
        assert.equal(result.exitCode, 5);
        assert.equal(result.error?.code, 'SERVER_ERROR');
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor --remote：探测工具不存在 → capability-probe warn（不声称已就绪）', async () => {
    const env = await makeConfigEnv();
    const fake = fakeCatalogClient({
        probeResult: businessErrorResult('MCP error -32603: Tool run_metric_query not found'),
    });
    try {
        const result = await runDoctor(
            { remote: true },
            makeCtx(),
            { ...localDeps(env), createClient: async () => fake.client },
        );
        const probe = byName(parseLines(result.stdout), 'capability-probe');
        assert.equal(probe.status, 'warn');
        assert.ok(probe.detail.includes('未暴露 run_metric_query'));
        assert.equal(result.exitCode, 0);
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor --remote：403/看板门控类业务错误 → capability-probe ok', async () => {
    const env = await makeConfigEnv();
    const forbidden = new CliError({
        code: 'FORBIDDEN',
        message: '没有权限执行该操作：dashboard gate',
    });
    const fake = fakeCatalogClient({ probeError: forbidden });
    try {
        const result = await runDoctor(
            { remote: true },
            makeCtx(),
            { ...localDeps(env), createClient: async () => fake.client },
        );
        const probe = byName(parseLines(result.stdout), 'capability-probe');
        assert.equal(probe.status, 'ok');
        assert.equal(result.exitCode, 0);
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});

test('doctor --remote：网络不可达 → remote-connect fail、退 6', async () => {
    const env = await makeConfigEnv();
    try {
        const result = await runDoctor(
            { remote: true },
            makeCtx(),
            {
                ...localDeps(env),
                createClient: async () => {
                    throw new CliError({
                        code: 'NETWORK',
                        message: '网络错误或连接失败：fetch failed',
                        hint: '检查网络与站点地址',
                    });
                },
            },
        );
        const remoteConnect = byName(parseLines(result.stdout), 'remote-connect');
        assert.equal(remoteConnect.status, 'fail');
        assert.ok(!parseLines(result.stdout).some((line) => line.name === 'tools-catalog'));
        assert.equal(result.exitCode, 6);
        assert.equal(result.error?.code, 'NETWORK');
    } finally {
        await rm(path.dirname(env.MSY_X_CONFIG as string), { recursive: true, force: true });
    }
});
