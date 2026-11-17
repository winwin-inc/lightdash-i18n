import assert from 'node:assert/strict';
import test from 'node:test';
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
 * --space、dry-run 不发请求（假 client 断言未调用）。
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

test('挂载：全部命令注册且名字唯一（含 auth/site/tools/call）', () => {
    const specs = registeredSpecs();
    const names = specs.map((spec) => spec.name);
    assert.equal(new Set(names).size, names.length, '命令名不应重复');
    for (const expected of [
        'info',
        'access',
        'project list',
        'site list',
        'site show',
        'site use <name>',
        'auth login',
        'auth status',
        'auth logout',
        'search <query>',
        'spaces list',
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
        'docs [topic]',
        'tools list',
        'tools describe <name>',
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
