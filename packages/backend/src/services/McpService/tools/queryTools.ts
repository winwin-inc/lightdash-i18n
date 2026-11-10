import {
    AnyType,
    CompiledField,
    Explore,
    FieldType,
    FilterOperator,
    Filters,
    FilterGroup,
    getFields,
    getItemId,
    getItemLabelWithoutTableName,
    getItemType,
    isExploreError,
    ParameterError,
    QueryExecutionContext,
} from '@lightdash/common';
import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import { assertExploreQueryable } from './access/assertExploreQueryable';
import { createRequiredDashboardGuard } from './access/requiredDashboardContext';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import {
    PROJECT_UUID_PARAM_DESCRIPTION,
    resolveProjectContext,
} from './projectContext';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DEFAULT_QUERY_LIMIT = 500;

const filterRuleSchema = z.object({
    fieldId: z
        .string()
        .describe('Field id of the field to filter on, e.g. "orders_status".'),
    operator: z
        .nativeEnum(FilterOperator)
        .describe(
            'Filter operator, e.g. "equals", "notEquals", "inThePast", "include".',
        ),
    values: z
        .array(z.any())
        .optional()
        .describe('Values the field is compared against.'),
});

const filtersSchema = z.object({
    dimensions: z
        .array(filterRuleSchema)
        .optional()
        .describe('Filters applied to dimensions. All rules are ANDed together.'),
    metrics: z
        .array(filterRuleSchema)
        .optional()
        .describe('Filters applied to metrics. All rules are ANDed together.'),
});

type ListExploresArgs = {
    projectUuid?: string;
    exploreName?: string;
    page?: number;
    pageSize?: number;
};

type FilterRuleArgs = z.infer<typeof filterRuleSchema>;
type FiltersArgs = z.infer<typeof filtersSchema>;

type RunSemanticMetricQueryArgs = {
    projectUuid?: string;
    exploreName: string;
    metrics: string[];
    dimensions?: string[];
    filters?: FiltersArgs;
    limit?: number;
    /** 强制看板模式（dashboardStrict）下传入的关联看板 UUID */
    dashboardUuid?: string;
};

type ExploreSummary = {
    name: string;
    label: string;
    description: string | null;
    tableCount: number;
    baseTable: string | null;
    tags: string[];
};

type QueryColumn = {
    fieldId: string;
    label: string;
    type: string;
};

const listExploresArgsSchema = {
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
    exploreName: z
        .string()
        .optional()
        .describe(
            'Optional filter. Only explores whose name or label matches (case-insensitive) are returned.',
        ),
    page: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based page number. Defaults to 1.'),
    pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_SIZE)
        .optional()
        .describe(
            `Number of explores per page. Defaults to ${DEFAULT_PAGE_SIZE}, maximum ${MAX_PAGE_SIZE}.`,
        ),
};

const runSemanticMetricQueryArgsSchema = {
    projectUuid: z
        .string()
        .optional()
        .describe(PROJECT_UUID_PARAM_DESCRIPTION),
    exploreName: z
        .string()
        .describe('Name of the explore (table) to query, e.g. "orders".'),
    metrics: z
        .array(z.string())
        .describe(
            'Metric field ids to compute, e.g. ["orders_total_revenue"].',
        ),
    dimensions: z
        .array(z.string())
        .optional()
        .describe(
            'Dimension field ids to group by, e.g. ["orders_status"].',
        ),
    filters: filtersSchema
        .optional()
        .describe(
            'Optional filters. `dimensions` filters apply to dimensions, `metrics` filters apply to metrics. Every rule has {fieldId, operator, values}.',
        ),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            'Maximum number of rows to return. Defaults to 500 and is capped by the server query limit.',
        ),
};

/**
 * 强制看板模式（MCP_DASHBOARD_STRICT，对齐 v1 环境变量同名义）。
 *
 * 默认 false：内部分析师零影响，除「预检文案口径」外路径行为完全不变。
 */
const isDashboardStrict = (deps: McpToolDeps): boolean =>
    deps.lightdashConfig.mcp?.dashboardStrict === true;

const dashboardUuidStrictParamSchema = z
    .string()
    .optional()
    .describe(
        '强制看板模式：本次查询关联的看板 UUID。未传时按 exploreName 反查关联看板（唯一则自动使用；多个返回 status=dashboard_selection_required；一个都没有返回 dashboard_configuration_required）。',
    );

const matchesExploreName = (
    exploreName: string,
    label: string,
    search: string,
): boolean => {
    const needle = search.trim().toLowerCase();
    if (needle === '') {
        return true;
    }
    return (
        exploreName.toLowerCase().includes(needle) ||
        label.toLowerCase().includes(needle)
    );
};

/**
 * Finds a field of the explore from a user supplied reference.
 *
 * Accepts the field id (`table_field`), the field name (`field`), the table
 * qualified name (`table.field`) or the field label.
 */
const findExploreField = (
    explore: Explore,
    reference: string,
): CompiledField | undefined => {
    const needle = reference.trim().toLowerCase();
    const fields = getFields(explore);

    const byFieldId = fields.find(
        (field) => getItemId(field).toLowerCase() === needle,
    );
    if (byFieldId) {
        return byFieldId;
    }

    const byDottedId = fields.find(
        (field) => getItemId(field).replace(/_/g, '.').toLowerCase() === needle,
    );
    if (byDottedId) {
        return byDottedId;
    }

    const byName = fields.find(
        (field) => field.name.toLowerCase() === needle,
    );
    if (byName) {
        return byName;
    }

    return fields.find((field) => field.label.toLowerCase() === needle);
};

/**
 * Resolves a user supplied field reference to a field id of the explore,
 * making sure it is of the expected type.
 */
const resolveFieldId = (
    explore: Explore,
    reference: string,
    expectedType: FieldType.DIMENSION | FieldType.METRIC,
): string => {
    const field = findExploreField(explore, reference);

    if (!field) {
        throw new ParameterError(
            `Field "${reference}" does not exist in explore "${explore.name}"`,
        );
    }

    if (field.fieldType !== expectedType) {
        throw new ParameterError(
            `Field "${reference}" is not a ${
                expectedType === FieldType.METRIC ? 'metric' : 'dimension'
            } in explore "${explore.name}"`,
        );
    }

    return getItemId(field);
};

const convertFilters = (
    filters: FiltersArgs | undefined,
    explore: Explore,
): Filters => {
    if (!filters) {
        return {};
    }

    const convertRules = (
        rules: FilterRuleArgs[] | undefined,
        expectedType: FieldType.DIMENSION | FieldType.METRIC,
    ): FilterGroup | undefined => {
        if (!rules || rules.length === 0) {
            return undefined;
        }

        return {
            id: 'mcp-filter-group',
            and: rules.map((rule) => ({
                id: `mcp-filter-${rule.fieldId}`,
                operator: rule.operator,
                values: rule.values,
                target: {
                    fieldId: resolveFieldId(
                        explore,
                        rule.fieldId,
                        expectedType,
                    ),
                },
            })),
        };
    };

    return {
        dimensions: convertRules(filters.dimensions, FieldType.DIMENSION),
        metrics: convertRules(filters.metrics, FieldType.METRIC),
    };
};

/**
 * Registers the query and catalog tools: listing the explores of a project and
 * running a semantic (dbt) metric query.
 */
export const registerQueryTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    const strict = isDashboardStrict(deps);
    // 严格模式 guard（仅 strict 时创建；反查/预检缓存在 guard 模块内共享）
    const dashboardGuard = strict
        ? createRequiredDashboardGuard(deps)
        : null;

    registry.register(
        McpToolName.LIST_EXPLORES,
        {
            description:
                'List the explores (tables) available in a Lightdash project, with their labels, a short description, the number of tables they contain and their base table. Use it to discover which tables and fields can be queried.',
            inputSchema: listExploresArgsSchema,
        },
        async (args, context) => {
            const {
                projectUuid: explicitProjectUuid,
                exploreName,
                page = 1,
                pageSize = DEFAULT_PAGE_SIZE,
            } = args as ListExploresArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            // `getAllExploresSummary` applies the project view permission, the
            // viewer explore allow list and the user attribute filtering.
            const summaries = await deps.projectService.getAllExploresSummary(
                context.account,
                projectUuid,
                true,
                false,
            );

            const matching = summaries.filter((summary) =>
                matchesExploreName(
                    summary.name,
                    summary.label,
                    exploreName ?? '',
                ),
            );

            const total = matching.length;
            const start = (page - 1) * pageSize;
            const pageItems = matching.slice(start, start + pageSize);

            const explores = await deps.projectService.findExplores({
                account: context.account,
                projectUuid,
                exploreNames: pageItems.map((summary) => summary.name),
            });

            const result: ExploreSummary[] = pageItems.map((summary) => {
                const explore = explores[summary.name];
                const isValidExplore = explore !== undefined && !isExploreError(explore);

                return {
                    name: summary.name,
                    label: summary.label,
                    description: summary.description ?? null,
                    tableCount: isValidExplore
                        ? Object.keys(explore.tables).length
                        : 0,
                    baseTable: isValidExplore ? explore.baseTable : null,
                    tags: summary.tags ?? [],
                };
            });

            return jsonToolResult({
                projectUuid,
                explores: result,
                total,
            });
        },
    );

    registry.register(
        McpToolName.RUN_SEMANTIC_METRIC_QUERY,
        {
            description:
                'Run a semantic (dbt) metric query on a Lightdash explore and get the resulting rows. Provide the explore name, the metrics to compute and optionally the dimensions to group by, filters and a row limit.',
            // 强制看板模式：schema 增加可选 dashboardUuid 参数（非 strict 时保持原 schema）
            inputSchema: strict
                ? {
                      ...runSemanticMetricQueryArgsSchema,
                      dashboardUuid: dashboardUuidStrictParamSchema,
                  }
                : runSemanticMetricQueryArgsSchema,
        },
        async (args, context) => {
            const {
                projectUuid: explicitProjectUuid,
                exploreName,
                metrics,
                dimensions = [],
                filters,
                limit,
                dashboardUuid,
            } = args as RunSemanticMetricQueryArgs;

            const { projectUuid } = await resolveProjectContext(
                deps,
                context,
                explicitProjectUuid,
            );

            if (metrics.length === 0 && dimensions.length === 0) {
                throw new ParameterError(
                    'Query must have at least one metric or dimension',
                );
            }

            // v1 对齐（registerQueryTools）：执行前预检 explore 可查，
            // 拒绝时抛出「受控角色 / 非受控角色」两行中文文案，不会跑数。
            // 预检在 strict 与非 strict 下都执行（dashboardStrict 只影响文案口径）。
            await assertExploreQueryable(
                deps,
                context,
                projectUuid,
                exploreName,
                'metric',
                { dashboardStrict: strict },
            );

            // 强制看板模式：查数前必须解析出已验证的 dashboardUuid，
            // blocked 时直接返回 guard 构造的结构化 payload，不执行查询。
            if (dashboardGuard) {
                const guardResult = await dashboardGuard.ensure(context, {
                    projectUuid,
                    dashboardUuid,
                    exploreName,
                });
                if (!guardResult.ok) {
                    return guardResult.result;
                }
            }

            const explore = await deps.projectService.getExplore(
                context.account,
                projectUuid,
                exploreName,
            );

            const metricIds = metrics.map((metric) =>
                resolveFieldId(explore, metric, FieldType.METRIC),
            );
            const dimensionIds = dimensions.map((dimension) =>
                resolveFieldId(explore, dimension, FieldType.DIMENSION),
            );

            const maxLimit =
                deps.lightdashConfig.ai.copilot.maxQueryLimit ??
                DEFAULT_QUERY_LIMIT;
            const rowLimit = Math.min(
                limit ?? DEFAULT_QUERY_LIMIT,
                maxLimit,
            );

            // Mirrors the row limit applied by `ProjectService.runMetricQuery`
            // so that the reported truncation state matches the executed query.
            const numberColumns = dimensionIds.length + metricIds.length;
            const cellsLimit = deps.lightdashConfig.query.csvCellsLimit;
            const effectiveLimit = Math.min(
                rowLimit,
                Math.floor(cellsLimit / numberColumns),
            );

            const metricQuery = {
                exploreName,
                dimensions: dimensionIds,
                metrics: metricIds,
                filters: convertFilters(filters, explore),
                sorts: [],
                limit: rowLimit,
                tableCalculations: [],
            };

            const results = await deps.projectService.runMetricQuery({
                account: context.account,
                projectUuid,
                metricQuery,
                exploreName,
                csvLimit: effectiveLimit,
                context: QueryExecutionContext.MCP,
                chartUuid: undefined,
                queryTags: {
                    project_uuid: projectUuid,
                    user_uuid: context.user.userUuid,
                    organization_uuid: context.organizationUuid,
                },
            });

            const columns: QueryColumn[] = Object.entries(
                results.fields,
            ).map(([fieldId, item]) => ({
                fieldId,
                label: getItemLabelWithoutTableName(item),
                type: getItemType(item),
            }));

            const rows = results.rows as Record<string, AnyType>[];

            return jsonToolResult({
                projectUuid,
                exploreName,
                columns,
                rows,
                rowCount: rows.length,
                truncated: rows.length >= effectiveLimit,
            });
        },
    );
};
