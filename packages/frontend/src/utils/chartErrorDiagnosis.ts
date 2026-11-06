/**
 * 图表错误诊断（纯函数，无 React / 查询结果依赖）。
 * 设计文档：docs/visualization/chart-error-diagnostics-plan.md 第 4 节。
 *
 * 硬性禁止（勿在本函数及其调用链中违反）：
 * - ❌ 不得用查询结果 fields / itemsMap（VisualizationProvider 的 itemsMap 等）判存在性
 *   —— 存在性只由编译后的 explore 判定，查询结果字段永不参与判定（先例：
 *   useColumns.tsx:349,374-375 已特意加空集守卫）。
 * - ❌ explore 为 null 时不得产出 invalid（无字段宇宙即无字段结论）。
 * - ❌ 在 AuthorizationError / NotExistsError 等类型门控命中的错误上，不得产出字段
 *   诊断或字段清单（等于泄露 schema 边界）。
 */

import {
    convertFieldRefToFieldId,
    getItemId,
    getItemMap,
    isAndFilterGroup,
    isOrFilterGroup,
    type AdditionalMetric,
    type ApiErrorDetail,
    type Explore,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';

export type ChartErrorFieldOrigin =
    | 'query'
    | 'filter'
    | 'sort'
    | 'dashboardFilter'
    | 'dashboardSort'
    | 'dateZoom'
    | 'unknown';

export type ChartErrorDiagnosisKind =
    | 'field'
    | 'permission'
    | 'notFound'
    | 'warehouse'
    | 'parameter'
    | 'unknown';

export type ChartErrorInvalidField = {
    fieldId: string;
    label: string | null;
    group: 'dimension' | 'metric' | 'tableCalculation' | 'unknown';
    origin: ChartErrorFieldOrigin;
};

export type ChartErrorDiagnosis = {
    kind: ChartErrorDiagnosisKind;
    invalid: ChartErrorInvalidField[];
    /** 本次查询声明的全部字段 id（供「共 N 个字段」展示） */
    declaredFieldIds: string[];
    /** 是否有把握断言 invalid 就是出错字段 */
    confident: boolean;
};

/**
 * 文本回退正则（逐字对照后端源码，勿改）：
 * - 1: packages/backend/src/utils/QueryBuilder/utils.ts:147,186
 * - 2: packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts:1308
 * - 3: packages/backend/src/queryCompiler.ts:151
 * - 4: packages/common/src/compiler/exploreCompiler.ts:451,592（模型定义坏，
 *   不算图表字段）
 */
const QUERY_UNKNOWN_FIELD_RE =
    /Tried to reference (?:dimension|metric) with unknown field id: (\S+)\s*$/;
const QUERY_UNKNOWN_FIELD_KIND_RE =
    /Tried to reference (dimension|metric) with unknown field id/;
const FILTER_UNKNOWN_FIELD_RE =
    /Filter has a reference to an unknown (dimension|metric): (\S+)\s*$/;
const TABLE_CALC_REFERENCE_RE =
    /Table calculation contains a reference "([^"]+)" to a field/;
const EXPLORE_UNKNOWN_FIELD_RE =
    /has a reference to an unknown (?:field|dimension): (\S+)\s*$/;

type FieldHit = {
    fieldId: string;
    group: ChartErrorInvalidField['group'];
};

const collectFilterGroupFieldIds = (
    group: FilterGroup | undefined,
): string[] => {
    if (!group) return [];
    const items: FilterGroupItem[] = isOrFilterGroup(group)
        ? group.or
        : group.and;
    const ids: string[] = [];
    for (const item of items) {
        if (isOrFilterGroup(item) || isAndFilterGroup(item)) {
            ids.push(...collectFilterGroupFieldIds(item));
        } else {
            const target = (item as FilterRule).target;
            if (
                target &&
                typeof target === 'object' &&
                typeof target.fieldId === 'string'
            ) {
                ids.push(target.fieldId);
            }
        }
    }
    return ids;
};

const getFilterFieldIds = (metricQuery: MetricQuery): string[] => [
    // 历史 saved 数据的 filters 可能整体缺失（#14-②），可选链防御
    ...collectFilterGroupFieldIds(metricQuery.filters?.dimensions),
    ...collectFilterGroupFieldIds(metricQuery.filters?.metrics),
    ...collectFilterGroupFieldIds(metricQuery.filters?.tableCalculations),
];

const getDeclaredFieldIds = (metricQuery: MetricQuery): string[] => {
    const additionalMetrics: AdditionalMetric[] =
        metricQuery.additionalMetrics ?? [];
    return [
        ...new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map((tc) => tc.name),
            ...getFilterFieldIds(metricQuery),
            ...metricQuery.sorts.map((sort) => sort.fieldId),
            ...(metricQuery.customDimensions ?? []).map((cd) => cd.id),
            // additionalMetrics 的真实 fieldId 是 getItemId(am) = `${table}_${name}`，
            // 不是 am.name（否则含自定义指标的图表会凭空多出一个 invalid 字段）
            ...additionalMetrics.map((am) => getItemId(am)),
        ]),
    ];
};

type QueryContext = {
    dimensionIds: string[];
    metricIds: string[];
    tableCalculationIds: string[];
    additionalMetricIds: string[];
    customDimensionIds: string[];
    filterFieldIds: string[];
    sortFieldIds: string[];
    dashboardFilterFieldIds: string[];
    dashboardSortFieldIds: string[];
};

const getQueryContext = (
    metricQuery: MetricQuery | undefined,
    dashboardFilterFieldIds: string[] | undefined,
    dashboardSortFieldIds: string[] | undefined,
): QueryContext => ({
    dimensionIds: metricQuery?.dimensions ?? [],
    metricIds: metricQuery?.metrics ?? [],
    tableCalculationIds:
        metricQuery?.tableCalculations.map((tc) => tc.name) ?? [],
    additionalMetricIds:
        // 与 getDeclaredFieldIds 一致：additionalMetrics 用真实 id（getItemId）
        metricQuery?.additionalMetrics?.map((am) => getItemId(am)) ?? [],
    customDimensionIds: metricQuery?.customDimensions?.map((cd) => cd.id) ?? [],
    filterFieldIds: metricQuery ? getFilterFieldIds(metricQuery) : [],
    sortFieldIds: metricQuery?.sorts.map((sort) => sort.fieldId) ?? [],
    dashboardFilterFieldIds: dashboardFilterFieldIds ?? [],
    dashboardSortFieldIds: dashboardSortFieldIds ?? [],
});

const getOrigin = (
    fieldId: string,
    ctx: QueryContext,
): ChartErrorFieldOrigin => {
    if (
        ctx.dimensionIds.includes(fieldId) ||
        ctx.metricIds.includes(fieldId) ||
        ctx.tableCalculationIds.includes(fieldId)
    ) {
        return 'query';
    }
    if (ctx.filterFieldIds.includes(fieldId)) {
        return 'filter';
    }
    if (ctx.sortFieldIds.includes(fieldId)) {
        return 'sort';
    }
    if (ctx.dashboardFilterFieldIds.includes(fieldId)) {
        return 'dashboardFilter';
    }
    if (ctx.dashboardSortFieldIds.includes(fieldId)) {
        return 'dashboardSort';
    }
    // 都不在任何声明集合中：来源无法可靠识别时如实标 unknown（dateZoom
    // 的时间粒度 id 无法与前述集合区分开，不硬猜）
    return 'unknown';
};

const getGroup = (
    fieldId: string,
    ctx: QueryContext,
    fallback: ChartErrorInvalidField['group'] = 'unknown',
): ChartErrorInvalidField['group'] => {
    if (ctx.dimensionIds.includes(fieldId)) return 'dimension';
    if (ctx.customDimensionIds.includes(fieldId)) return 'dimension';
    if (ctx.metricIds.includes(fieldId)) return 'metric';
    if (ctx.additionalMetricIds.includes(fieldId)) return 'metric';
    if (ctx.tableCalculationIds.includes(fieldId)) return 'tableCalculation';
    return fallback;
};

export const getChartErrorDiagnosis = (args: {
    error: Pick<ApiErrorDetail, 'name' | 'statusCode' | 'message' | 'data'>;
    metricQuery: MetricQuery | undefined;
    explore: Explore | null;
    /** 看板筛选引用的字段 id（仅看板场景传） */
    dashboardFilterFieldIds?: string[];
    /** 看板排序引用的字段 id（仅看板场景传） */
    dashboardSortFieldIds?: string[];
}): ChartErrorDiagnosis => {
    const {
        error,
        metricQuery,
        explore,
        dashboardFilterFieldIds,
        dashboardSortFieldIds,
    } = args;
    const message = error.message ?? '';

    const gated = (kind: ChartErrorDiagnosisKind): ChartErrorDiagnosis => ({
        kind,
        invalid: [],
        declaredFieldIds: [],
        confident: false,
    });

    // 0. 类型门控（先于任何字段推断）：门控命中的错误不展示字段清单
    if (
        error.name === 'AuthorizationError' ||
        error.name === 'ForbiddenError'
    ) {
        return gated('permission');
    }
    if (error.name === 'NotExistsError') {
        return gated('notFound');
    }
    if (error.name === 'WarehouseQueryError') {
        return gated('warehouse');
    }
    if (
        error.name === 'ParameterError' ||
        message.includes('Missing required parameters')
    ) {
        return gated('parameter');
    }
    // 只有 FieldReferenceError / CompileError 继续做字段推断；
    // 其余错误名（含执行期轮询合成的 statusCode 500）一律不做字段推断
    if (error.name !== 'FieldReferenceError' && error.name !== 'CompileError') {
        return gated('unknown');
    }

    const ctx = getQueryContext(
        metricQuery,
        dashboardFilterFieldIds,
        dashboardSortFieldIds,
    );
    const declaredFieldIds = metricQuery
        ? getDeclaredFieldIds(metricQuery)
        : [];

    // 合法字段宇宙与 label 查找只依赖 explore（+ 查询声明的派生字段），
    // 与查询结果无关
    const itemsMap: ItemsMap | null =
        explore === null
            ? null
            : getItemMap(
                  explore,
                  metricQuery?.additionalMetrics ?? [],
                  metricQuery?.tableCalculations ?? [],
                  metricQuery?.customDimensions ?? [],
              );
    const getLabel = (fieldId: string): string | null => {
        const item = itemsMap ? itemsMap[fieldId] : undefined;
        return item && 'label' in item && typeof item.label === 'string'
            ? item.label
            : null;
    };

    const fieldHits: FieldHit[] = [];

    // 1. 结构化优先：error.data?.fieldId（运行时值可能是 number，先 String() 防御）
    const dataFieldId: unknown = error.data?.fieldId;
    if (typeof dataFieldId === 'string' || typeof dataFieldId === 'number') {
        const fieldId = String(dataFieldId);
        fieldHits.push({ fieldId, group: getGroup(fieldId, ctx) });
    } else {
        // 2. 文本回退（正则逐字对照后端源码）。
        // 注意：正则 1/2/3 须先于正则 4 尝试——MetricQueryBuilder 的筛选文案
        // 也以 "has a reference to an unknown dimension: X" 结尾，会被更宽的
        // exploreCompiler 正则吞掉。
        const queryMatch = message.match(QUERY_UNKNOWN_FIELD_RE);
        if (queryMatch) {
            const kindMatch = message.match(QUERY_UNKNOWN_FIELD_KIND_RE);
            fieldHits.push({
                fieldId: queryMatch[1],
                group: kindMatch?.[1] === 'metric' ? 'metric' : 'dimension',
            });
        } else {
            const filterMatch = message.match(FILTER_UNKNOWN_FIELD_RE);
            if (filterMatch) {
                fieldHits.push({
                    fieldId: filterMatch[2],
                    group: filterMatch[1] === 'metric' ? 'metric' : 'dimension',
                });
            } else {
                const tableCalcMatch = message.match(TABLE_CALC_REFERENCE_RE);
                if (tableCalcMatch) {
                    // 后端文案捕获到的是 "table.field" 引用，须归一化成
                    // fieldId（table_field）才能查 itemsMap / 参与归因；
                    // 引用不带表名（非 table.field 形态）时降级为原值，不抛
                    const rawRef = tableCalcMatch[1];
                    let tcFieldId = rawRef;
                    try {
                        tcFieldId = convertFieldRefToFieldId(rawRef);
                    } catch {
                        tcFieldId = rawRef;
                    }
                    fieldHits.push({
                        fieldId: tcFieldId,
                        group: 'tableCalculation',
                    });
                } else if (EXPLORE_UNKNOWN_FIELD_RE.test(message)) {
                    // 「模型定义坏」（如 show_underlying_values / metric filter
                    // 引用未知维度），不归到图表字段
                    return {
                        kind: 'unknown',
                        invalid: [],
                        declaredFieldIds,
                        confident: true,
                    };
                }
            }
        }
    }

    // 命中结构化 data.fieldId 或文本正则 1/2/3 才有把握断言出错字段
    let confident = fieldHits.length > 0;

    const invalidByFieldId = new Map<string, ChartErrorInvalidField>();
    for (const hit of fieldHits) {
        invalidByFieldId.set(hit.fieldId, {
            fieldId: hit.fieldId,
            label: getLabel(hit.fieldId),
            group: hit.group,
            origin: getOrigin(hit.fieldId, ctx),
        });
    }

    // 5. 结构差集（仅 explore 非空时）：声明了但字段宇宙里不存在的字段也并入
    //    invalid（additionalMetric 父表没了会被 getItemMap 跳过 → label 为 null）
    if (explore !== null && itemsMap && metricQuery) {
        for (const fieldId of declaredFieldIds) {
            if (!itemsMap[fieldId] && !invalidByFieldId.has(fieldId)) {
                invalidByFieldId.set(fieldId, {
                    fieldId,
                    label: getLabel(fieldId),
                    group: getGroup(fieldId, ctx),
                    origin: getOrigin(fieldId, ctx),
                });
            }
        }
    }

    return {
        kind: 'field',
        invalid: [...invalidByFieldId.values()],
        declaredFieldIds,
        confident,
    };
};
