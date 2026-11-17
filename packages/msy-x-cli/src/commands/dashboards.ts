import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall, ToolResult } from '../types';

/**
 * `msy-x dashboards`（设计稿 §6.2，v2 真实入参）：
 *
 * - `list --space <spaceUuid>`：spaceUuid 必填，缺省本地退 2 并提示改用
 *   `search --type dashboard`（v2 不支持跨 space 列全部看板）；
 * - `find <query>` → find_dashboards（searchQueries:[{label}]）；
 * - `tiles <uuid>` → get_dashboard_tiles（UUID 或 slug，无 full）；
 * - `run <uuid>` → run_dashboard_tiles：服务端会**跑整板**，`--tile <slug>`
 *   只在 CLI 侧渲染前过滤（filterDashboardTileRows），并打 stderr 提示；
 * - `get <uuid> [--full]` → get_dashboard_code（`code` 为别名，返回看板定义 JSON）。
 */

const MAX_PAGE_SIZE = 100;

const withProject = (
    args: Record<string, unknown>,
    projectUuid: string | null,
): Record<string, unknown> =>
    projectUuid === null ? args : { ...args, projectUuid };

const requirePositional = (
    value: string | undefined,
    name: string,
): string => {
    if (value === undefined || value.trim() === '') {
        throw new CliError({
            code: 'USAGE',
            message: `缺少位置参数 <${name}>`,
        });
    }
    return value.trim();
};

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

const parsePageSize = (raw: string | boolean | undefined): number | null => {
    const value = parsePositiveInt(raw, '--page-size');
    return value === null ? null : Math.min(value, MAX_PAGE_SIZE);
};

const parseLimit = (raw: string | boolean | undefined): number | null => {
    const value = parsePositiveInt(raw, '--limit');
    return value;
};

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

/** `dashboards run --tile` 的 stderr 提示（服务端会跑整板） */
export const DASHBOARDS_TILE_NOTICE =
    '注意：run_dashboard_tiles 会执行整块看板，--tile 只在本地渲染前过滤磁贴';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** 磁贴匹配：--tile 值可与 tile 的 uuid / name 精确匹配 */
const tileMatches = (tile: unknown, tileSelector: string): boolean => {
    if (!isRecord(tile)) return false;
    if (tile.uuid === tileSelector) return true;
    return tile.name === tileSelector;
};

/**
 * `dashboards run --tile <slug>` 的本地磁贴过滤（纯函数）：
 * 对 structuredContent 或 content JSON 里的 tiles 数组按 uuid/name 过滤；
 * 结构不符（无 tiles 数组）时原样返回（例如看板门控阻断 payload）。
 */
export const filterDashboardTiles = (
    result: ToolResult,
    tileSelector: string,
): ToolResult => {
    const filterPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
        if (!Array.isArray(payload.tiles)) return payload;
        const kept = payload.tiles.filter((tile) => tileMatches(tile, tileSelector));
        return { ...payload, tiles: kept };
    };

    if (isRecord(result.structuredContent)) {
        return {
            ...result,
            structuredContent: filterPayload(result.structuredContent),
        };
    }

    const textBlock = result.content.find(
        (block) => block.type === 'text' && typeof block.text === 'string',
    );
    if (textBlock?.text === undefined) return result;
    try {
        const parsed: unknown = JSON.parse(textBlock.text);
        if (!isRecord(parsed) || !Array.isArray(parsed.tiles)) return result;
        const filtered = JSON.stringify(filterPayload(parsed), null, 2);
        return {
            ...result,
            content: result.content.map((block) =>
                block === textBlock ? { ...block, text: filtered } : block,
            ),
        };
    } catch {
        return result;
    }
};

export const dashboardsCommands: CommandSpec[] = [
    {
        name: 'dashboards list',
        description: '列出指定 space 内的看板（spaceUuid 必填）',
        options: [
            {
                flags: '--space <spaceUuid>',
                description: '目标 space 的 UUID，必填',
            },
            { flags: '--page <n>', description: '页码，从 1 开始' },
            {
                flags: '--page-size <n>',
                description: '每页条数（1..100，超过 100 截断到 100）',
            },
            { flags: '--full', description: '返回完整内容摘要' },
        ],
        example: 'msy-x dashboards list --space 3f5d1b0e-1111-4222-8333-444455556666',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const { space } = input.options;
            if (typeof space !== 'string' || space.trim() === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少必填选项 --space <spaceUuid>',
                    hint: '先运行 msy-x search <关键词> --type dashboard 找到看板所在 space，或 msy-x spaces list 列出 space',
                });
            }
            const args: Record<string, unknown> = { spaceUuid: space.trim() };
            const page = parsePositiveInt(input.options.page, '--page');
            if (page !== null) args.page = page;
            const pageSize = parsePageSize(input.options.pageSize);
            if (pageSize !== null) args.pageSize = pageSize;
            if (input.options.full === true) args.full = true;
            return [
                { tool: 'list_dashboards', args: withProject(args, input.projectUuid) },
            ];
        },
    },
    {
        name: 'dashboards find <query>',
        description: '按关键词搜索看板',
        options: [
            {
                flags: '--page-size <n>',
                description: '每页条数（1..100，超过 100 截断到 100）',
            },
            { flags: '--full', description: '返回完整内容摘要' },
        ],
        example: 'msy-x dashboards find 品类',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {
                searchQueries: [{ label: requireQuery(input.args.query) }],
            };
            const pageSize = parsePageSize(input.options.pageSize);
            if (pageSize !== null) args.pageSize = pageSize;
            if (input.options.full === true) args.full = true;
            return [
                {
                    tool: 'find_dashboards',
                    args: withProject(args, input.projectUuid),
                },
            ];
        },
    },
    {
        name: 'dashboards tiles <dashboardUuid>',
        description: '查看看板磁贴布局（UUID 或 slug；不执行查询）',
        options: [],
        example: 'msy-x dashboards tiles d54853b1-85df-4ab3-8cdf-70a5244640e1',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => [
            {
                tool: 'get_dashboard_tiles',
                args: withProject(
                    { dashboardUuid: requirePositional(input.args.dashboardUuid, 'dashboardUuid') },
                    input.projectUuid,
                ),
            },
        ],
    },
    {
        name: 'dashboards run <dashboardUuid>',
        description: '执行看板全部磁贴查询（--tile 只在渲染前过滤，仍跑整板）',
        options: [
            {
                flags: '--tile <slug|uuid|name>',
                description: '只展示指定磁贴（服务端仍执行整板）',
            },
            { flags: '--limit <n>', description: '每个磁贴的行数上限' },
            {
                flags: '--value-format <raw|formatted>',
                description: '单元格取值格式（默认 raw）',
            },
        ],
        example: 'msy-x dashboards run d54853b1-85df-4ab3-8cdf-70a5244640e1 --limit 50',
        dataCommand: true,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {
                dashboardUuid: requirePositional(
                    input.args.dashboardUuid,
                    'dashboardUuid',
                ),
            };
            const limit = parseLimit(input.options.limit);
            if (limit !== null) args.limit = limit;
            const valueFormat = parseValueFormat(input.options.valueFormat);
            if (valueFormat !== null) args.valueFormat = valueFormat;
            // 注意：--tile 不进服务端参数（run_dashboard_tiles 无磁贴筛选入参）
            return [
                {
                    tool: 'run_dashboard_tiles',
                    args: withProject(args, input.projectUuid),
                },
            ];
        },
    },
    {
        name: 'dashboards get <dashboardUuid>',
        description: '查看看板定义 JSON（别名：dashboards code）',
        options: [
            {
                flags: '--full',
                description: '包含看板过滤、参数、tab 与磁贴原始定义',
            },
        ],
        example: 'msy-x dashboards get d54853b1-85df-4ab3-8cdf-70a5244640e1 --full',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {
                dashboardUuid: requirePositional(
                    input.args.dashboardUuid,
                    'dashboardUuid',
                ),
            };
            if (input.options.full === true) args.full = true;
            return [
                {
                    tool: 'get_dashboard_code',
                    args: withProject(args, input.projectUuid),
                },
            ];
        },
    },
];
