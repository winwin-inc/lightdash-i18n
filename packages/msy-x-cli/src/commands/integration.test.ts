import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm as rmDir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { CliError } from '../cli/errors';
import {
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    parseGlobalOptions,
} from '../cli/globalOptions';
import { runToolCommand } from '../cli/run';
import type {
    CommandBuildInput,
    CommandContext,
    CommandSpec,
    GlobalOptions,
    McpClient,
    ToolCall,
    ToolResult,
} from '../types';
import { registeredSpecs, registerCommands } from './index';
import { buildQueryFileCalls, queryCommands, translateMetricQuery } from './query';
import { dashboardsCommands } from './dashboards';
import { chartsCommands } from './charts';
import { docsCommands } from './docs';

/**
 * 集成层单测（设计稿 §6.2/§6.3/§7.4 验收口径）：
 * globalOptions 互斥/上限/--csv 门控、query 两路径组装、metricQuery 本地翻译、
 * flat vizConfig 形状与 --filter 拒绝、savedChartUuid 键名、dashboards list 缺
 * --space、dry-run 不发请求（假 client 断言未调用）、
 * verified/doctor 新命令的注册与端到端路由。
 */

const UUID = '3f5d1b0e-1111-4222-8333-444455556666';

const specByName = (specs: CommandSpec[], name: string): CommandSpec => {
    const spec = specs.find((candidate) => candidate.name === name);
    assert.ok(spec, `未找到命令 ${name}`);
    return spec;
};

const input = (partial: Partial<CommandBuildInput>): CommandBuildInput => ({
    args: {},
    options: {},
    projectUuid: null,
    ...partial,
});

/**
 * 可重复 flag（commander 收集为 string[]）的运行时形态超出
 * CommandBuildInput.options 的声明类型，测试里显式收窄传入。
 * 例：...repeatable('filter', ['period=2026Q2'])
 */
const repeatable = (key: string, value: string[]): Record<string, string> =>
    ({ [key]: value }) as unknown as Record<string, string>;

const buildOne = (
    spec: CommandSpec,
    partial: Partial<CommandBuildInput>,
): ToolCall => {
    const calls = spec.build(input(partial));
    assert.equal(calls.length, 1, `${spec.name} 应只产出 1 条 ToolCall`);
    return calls[0] as ToolCall;
};

const assertUsage = (
    fn: () => unknown,
    messageIncludes?: string,
): void => {
    assert.throws(fn, (error: unknown) => {
        assert.ok(error instanceof CliError, '应抛出 CliError');
        assert.equal(error.code, 'USAGE');
        if (messageIncludes !== undefined) {
            const text = `${error.message} ${error.hint ?? ''}`;
            assert.ok(
                text.includes(messageIncludes),
                `错误信息应包含「${messageIncludes}」，实际：${text}`,
            );
        }
        return true;
    });
};

/* ------------------------------------------------------------------ */
/* globalOptions：互斥 / 上限 / --csv 门控                              */
/* ------------------------------------------------------------------ */

test('globalOptions：--json/--table/--csv 互斥', () => {
    assertUsage(() =>
        parseGlobalOptions({
            opts: { json: true, table: true },
            dataCommand: false,
            env: {},
        }),
    );
    assertUsage(() =>
        parseGlobalOptions({
            opts: { json: true, csv: true },
            dataCommand: true,
            env: {},
        }),
    );
    assert.equal(
        parseGlobalOptions({ opts: { json: true }, dataCommand: false, env: {} })
            .format,
        'json',
    );
});

test('globalOptions：--csv 仅数据类命令可用', () => {
    assertUsage(() =>
        parseGlobalOptions({
            opts: { csv: true },
            dataCommand: false,
            env: {},
        }),
        '数据类命令',
    );
    assert.equal(
        parseGlobalOptions({ opts: { csv: true }, dataCommand: true, env: {} })
            .format,
        'csv',
    );
});

test('globalOptions：timeout 默认/env/上限/非法值', () => {
    const base = { opts: {}, dataCommand: false } as const;
    assert.equal(
        parseGlobalOptions({ ...base, env: {} }).timeoutMs,
        DEFAULT_TIMEOUT_MS,
    );
    assert.equal(
        parseGlobalOptions({ ...base, env: { MSY_X_TIMEOUT_MS: '1200' } })
            .timeoutMs,
        1200,
    );
    // 上限 600000：超过截断
    assert.equal(
        parseGlobalOptions({
            opts: { timeout: '99999999' },
            dataCommand: false,
            env: {},
        }).timeoutMs,
        MAX_TIMEOUT_MS,
    );
    assert.equal(
        parseGlobalOptions({
            opts: { timeout: '300000' },
            dataCommand: false,
            env: {},
        }).timeoutMs,
        300000,
    );
    assertUsage(() =>
        parseGlobalOptions({
            opts: { timeout: 'abc' },
            dataCommand: false,
            env: {},
        }),
    );
});

test('globalOptions：--auth-header 取值域', () => {
    assert.equal(
        parseGlobalOptions({
            opts: { authHeader: 'x-api-key' },
            dataCommand: false,
            env: {},
        }).authHeader,
        'x-api-key',
    );
    assertUsage(() =>
        parseGlobalOptions({
            opts: { authHeader: 'bearer' },
            dataCommand: false,
            env: {},
        }),
    );
});

/* ------------------------------------------------------------------ */
/* query：flags 组装（run_semantic_metric_query）                        */
/* ------------------------------------------------------------------ */

test('query flags：验证命令逐字组装（含 --filter → filters.dimensions）', () => {
    const spec = specByName(queryCommands, 'query');
    const call = buildOne(spec, {
        options: {
            explore: 'pinleibaohsm_cls_top',
            dimensions: 'cls_4',
            metrics: 'total_cls4_amount',
            ...repeatable('filter', ['period=2026Q2']),
        },
    });
    assert.equal(call.tool, 'run_semantic_metric_query');
    assert.deepEqual(call.args, {
        exploreName: 'pinleibaohsm_cls_top',
        metrics: ['total_cls4_amount'],
        dimensions: ['cls_4'],
        filters: {
            dimensions: [
                { fieldId: 'period', operator: 'equals', values: ['2026Q2'] },
            ],
            metrics: [],
        },
    });
});

test('query flags：metrics 缺省补 []；多值 --filter 拆 values；--dashboard/--value-format/--limit', () => {
    const spec = specByName(queryCommands, 'query');
    const call = buildOne(spec, {
        options: {
            explore: 't',
            ...repeatable('filter', ['period=2026Q1,2026Q2', 'region_name=华南地区']),
            limit: '50',
            valueFormat: 'formatted',
            dashboard: UUID,
        },
        projectUuid: UUID,
    });
    assert.deepEqual(call.args, {
        exploreName: 't',
        metrics: [],
        filters: {
            dimensions: [
                {
                    fieldId: 'period',
                    operator: 'equals',
                    values: ['2026Q1', '2026Q2'],
                },
                { fieldId: 'region_name', operator: 'equals', values: ['华南地区'] },
            ],
            metrics: [],
        },
        limit: 50,
        valueFormat: 'formatted',
        dashboardUuid: UUID,
        projectUuid: UUID,
    });
    assertUsage(() => buildOne(spec, { options: { dimensions: 'a' } }));
    assertUsage(() =>
        buildOne(spec, {
            options: { explore: 't', valueFormat: 'pretty' },
        }),
    );
    assertUsage(() =>
        buildOne(spec, {
            options: { explore: 't', ...repeatable('filter', ['no-separator']) },
        }),
    );
});

test('query flags：--filters-json 原样并入 filters，与 --filter 合并', () => {
    const spec = specByName(queryCommands, 'query');
    const call = buildOne(spec, {
        options: {
            explore: 't',
            metrics: 'm',
            filtersJson:
                '{"metrics":[{"fieldId":"m","operator":"greaterThan","values":[10]}]}',
            ...repeatable('filter', ['period=2026Q2']),
        },
    });
    assert.deepEqual(call.args.filters, {
        metrics: [{ fieldId: 'm', operator: 'greaterThan', values: [10] }],
        dimensions: [
            { fieldId: 'period', operator: 'equals', values: ['2026Q2'] },
        ],
    });
});

/* ------------------------------------------------------------------ */
/* query --file：metricQuery 本地翻译                                    */
/* ------------------------------------------------------------------ */

const METRIC_QUERY_JSON = JSON.stringify({
    exploreName: 'pinleibaohsm_cls_top',
    dimensions: ['cls_4'],
    metrics: ['total_cls4_amount'],
    sorts: [{ fieldId: 'total_cls4_amount', descending: true }],
    limit: 500,
    tableCalculations: [{ name: 'share', sql: '${total}/100' }],
    customDimensions: [],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'r1',
                    target: { fieldId: 'period' },
                    operator: 'equals',
                    values: [{ value: '2026Q2' }],
                },
            ],
        },
    },
});

test('translateMetricQuery：完整翻译 + v2 不支持字段丢弃告警', () => {
    const { args, warnings } = translateMetricQuery(
        JSON.parse(METRIC_QUERY_JSON),
    );
    assert.deepEqual(args, {
        exploreName: 'pinleibaohsm_cls_top',
        metrics: ['total_cls4_amount'],
        dimensions: ['cls_4'],
        limit: 500,
        filters: {
            dimensions: [
                { fieldId: 'period', operator: 'equals', values: ['2026Q2'] },
            ],
            metrics: [],
        },
    });
    const warningText = warnings.join('\n');
    assert.ok(warningText.includes('sorts'), '应告警丢弃 sorts');
    assert.ok(warningText.includes('tableCalculations'), '应告警丢弃 tableCalculations');
    // customDimensions 值为空数组（null/undefined 才跳过），仍应告警
    assert.ok(warningText.includes('customDimensions'), '应告警丢弃 customDimensions');
});

test('translateMetricQuery：缺 exploreName → USAGE；非对象 → USAGE', () => {
    assertUsage(() => translateMetricQuery({ dimensions: ['a'] }));
    assertUsage(() => translateMetricQuery(['a']));
    assertUsage(() => translateMetricQuery('x'));
});

test('buildQueryFileCalls：文件文本 → run_semantic_metric_query ToolCall + 告警外抛', () => {
    const { calls, warnings } = buildQueryFileCalls(METRIC_QUERY_JSON, UUID);
    assert.equal(calls.length, 1);
    const call = calls[0] as ToolCall;
    assert.equal(call.tool, 'run_semantic_metric_query');
    assert.equal((call.args as { projectUuid?: string }).projectUuid, UUID);
    assert.equal((call.args as { exploreName: string }).exploreName, 'pinleibaohsm_cls_top');
    assert.ok(warnings.length > 0);
    assertUsage(() => buildQueryFileCalls('not-json', null));
});

/* ------------------------------------------------------------------ */
/* query flat：vizConfig 形状与 --filter 拒绝                            */
/* ------------------------------------------------------------------ */

test('query flat：vizConfig 必含 exploreName/metrics/dimensions/sorts/limit', () => {
    const spec = specByName(queryCommands, 'query flat');
    const call = buildOne(spec, {
        options: {
            explore: 'pinleibaohsm_cls_top',
            metrics: 'total_cls4_amount',
            dimensions: 'cls_4',
            ...repeatable('sort', ['total_cls4_amount:desc', 'cls_4']),
        },
    });
    assert.equal(call.tool, 'run_metric_query');
    assert.deepEqual(call.args, {
        vizConfig: {
            exploreName: 'pinleibaohsm_cls_top',
            metrics: ['total_cls4_amount'],
            dimensions: ['cls_4'],
            sorts: [
                { fieldId: 'total_cls4_amount', descending: true },
                { fieldId: 'cls_4', descending: false },
            ],
            limit: null,
        },
    });
});

test('query flat：--limit 进 vizConfig.limit；--filters-json/--dashboard 顶层透传', () => {
    const spec = specByName(queryCommands, 'query flat');
    const filters = {
        type: 'and',
        dimensions: [
            {
                fieldId: 'period',
                fieldType: 'string',
                fieldFilterType: 'string',
                operator: 'equals',
                values: ['2026Q2'],
            },
        ],
        metrics: null,
    };
    const call = buildOne(spec, {
        options: {
            explore: 't',
            metrics: 'm',
            limit: '10',
            filtersJson: JSON.stringify(filters),
            dashboard: UUID,
        },
        projectUuid: UUID,
    });
    assert.deepEqual((call.args as { vizConfig: { limit: number | null } }).vizConfig.limit, 10);
    assert.deepEqual(
        (call.args as { filters: unknown }).filters,
        filters,
    );
    assert.deepEqual(
        (call.args as { dashboardUuid?: string }).dashboardUuid,
        UUID,
    );
});

test('query flat：--filter 不支持（USAGE，hint 改用 query / --filters-json）', () => {
    const spec = specByName(queryCommands, 'query flat');
    assertUsage(
        () =>
            buildOne(spec, {
                options: { explore: 't', ...repeatable('filter', ['period=2026Q2']) },
            }),
        '--filters-json',
    );
});

/* ------------------------------------------------------------------ */
/* charts：get/run 的入参键必须是 savedChartUuid                         */
/* ------------------------------------------------------------------ */

test('charts get/run：入参键为 savedChartUuid；run 不发 full', () => {
    const getCall = buildOne(specByName(chartsCommands, 'charts get <chartUuid>'), {
        args: { chartUuid: 'abc' },
        options: { full: true },
    });
    assert.equal(getCall.tool, 'get_saved_chart');
    assert.deepEqual(getCall.args, { savedChartUuid: 'abc', full: true });

    const runCall = buildOne(
        specByName(chartsCommands, 'charts run <chartUuid>'),
        {
            args: { chartUuid: 'abc' },
            options: { limit: '20', valueFormat: 'raw', dashboard: UUID },
        },
    );
    assert.equal(runCall.tool, 'run_saved_chart');
    assert.deepEqual(runCall.args, {
        savedChartUuid: 'abc',
        limit: 20,
        valueFormat: 'raw',
        dashboardUuid: UUID,
    });
    assert.ok(!('full' in runCall.args), 'run_saved_chart 不应携带 full');

    assertUsage(() =>
        buildOne(specByName(chartsCommands, 'charts list'), {}),
    );
});

/* ------------------------------------------------------------------ */
/* dashboards：list 缺 --space / tiles / run --tile 不进服务端参数        */
/* ------------------------------------------------------------------ */

test('dashboards list：缺 --space → USAGE 并提示 search --type dashboard', () => {
    const spec = specByName(dashboardsCommands, 'dashboards list');
    assertUsage(() => buildOne(spec, {}), '--type dashboard');
    const call = buildOne(spec, { options: { space: UUID, full: true } });
    assert.equal(call.tool, 'list_dashboards');
    assert.deepEqual(call.args, { spaceUuid: UUID, full: true });
});

test('dashboards tiles/run：dashboardUuid 位置参数；--tile 只本地过滤', () => {
    const tilesCall = buildOne(
        specByName(dashboardsCommands, 'dashboards tiles <dashboardUuid>'),
        { args: { dashboardUuid: 'd1' } },
    );
    assert.equal(tilesCall.tool, 'get_dashboard_tiles');
    assert.deepEqual(tilesCall.args, { dashboardUuid: 'd1' });

    const runCall = buildOne(
        specByName(dashboardsCommands, 'dashboards run <dashboardUuid>'),
        {
            args: { dashboardUuid: 'd1' },
            options: { tile: 'sales-tile', limit: '30', valueFormat: 'formatted' },
        },
    );
    assert.equal(runCall.tool, 'run_dashboard_tiles');
    assert.deepEqual(runCall.args, {
        dashboardUuid: 'd1',
        limit: 30,
        valueFormat: 'formatted',
    });
    assert.ok(!('tile' in runCall.args), '--tile 不应进服务端参数');
});

/* ------------------------------------------------------------------ */
/* docs                                                                */
/* ------------------------------------------------------------------ */

test('docs：topic 自由字符串 + --text → format:text；不注入 projectUuid', () => {
    const call = buildOne(specByName(docsCommands, 'docs [topic]'), {
        args: { topic: 'query_workflow' },
        options: { text: true },
        projectUuid: UUID,
    });
    assert.equal(call.tool, 'get_mcp_docs');
    assert.deepEqual(call.args, { topic: 'query_workflow', format: 'text' });
});

/* ------------------------------------------------------------------ */
/* runToolCommand：dry-run 不发请求 / 正常路径走假 client                 */
/* ------------------------------------------------------------------ */

type FakeClient = {
    client: McpClient;
    callCount: () => number;
    closeCount: () => number;
    openCount: () => number;
};

const textResult = (payload: unknown): ToolResult => ({
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: false,
});

const makeFakeClient = (result: ToolResult): FakeClient => {
    let calls = 0;
    let closes = 0;
    const opens = 0;
    const client: McpClient = {
        listTools: async () => [],
        callTool: async (call: ToolCall) => {
            calls += 1;
            assert.equal(call.tool, 'get_mcp_docs');
            return result;
        },
        close: async () => {
            closes += 1;
        },
    };
    return {
        client,
        callCount: () => calls,
        closeCount: () => closes,
        openCount: () => opens,
    };
};

const makeCtx = (overrides: Partial<GlobalOptions> = {}): CommandContext => ({
    options: {
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
        ...overrides,
    },
    site: {
        name: 'test-site',
        mcpUrl: 'https://mcp.invalid.test/api/v1/mcp',
        authMode: 'oauth',
        authHeader: 'authorization',
    },
    credentials: null,
    format: 'json',
    startedAt: performance.now(),
});

const captureStdout = async (fn: () => Promise<void>): Promise<string> => {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // 透传（tee）而不是吞掉：node:test 子进程模式下测试事件也走 stdout，
    // 吞掉会导致事件丢失（剩余测试不被计入）；断言侧再按行筛选 JSON。
    const write = ((chunk: unknown): boolean => {
        // 只捕获字符串块：node:test 子进程模式的事件流是二进制序列化块，
        // 转成字符串会污染捕获内容（拼接在 JSON 行首）
        if (typeof chunk === 'string') {
            chunks.push(chunk);
        }
        return original(chunk as Parameters<typeof original>[0]);
    }) as typeof process.stdout.write;
    process.stdout.write = write;
    try {
        await fn();
    } finally {
        process.stdout.write = original;
    }
    return chunks.join('');
};

/** 从 tee 捕获的输出里提取 dry-run 的 {"tool":…} 行 */
const dryRunLineOf = (captured: string): Record<string, unknown> => {
    const line = captured
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.startsWith('{"tool":'))
        .pop();
    assert.ok(line !== undefined, `未捕获 dry-run 输出：${captured}`);
    return JSON.parse(line) as Record<string, unknown>;
};

test('runToolCommand：--dry-run 打印 {tool,args} 且不建连不发请求', async () => {
    const fake = makeFakeClient(textResult({ rows: [] }));
    const ctx = makeCtx({ dryRun: true });
    const out = await captureStdout(() =>
        runToolCommand(
            [
                { tool: 'get_mcp_docs', args: { topic: 'overview' } },
                { tool: 'get_site_info', args: {} },
            ],
            ctx,
            {
                createClient: async () => {
                    throw new Error('dry-run 不应创建客户端');
                },
            },
        ),
    );
    const toolLines = out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('{"tool":'));
    assert.equal(toolLines.length, 2, `数组逐条打印：${out}`);
    assert.deepEqual(JSON.parse(toolLines[0] as string), {
        tool: 'get_mcp_docs',
        args: { topic: 'overview' },
    });
    assert.deepEqual(JSON.parse(toolLines[1] as string), {
        tool: 'get_site_info',
        args: {},
    });
    assert.equal(fake.callCount(), 0);
});

test('runToolCommand：正常路径走假 client 并渲染结果', async () => {
    const fake = makeFakeClient(textResult({ rows: [{ a: 1 }, { a: 2 }] }));
    const ctx = makeCtx({});
    const out = await captureStdout(() =>
        runToolCommand(
            { tool: 'get_mcp_docs', args: {} },
            ctx,
            {
                createClient: async () => fake.client,
            },
        ),
    );
    assert.equal(fake.callCount(), 1);
    assert.ok(out.includes('"rows"'), `stdout 应含行数据：${out}`);
});

test('runToolCommand：未登录（无凭证）遇 AUTH_REQUIRED 不重试直接上抛', async () => {
    let calls = 0;
    const client: McpClient = {
        listTools: async () => [],
        callTool: async () => {
            calls += 1;
            throw new CliError({
                code: 'AUTH_REQUIRED',
                message: '未登录或凭证已失效',
            });
        },
        close: async () => undefined,
    };
    const ctx = makeCtx({}); // credentials: null
    await assert.rejects(
        runToolCommand({ tool: 'get_site_info', args: {} }, ctx, {
            createClient: async () => client,
        }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.code, 'AUTH_REQUIRED');
            return true;
        },
    );
    assert.equal(calls, 1, '无凭证时不做 401 重试');
});

test('writeResult：--out 写文件 0600 且 stdout 只回摘要', async () => {
    const { writeResult } = await import('../cli/output');
    const { stat, rm } = await import('node:fs/promises');
    const outPath = `/tmp/msy-x-cli-out-${process.pid}.json`;
    const ctx = makeCtx({ out: outPath });
    const out = await captureStdout(() =>
        writeResult({
            tool: 'run_semantic_metric_query',
            result: textResult({ rows: [{ a: 1 }, { a: 2 }, { a: 3 }] }),
            ctx,
        }),
    );
    const summary = JSON.parse(
        out.split('\n').filter((line) => line.startsWith('{')).pop() ?? '',
    ) as { written: string; rows: number; bytes: number };
    assert.equal(summary.written, outPath);
    assert.equal(summary.rows, 3);
    assert.ok(summary.bytes > 0);
    const info = await stat(outPath);
    // 0600 = owner rw（Linux 权限位掩）
    // eslint-disable-next-line no-bitwise
    assert.equal(info.mode & 0o777, 0o600);
    await rm(outPath, { force: true });
});

/* ------------------------------------------------------------------ */
/* 挂载：全部 CommandSpec 注册、code 别名、--csv 门控与缺 --space 退出   */
/* ------------------------------------------------------------------ */

test('挂载：全部命令注册且名字唯一（含 auth/site/verified/doctor/tools/call，共 35 个）', () => {
    const specs = registeredSpecs();
    const names = specs.map((spec) => spec.name);
    assert.equal(new Set(names).size, names.length, '命令名不应重复');
    // 旧断言清单缺 project use/project show/spaces find，这里补全为完整清单
    assert.equal(names.length, 35, `应注册 35 个命令，实际 ${names.length}`);
    for (const expected of [
        'info',
        'access',
        'project list',
        'project use <projectUuid>',
        'project show',
        'site list',
        'site show',
        'site use <name>',
        'auth login',
        'auth status',
        'auth logout',
        'search <query>',
        'spaces list',
        'spaces find <query>',
        'explores list',
        'explores show <exploreName>',
        'fields find <query>',
        'values <fieldId>',
        'query',
        'query flat',
        'dashboards list',
        'dashboards find <query>',
        'dashboards tiles <dashboardUuid>',
        'dashboards run <dashboardUuid>',
        'dashboards get <dashboardUuid>',
        'charts list',
        'charts find <query>',
        'charts get <chartUuid>',
        'charts run <chartUuid>',
        'verified',
        'docs [topic]',
        'tools list',
        'tools describe <name>',
        'doctor',
        'call <tool>',
    ]) {
        assert.ok(names.includes(expected), `缺少命令 ${expected}`);
    }
});

const runProgram = async (argv: string[]): Promise<string> =>
    captureStdout(async () => {
        const program = new Command();
        registerCommands(program);
        await program.parseAsync(argv, { from: 'user' });
    });

/** 与 captureStdout 同构：捕获 stderr（提示/告警验证），透传不吞 */
const captureStderr = async (fn: () => Promise<void>): Promise<string> => {
    const chunks: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    const write = ((chunk: unknown): boolean => {
        if (typeof chunk === 'string') {
            chunks.push(chunk);
        }
        return original(chunk as Parameters<typeof original>[0]);
    }) as typeof process.stderr.write;
    process.stderr.write = write;
    try {
        await fn();
    } finally {
        process.stderr.write = original;
    }
    return chunks.join('');
};

test('挂载端到端：query --dry-run 输出 run_semantic_metric_query', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        const out = await runProgram([
            'query',
            '-e',
            'pinleibaohsm_cls_top',
            '--dimensions',
            'cls_4',
            '--metrics',
            'total_cls4_amount',
            '--filter',
            'period=2026Q2',
            '--dry-run',
        ]);
        const parsed = dryRunLineOf(out) as {
            tool: string;
            args: {
                filters?: { dimensions?: Array<Record<string, unknown>> };
            };
        };
        assert.equal(parsed.tool, 'run_semantic_metric_query');
        assert.equal(parsed.args.filters?.dimensions?.[0]?.fieldId, 'period');
        assert.equal(parsed.args.filters?.dimensions?.[0]?.operator, 'equals');
        assert.deepEqual(parsed.args.filters?.dimensions?.[0]?.values, ['2026Q2']);
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('挂载端到端：dashboards code 别名 → get_dashboard_code', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        const out = await runProgram([
            'dashboards',
            'code',
            'd-alias-1',
            '--dry-run',
        ]);
        const parsed = dryRunLineOf(out) as {
            tool: string;
            args: { dashboardUuid?: string };
        };
        assert.equal(parsed.tool, 'get_dashboard_code');
        assert.equal(parsed.args.dashboardUuid, 'd-alias-1');
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('挂载端到端：dashboards list 缺 --space 退 USAGE', async () => {
    await assert.rejects(
        runProgram(['dashboards', 'list']),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.code, 'USAGE');
            assert.ok(
                `${error.hint ?? ''}`.includes('--type dashboard'),
                `hint 应提示用 search --type dashboard：${error.hint ?? ''}`,
            );
            return true;
        },
    );
});

test('挂载端到端：非数据命令 --csv 退 USAGE', async () => {
    await assert.rejects(
        runProgram(['info', '--csv']),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.code, 'USAGE');
            return true;
        },
    );
});

test('挂载端到端：verified --dry-run 输出 list_verified_content', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        const out = await runProgram(['verified', '--dry-run']);
        const parsed = dryRunLineOf(out) as {
            tool: string;
            args: Record<string, unknown>;
        };
        assert.equal(parsed.tool, 'list_verified_content');
        assert.deepEqual(parsed.args, {});
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('挂载端到端：verified --page-size 300 截断到 100 后再进 dry-run', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        const out = await runProgram([
            'verified',
            '--page-size',
            '300',
            '--page',
            '2',
            '--dry-run',
        ]);
        const parsed = dryRunLineOf(out) as {
            tool: string;
            args: { pageSize?: number; page?: number };
        };
        assert.equal(parsed.tool, 'list_verified_content');
        assert.equal(parsed.args.pageSize, 100);
        assert.equal(parsed.args.page, 2);
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('挂载端到端：doctor 本地检查输出逐行 [status] name — detail 且不联网', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        // 显式 --table：D6 后 doctor 读已解析的 ctx.format（测试环境非 TTY 默认 json）
        const out = await runProgram(['doctor', '--table']);
        const lines = out
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => /^\[(ok|warn|fail)\] \S+ — /.test(line));
        assert.ok(lines.length >= 4, `应逐行输出检查项：${out}`);
        assert.ok(
            lines.some((line) => line.startsWith('[ok] node-version')),
            `应包含 node-version：${out}`,
        );
        assert.ok(
            lines.some((line) => line.includes('site-resolution')),
            `应包含 site-resolution：${out}`,
        );
        assert.ok(
            !lines.some((line) => line.startsWith('[fail]')),
            `本地检查不应有 fail（文件不存在走默认配置）：${out}`,
        );
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('挂载端到端：doctor --remote 未登录退 3（stdout 检查行 + stderr 单行 JSON）', async () => {
    const previous = process.env.MSY_X_CONFIG;
    const dir = await mkdtemp(path.join(tmpdir(), 'msy-x-doctor-e2e-'));
    const file = path.join(dir, 'none.yaml');
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
    process.env.MSY_X_CONFIG = file;
    const errChunks: string[] = [];
    const errOriginal = process.stderr.write.bind(process.stderr);
    const errWrite = ((chunk: unknown): boolean => {
        if (typeof chunk === 'string') errChunks.push(chunk);
        return errOriginal(chunk as Parameters<typeof errOriginal>[0]);
    }) as typeof process.stderr.write;
    process.stderr.write = errWrite;
    try {
        // 走真实入口 main（含 stderr 单行 JSON 与退出码归一），不联网：未登录时
        // dispatch 在建连前就退 3
        const { main } = await import('../index');
        const out = await captureStdout(async () => {
            const code = await main(['node', 'msy-x', 'doctor', '--remote']);
            assert.equal(code, 3, '未登录 + --remote 应退 3');
        });
        assert.ok(
            out.split('\n').some((line) => line.includes('remote-auth')),
            `stdout 应含 remote-auth 检查行：${out}`,
        );
        assert.ok(
            out.split('\n').some((line) => line.includes('auth login')),
            `检查行应带 auth login hint：${out}`,
        );
    } finally {
        process.stderr.write = errOriginal;
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
        await rmDir(dir, { recursive: true, force: true });
    }
    const stderrText = errChunks.join('');
    assert.ok(
        stderrText.includes('AUTH_REQUIRED'),
        `stderr 应含单行错误 JSON：${stderrText}`,
    );
});

/* ------------------------------------------------------------------ */
/* D6/T8：doctor 非 TTY 默认 JSON（读已解析的 ctx.format）              */
/* ------------------------------------------------------------------ */

test('挂载端到端 D6/T8：doctor 管道（非 TTY）默认输出 JSON', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    const { isTTY } = process.stdout;
    process.stdout.isTTY = undefined; // 模拟管道/重定向
    try {
        const out = await runProgram(['doctor']);
        const jsonLine = out
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.startsWith('{"ok"'));
        assert.ok(jsonLine !== undefined, `非 TTY 应默认 JSON：${out}`);
        const parsed = JSON.parse(jsonLine) as {
            ok: boolean;
            checks: Array<{ name: string; status: string }>;
        };
        assert.equal(typeof parsed.ok, 'boolean');
        assert.ok(parsed.checks.length >= 4);
        assert.ok(parsed.checks.some((item) => item.name === 'node-version'));
    } finally {
        process.stdout.isTTY = isTTY;
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

/* ------------------------------------------------------------------ */
/* D7/T10：xml / none 文本源的输出契约                                   */
/* ------------------------------------------------------------------ */

const XML_TEXT = '<explores><explore name="pinleibaohsm_cls_top"/></explores>';
const MARKDOWN_TEXT = '# 概览\n\n先用 explores list 找表，再用 query 取数。';

const xmlResult: ToolResult = {
    content: [{ type: 'text', text: XML_TEXT }],
    isError: false,
};

const markdownResult: ToolResult = {
    content: [{ type: 'text', text: MARKDOWN_TEXT }],
    isError: false,
};

/** writeResult 一次性写出整个 JSON 文档（单行或缩进多行），直接整体解析 */
const parseCapturedJson = (captured: string): Record<string, unknown> => {
    const text = captured.trim();
    assert.ok(text.startsWith('{'), `未捕获 JSON 输出：${captured}`);
    return JSON.parse(text) as Record<string, unknown>;
};

test('D7/T10：xml 源（find_explores）--json 输出 {"text":…}', async () => {
    const { writeResult } = await import('../cli/output');
    const out = await captureStdout(() =>
        writeResult({ tool: 'find_explores', result: xmlResult, ctx: makeCtx() }),
    );
    assert.deepEqual(parseCapturedJson(out), { text: XML_TEXT });
});

test('D7/T10：markdown 源（get_mcp_docs）--json 输出 {"text":…}', async () => {
    const { writeResult } = await import('../cli/output');
    const out = await captureStdout(() =>
        writeResult({ tool: 'get_mcp_docs', result: markdownResult, ctx: makeCtx() }),
    );
    assert.deepEqual(parseCapturedJson(out), { text: MARKDOWN_TEXT });
});

test('D7/T10：xml 源 --envelope 输出 {ok,tool,data:{text},meta}，meta 含 projectUuid（D8）', async () => {
    const { writeResult } = await import('../cli/output');
    const ctx = makeCtx({ envelope: true, projectUuid: 'proj-uuid-1' });
    const out = await captureStdout(() =>
        writeResult({ tool: 'find_explores', result: xmlResult, ctx }),
    );
    const parsed = parseCapturedJson(out) as unknown as {
        ok: boolean;
        tool: string;
        data: { text: string };
        meta: Record<string, unknown>;
    };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.tool, 'find_explores');
    assert.deepEqual(parsed.data, { text: XML_TEXT });
    assert.deepEqual(Object.keys(parsed.meta), ['site', 'projectUuid', 'durationMs']);
    assert.equal(parsed.meta.projectUuid, 'proj-uuid-1');
});

test('D8：--envelope 未指定 projectUuid 时 meta.projectUuid 为 null', async () => {
    const { writeResult } = await import('../cli/output');
    const ctx = makeCtx({ envelope: true }); // projectUuid: null
    const out = await captureStdout(() =>
        writeResult({ tool: 'find_explores', result: xmlResult, ctx }),
    );
    const parsed = parseCapturedJson(out) as unknown as {
        meta: Record<string, unknown>;
    };
    assert.deepEqual(Object.keys(parsed.meta), ['site', 'projectUuid', 'durationMs']);
    assert.equal(parsed.meta.projectUuid, null);
});

test('D7/T10：xml 源 table 模式原样输出文本并在 stderr 提示非表格文本', async () => {
    const { writeResult } = await import('../cli/output');
    const ctx = { ...makeCtx({ quiet: false }), format: 'table' as const };
    let stdout = '';
    const stderrText = await captureStderr(async () => {
        stdout = await captureStdout(() =>
            writeResult({ tool: 'find_explores', result: xmlResult, ctx }),
        );
    });
    assert.ok(stdout.includes(XML_TEXT), `table 模式应原样输出文本：${stdout}`);
    assert.ok(!stdout.includes('{"text"'), `table 模式不应输出 JSON 包装：${stdout}`);
    assert.ok(
        stderrText.includes('该工具返回非表格文本'),
        `stderr 应提示非表格文本：${stderrText}`,
    );
});

test('D7/T10：xml 源 --out 写 {"text":…} JSON（非裸文本），stdout 只回摘要', async () => {
    const { writeResult } = await import('../cli/output');
    const outPath = `/tmp/msy-x-cli-text-out-${process.pid}.json`;
    try {
        // 解析后 format=table（TTY 默认）也要落 JSON：文件只写 JSON/CSV
        const ctx = { ...makeCtx({ out: outPath, quiet: false }), format: 'table' as const };
        const out = await captureStdout(() =>
            writeResult({ tool: 'find_explores', result: xmlResult, ctx }),
        );
        const summary = JSON.parse(
            out.split('\n').filter((line) => line.startsWith('{')).pop() ?? '',
        ) as { written: string; rows: number | null; bytes: number };
        assert.equal(summary.written, outPath);
        assert.equal(summary.rows, null, 'xml 源无行数据');
        assert.ok(summary.bytes > 0);
        const fileText = await readFile(outPath, 'utf8');
        assert.deepEqual(JSON.parse(fileText), { text: XML_TEXT });
    } finally {
        await rmDir(outPath, { force: true });
    }
});

/* ------------------------------------------------------------------ */
/* D14/T7：多调用命令（info，3 个工具）的合并输出                         */
/* ------------------------------------------------------------------ */

const INFO_RESPONSES: Record<string, unknown> = {
    get_site_info: { siteUrl: 'https://x.brandct.com', total: 7 },
    get_lightdash_version: { version: '0.2000.0' },
    get_current_project: { projectUuid: 'p1', name: '品牌CT' },
};

const makeInfoClient = (state: { calls: string[] }): McpClient => ({
    listTools: async () => [],
    callTool: async (call: ToolCall) => {
        state.calls.push(call.tool);
        return textResult(INFO_RESPONSES[call.tool] ?? {});
    },
    close: async () => undefined,
});

const INFO_CALLS: ToolCall[] = [
    { tool: 'get_site_info', args: {} },
    { tool: 'get_lightdash_version', args: {} },
    { tool: 'get_current_project', args: {} },
];

test('D14/T7：多调用命令 stdout 输出单个合并 JSON 对象（JSON.parse 成功）', async () => {
    const state = { calls: [] as string[] };
    const out = await captureStdout(() =>
        runToolCommand(INFO_CALLS, makeCtx(), {
            createClient: async () => makeInfoClient(state),
        }),
    );
    const parsed = JSON.parse(out.trim()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), [
        'get_site_info',
        'get_lightdash_version',
        'get_current_project',
    ]);
    assert.deepEqual(parsed.get_site_info, INFO_RESPONSES.get_site_info);
    assert.deepEqual(parsed.get_current_project, INFO_RESPONSES.get_current_project);
    assert.deepEqual(state.calls, [
        'get_site_info',
        'get_lightdash_version',
        'get_current_project',
    ]);
});

test('D14/T7：多调用命令 --out 一次写盘不覆盖，stdout 只回 {written,calls,bytes}', async () => {
    const state = { calls: [] as string[] };
    const outPath = `/tmp/msy-x-cli-multi-out-${process.pid}.json`;
    try {
        const ctx = makeCtx({ out: outPath });
        const out = await captureStdout(() =>
            runToolCommand(INFO_CALLS, ctx, {
                createClient: async () => makeInfoClient(state),
            }),
        );
        const summaryLines = out
            .split('\n')
            .filter((line) => line.trim().startsWith('{'));
        assert.equal(summaryLines.length, 1, `stdout 应只有一条摘要：${out}`);
        const summary = JSON.parse(summaryLines[0] as string) as {
            written: string;
            calls: number;
            bytes: number;
        };
        assert.equal(summary.written, outPath);
        assert.equal(summary.calls, 3);
        assert.ok(summary.bytes > 0);
        const fileParsed = JSON.parse(await readFile(outPath, 'utf8')) as Record<
            string,
            unknown
        >;
        assert.deepEqual(Object.keys(fileParsed), [
            'get_site_info',
            'get_lightdash_version',
            'get_current_project',
        ]);
        assert.ok(!('written' in fileParsed), '文件内容应是数据本体而非摘要');
    } finally {
        await rmDir(outPath, { force: true });
    }
});

test('D14：多调用命令 --envelope 时 data 为合并对象、tool 为逗号连接的工具名', async () => {
    const state = { calls: [] as string[] };
    const ctx = makeCtx({ envelope: true, projectUuid: 'proj-uuid-1' });
    const out = await captureStdout(() =>
        runToolCommand(INFO_CALLS, ctx, {
            createClient: async () => makeInfoClient(state),
        }),
    );
    const parsed = JSON.parse(out.trim()) as {
        ok: boolean;
        tool: string;
        data: Record<string, unknown>;
        meta: Record<string, unknown>;
    };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.tool, 'get_site_info,get_lightdash_version,get_current_project');
    assert.deepEqual(Object.keys(parsed.data), [
        'get_site_info',
        'get_lightdash_version',
        'get_current_project',
    ]);
    assert.equal(parsed.meta.projectUuid, 'proj-uuid-1');
});

/* ------------------------------------------------------------------ */
/* D9/T11：--page-size > 100 截断告警                                    */
/* ------------------------------------------------------------------ */

test('D9/T11：search --page-size 300 → 截断到 100 且 stderr 出现告警', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        let stdout = '';
        const stderrText = await captureStderr(async () => {
            stdout = await runProgram([
                'search',
                'foo',
                '--page-size',
                '300',
                '--dry-run',
            ]);
        });
        const parsed = dryRunLineOf(stdout) as {
            tool: string;
            args: { pageSize?: number };
        };
        assert.equal(parsed.tool, 'find_content');
        assert.equal(parsed.args.pageSize, 100, '应截断到 100');
        assert.ok(
            stderrText.includes('--page-size 300'),
            `告警应含原始值：${stderrText}`,
        );
        assert.ok(
            stderrText.includes('100') && stderrText.includes('截断'),
            `告警应说明截断：${stderrText}`,
        );
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('D9/T11：--quiet 关闭截断告警', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        const stderrText = await captureStderr(async () => {
            await runProgram(['search', 'foo', '--page-size', '300', '--quiet', '--dry-run']);
        });
        assert.ok(
            !stderrText.includes('截断'),
            `--quiet 不应输出截断告警：${stderrText}`,
        );
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('D9/T11：verified --page-size 300 同样告警（runVerifiedCommand 路径）', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        const stderrText = await captureStderr(async () => {
            await runProgram(['verified', '--page-size', '300', '--dry-run']);
        });
        assert.ok(
            stderrText.includes('--page-size 300') && stderrText.includes('截断'),
            `verified 也应告警：${stderrText}`,
        );
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

/* ------------------------------------------------------------------ */
/* D18/T12：call --args 与全局 --json 的解析                             */
/* ------------------------------------------------------------------ */

test('D18/T12：call --args 传工具入参，全局 --json 恢复输出格式语义', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        // --args 提供工具入参；--json 是全局输出格式 flag（布尔），二者共存不冲突
        const out = await runProgram([
            'call',
            'get_site_info',
            '--args',
            '{"a":1}',
            '--json',
            '--dry-run',
        ]);
        const parsed = dryRunLineOf(out) as {
            tool: string;
            args: Record<string, unknown>;
        };
        assert.equal(parsed.tool, 'get_site_info');
        assert.deepEqual(parsed.args, { a: 1 });
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('D18/T12：call --args 与 --file 互斥 → USAGE', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        await assert.rejects(
            runProgram([
                'call',
                'get_site_info',
                '--args',
                '{}',
                '--file',
                'x.json',
                '--dry-run',
            ]),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.equal(error.code, 'USAGE');
                assert.ok(
                    `${error.message}`.includes('--args 与 --file 互斥'),
                    `应提示互斥：${error.message}`,
                );
                return true;
            },
        );
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('D18/T12：call 的 --json 不再吃参数值（解析为布尔 flag，旧写法 --json <obj> 的值被丢弃）', async () => {
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = '/tmp/msy-x-cli-integration-none.yaml';
    try {
        // 旧写法 --json '<obj>'：--json 是全局布尔 flag（输出格式），
        // '<obj>' 成为单位参数被丢弃 → 入参为空对象（不再是工具参数）
        const out = await runProgram([
            'call',
            'get_site_info',
            '--json',
            '{}',
            '--dry-run',
        ]);
        const parsed = dryRunLineOf(out) as {
            tool: string;
            args: Record<string, unknown>;
        };
        assert.equal(parsed.tool, 'get_site_info');
        assert.deepEqual(parsed.args, {}, '旧写法的 JSON 值不再被当成工具入参');
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});
