import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x charts`（设计稿 §6.2，v2 真实入参）：
 *
 * - `list --dashboard <uuid>` → list_charts（dashboardUuid 必填）；
 * - `find <query>` → find_charts（searchQueries:[{label}]）；
 * - `get <uuid> [--full]` → get_saved_chart：入参键必须是 **savedChartUuid**；
 * - `run <uuid>` → run_saved_chart：入参键 savedChartUuid，**不发 full**
 *   （v2 schema 没有 full；MCP SDK 会静默丢弃未知键，键名错会导致必填项缺失报错）。
 */

const MAX_PAGE_SIZE = 100;

const withProject = (
    args: Record<string, unknown>,
    projectUuid: string | null,
): Record<string, unknown> =>
    projectUuid === null ? args : { ...args, projectUuid };

const requireQuery = (query: string | undefined): string => {
    if (query === undefined || query.trim() === '') {
        throw new CliError({
            code: 'USAGE',
            message: '缺少搜索关键词 <query>',
        });
    }
    return query.trim();
};

const parsePositiveInt = (
    raw: string | boolean | undefined,
    flag: string,
): number | null => {
    if (raw === undefined || raw === false) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new CliError({
            code: 'USAGE',
            message: `选项 ${flag} 需要不小于 1 的整数，收到：${String(raw)}`,
        });
    }
    return value;
};

const parseLimit = (raw: string | boolean | undefined): number | null =>
    parsePositiveInt(raw, '--limit');

const parseValueFormat = (
    raw: string | boolean | undefined,
): 'raw' | 'formatted' | null => {
    if (raw === undefined || raw === false || raw === '') return null;
    if (raw !== 'raw' && raw !== 'formatted') {
        throw new CliError({
            code: 'USAGE',
            message: `--value-format 非法：${String(raw)}`,
            hint: '可选值：raw | formatted',
        });
    }
    return raw;
};

export const chartsCommands: CommandSpec[] = [
    {
        name: 'charts list',
        description: '列出看板下的图表（dashboardUuid 必填）',
        options: [
            {
                flags: '--dashboard <dashboardUuid>',
                description: '目标看板的 UUID 或 slug，必填',
            },
            { flags: '--full', description: '返回完整内容摘要' },
        ],
        example: 'msy-x charts list --dashboard d54853b1-85df-4ab3-8cdf-70a5244640e1',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const { dashboard } = input.options;
            if (typeof dashboard !== 'string' || dashboard.trim() === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少必填选项 --dashboard <dashboardUuid>',
                    hint: '先运行 msy-x dashboards tiles <uuid> 查看看板内的图表',
                });
            }
            const args: Record<string, unknown> = {
                dashboardUuid: dashboard.trim(),
            };
            if (input.options.full === true) args.full = true;
            return [
                { tool: 'list_charts', args: withProject(args, input.projectUuid) },
            ];
        },
    },
    {
        name: 'charts find <query>',
        description: '按关键词搜索图表',
        options: [
            {
                flags: '--page-size <n>',
                description: '每页条数（1..100，超过 100 截断到 100）',
            },
            { flags: '--full', description: '返回完整内容摘要' },
        ],
        example: 'msy-x charts find cls_insight_list',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {
                searchQueries: [{ label: requireQuery(input.args.query) }],
            };
            const pageSize = parsePositiveInt(input.options.pageSize, '--page-size');
            if (pageSize !== null) {
                args.pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
            }
            if (input.options.full === true) args.full = true;
            return [
                { tool: 'find_charts', args: withProject(args, input.projectUuid) },
            ];
        },
    },
    {
        name: 'charts get <chartUuid>',
        description: '查看图表元数据（--full 含 metricQuery 与图表配置）',
        options: [
            {
                flags: '--full',
                description: '包含 metric query、chart config 与参数',
            },
        ],
        example: 'msy-x charts get abc123de-1111-4222-8333-444455556666 --full',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const chartUuid = input.args.chartUuid?.trim();
            if (chartUuid === undefined || chartUuid === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少位置参数 <chartUuid>',
                    hint: '先运行 msy-x charts list --dashboard <uuid> 或 msy-x charts find <关键词>',
                });
            }
            // v2 入参键固定为 savedChartUuid（不是 chartUuid / uuid）
            const args: Record<string, unknown> = { savedChartUuid: chartUuid };
            if (input.options.full === true) args.full = true;
            return [
                { tool: 'get_saved_chart', args: withProject(args, input.projectUuid) },
            ];
        },
    },
    {
        name: 'charts run <chartUuid>',
        description: '执行图表查询并返回行数据（不发 full）',
        options: [
            { flags: '--limit <n>', description: '行数上限（默认 500，受服务端封顶）' },
            {
                flags: '--value-format <raw|formatted>',
                description: '单元格取值格式（默认 raw）',
            },
            {
                flags: '--dashboard <dashboardUuid>',
                description: '强制看板模式下关联的看板 UUID',
            },
        ],
        example:
            'msy-x charts run abc123de-1111-4222-8333-444455556666 --limit 50 --value-format formatted',
        dataCommand: true,
        build: (input: CommandBuildInput): ToolCall[] => {
            const chartUuid = input.args.chartUuid?.trim();
            if (chartUuid === undefined || chartUuid === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少位置参数 <chartUuid>',
                    hint: '先运行 msy-x charts list --dashboard <uuid> 或 msy-x charts find <关键词>',
                });
            }
            const args: Record<string, unknown> = {
                savedChartUuid: chartUuid, // v2 入参键；run_saved_chart 无 full
            };
            const limit = parseLimit(input.options.limit);
            if (limit !== null) args.limit = limit;
            const valueFormat = parseValueFormat(input.options.valueFormat);
            if (valueFormat !== null) args.valueFormat = valueFormat;
            const { dashboard } = input.options;
            if (typeof dashboard === 'string' && dashboard.trim() !== '') {
                args.dashboardUuid = dashboard.trim();
            }
            return [
                { tool: 'run_saved_chart', args: withProject(args, input.projectUuid) },
            ];
        },
    },
];
