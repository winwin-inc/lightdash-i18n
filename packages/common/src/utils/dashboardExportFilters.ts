import moment from 'moment-timezone';
import { type ItemsMap } from '../types/field';
import {
    FilterOperator,
    isDateRangeDynamic,
    isSingleDateDynamic,
    resolveDateRangeValues,
    resolveSingleDateValue,
    UnitOfTime,
    type DashboardFilterRule,
    type DashboardFilters,
} from '../types/filter';
import { type TimeFrames } from '../types/timeFrames';
import { getDashboardFilterRulesForTile } from './filters';

/**
 * 看板导出（CSV / XLSX）使用的筛选器处理。
 *
 * 页面上的图表查询会把「全局筛选器 + 当前 Tab 筛选器」合并后按 tile 收敛；
 * 导出走的是后端任务，同样需要这套口径，否则导出结果里看不到 Tab 筛选器
 * （典型症状：某个集团出现在所有时间维度上）。
 */

/** 每次返回新对象：调用方后续可能追加/重写数组，共享实例会被污染 */
export const getEmptyDashboardFilters = (): DashboardFilters => ({
    dimensions: [],
    metrics: [],
    tableCalculations: [],
});

/** 只读空筛选器；需要可修改时用 getEmptyDashboardFilters() */
export const EMPTY_DASHBOARD_FILTERS: DashboardFilters =
    getEmptyDashboardFilters();

const concatFilters = (
    ...filterSets: Array<DashboardFilters | undefined>
): DashboardFilters => ({
    dimensions: filterSets.flatMap((filters) => filters?.dimensions ?? []),
    metrics: filterSets.flatMap((filters) => filters?.metrics ?? []),
    tableCalculations: filterSets.flatMap(
        (filters) => filters?.tableCalculations ?? [],
    ),
});

/**
 * 合并全局筛选器与 Tab 筛选器，各自受启用开关控制（与前端页面查询一致）。
 * 被关闭的一层仍保留定义，只是不参与查询。
 */
export const mergeDashboardFiltersForTab = ({
    globalFilters,
    tabFilters,
    isGlobalFilterEnabled,
    isTabFilterEnabled,
}: {
    globalFilters: DashboardFilters;
    tabFilters: DashboardFilters | undefined;
    isGlobalFilterEnabled: boolean;
    isTabFilterEnabled: boolean;
}): DashboardFilters => {
    const resolvedGlobalFilters = isGlobalFilterEnabled
        ? globalFilters
        : getEmptyDashboardFilters();

    if (!isTabFilterEnabled || !tabFilters) {
        return resolvedGlobalFilters;
    }

    return concatFilters(resolvedGlobalFilters, tabFilters);
};

/**
 * 后端按看板定义（无前端状态）解析某个 Tab 生效的筛选器。
 * 开关缺省视为开启，与前端 `isGlobalFilterEnabled` / `tabFilterEnabled` 的缺省一致。
 */
export const getDashboardFiltersForTab = ({
    dashboard,
    tabUuid,
    globalFilters,
}: {
    dashboard: {
        filters: DashboardFilters;
        tabs?: Array<{ uuid: string; filters?: DashboardFilters }>;
        config?: {
            isGlobalFilterEnabled?: boolean;
            tabFilterEnabled?: Record<string, boolean>;
        };
    };
    tabUuid: string;
    /** 覆盖看板保存的全局筛选器（一次性导出传入的当前值 / 交付覆盖值） */
    globalFilters?: DashboardFilters;
}): DashboardFilters =>
    mergeDashboardFiltersForTab({
        globalFilters: globalFilters ?? dashboard.filters,
        tabFilters: dashboard.tabs?.find((tab) => tab.uuid === tabUuid)?.filters,
        isGlobalFilterEnabled: dashboard.config?.isGlobalFilterEnabled !== false,
        isTabFilterEnabled: dashboard.config?.tabFilterEnabled?.[tabUuid] ?? true,
    });

/**
 * 收敛到单个 tile（看板筛选器可以只作用于部分图表）。
 */
export const getDashboardFiltersForTile = ({
    filters,
    tileUuid,
}: {
    filters: DashboardFilters;
    tileUuid: string;
}): DashboardFilters => ({
    dimensions: getDashboardFilterRulesForTile(tileUuid, filters.dimensions),
    metrics: getDashboardFilterRulesForTile(tileUuid, filters.metrics),
    tableCalculations: getDashboardFilterRulesForTile(
        tileUuid,
        filters.tableCalculations,
    ),
});

/** 导出文件里前置的「筛选器常量列」 */
export type ExportFilterColumn = {
    header: string;
    value: string;
};

const isBetweenOperator = (rule: DashboardFilterRule): boolean =>
    rule.operator === FilterOperator.IN_BETWEEN ||
    rule.operator === FilterOperator.NOT_IN_BETWEEN;

const isRelativeDateOperator = (rule: DashboardFilterRule): boolean =>
    rule.operator === FilterOperator.IN_THE_PAST ||
    rule.operator === FilterOperator.NOT_IN_THE_PAST ||
    rule.operator === FilterOperator.IN_THE_NEXT ||
    rule.operator === FilterOperator.IN_THE_CURRENT ||
    rule.operator === FilterOperator.NOT_IN_THE_CURRENT;

const NOT_PREFIXED_OPERATORS: FilterOperator[] = [
    FilterOperator.NOT_EQUALS,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.NOT_IN_THE_CURRENT,
];

const COMPARISON_OPERATOR_LABELS: Partial<Record<FilterOperator, string>> = {
    [FilterOperator.EQUALS]: '',
    [FilterOperator.INCLUDE]: '',
    [FilterOperator.NOT_EQUALS]: '!=',
    [FilterOperator.NOT_INCLUDE]: '!=',
    [FilterOperator.GREATER_THAN]: '>',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: '>=',
    [FilterOperator.LESS_THAN]: '<',
    [FilterOperator.LESS_THAN_OR_EQUAL]: '<=',
    [FilterOperator.STARTS_WITH]: 'starts with',
    [FilterOperator.ENDS_WITH]: 'ends with',
};

const formatDay = (date: moment.Moment): string => {
    const value = date;
    return value.startOf('day').format('YYYY-MM-DD');
};

/**
 * 相对时间算子（近 N 个月 / 本月 / 未来 N 周）在结果里只是几个数字，
 * 直接导出成 `3` 没有意义，所以按查询侧口径解析成具体区间。
 * 这里只做展示，不参与查询编译。
 */
const resolveRelativeDateRange = (
    rule: DashboardFilterRule,
    timezone?: string,
): [string, string] | null => {
    // settings 在 DashboardFilterRule 上是 untyped bag：按用到的字段收窄
    const settings = rule.settings as
        | { unitOfTime?: UnitOfTime; completed?: boolean }
        | undefined;
    const unitOfTime = settings?.unitOfTime ?? UnitOfTime.days;
    const count = Number(rule.values?.[0] ?? 1);
    const now = timezone ? moment().tz(timezone) : moment();

    switch (rule.operator) {
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return [
                formatDay(now.clone().startOf(unitOfTime)),
                formatDay(now.clone().endOf(unitOfTime)),
            ];
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST: {
            if (settings?.completed) {
                const end = now.clone().startOf(unitOfTime);
                return [
                    formatDay(end.clone().subtract(count, unitOfTime)),
                    formatDay(end.clone().subtract(1, 'day')),
                ];
            }
            return [
                formatDay(now.clone().subtract(count, unitOfTime)),
                formatDay(now),
            ];
        }
        case FilterOperator.IN_THE_NEXT:
            return [
                formatDay(now),
                formatDay(now.clone().add(count, unitOfTime)),
            ];
        default:
            return null;
    }
};

const getRuleValues = (
    rule: DashboardFilterRule,
    timezone?: string,
): string[] => {
    if (isRelativeDateOperator(rule)) {
        const relativeRange = resolveRelativeDateRange(rule, timezone);
        return relativeRange ?? [];
    }

    if (isBetweenOperator(rule) || isDateRangeDynamic(rule)) {
        const [start, end] = resolveDateRangeValues(
            rule,
            rule.dateRangeGranularity as TimeFrames | undefined,
            new Date(),
            timezone,
        );
        if (start || end) {
            return [start ?? '', end ?? ''];
        }
    }

    if (isSingleDateDynamic(rule) && rule.operator === FilterOperator.EQUALS) {
        const resolved = resolveSingleDateValue(rule, new Date(), timezone);
        return resolved == null ? [] : [resolved];
    }

    return (rule.values ?? [])
        .filter((value) => value != null && value !== '')
        .map((value) => String(value));
};

/**
 * 把一条看板筛选器格式化成可读的取值文本；无确定值（如「任意值」）返回 null。
 * 区间类算子输出 `start ~ end`（单边时只输出有值的一侧），
 * 比较类算子带上符号（`>=`、`!=`），相对时间算子输出解析后的区间。
 */
export const formatDashboardFilterRuleValue = (
    rule: DashboardFilterRule,
    timezone?: string,
): string | null => {
    if (rule.disabled) return null;

    if (isRelativeDateOperator(rule)) {
        const [start, end] = getRuleValues(rule, timezone);
        if (!start && !end) return null;
        const range = start && end ? `${start} ~ ${end}` : `${start || end}`;
        return NOT_PREFIXED_OPERATORS.includes(rule.operator)
            ? `not (${range})`
            : range;
    }

    const values = getRuleValues(rule, timezone);
    if (values.length === 0) return null;

    if (isBetweenOperator(rule)) {
        const [start, end] = values;
        const isNegated = rule.operator === FilterOperator.NOT_IN_BETWEEN;
        const range =
            start && end ? `${start} ~ ${end}` : `${start || end || ''}`;
        if (!range) return null;
        return isNegated ? `not (${range})` : range;
    }

    const formatted =
        values.filter((value) => value !== '').join(', ') || null;
    if (formatted === null) return null;

    const operatorLabel = COMPARISON_OPERATOR_LABELS[rule.operator];
    return operatorLabel ? `${operatorLabel} ${formatted}`.trim() : formatted;
};

const getRuleHeader = (
    rule: DashboardFilterRule,
    itemMap?: ItemsMap,
): string => {
    const customLabel = rule.label?.trim();
    if (customLabel) return customLabel;

    // 表计算没有 label，用 displayName；SQL 列在筛选器上带 fieldLabel
    const item = itemMap?.[rule.target.fieldId];
    let itemLabel: string | undefined;
    if (item && 'label' in item) {
        itemLabel = item.label;
    } else if (item && 'displayName' in item) {
        itemLabel = item.displayName;
    }
    return (
        itemLabel?.trim() || rule.target.fieldLabel?.trim() || rule.target.fieldId
    );
};

/**
 * 把生效的看板筛选器转成导出文件的前置常量列。
 * 列名取筛选器自定义名，缺失时退回字段名；同名列去重，避免 Excel 里混淆。
 */
export const getExportFilterColumns = ({
    filters,
    itemMap,
    timezone,
}: {
    filters: DashboardFilters | undefined;
    itemMap?: ItemsMap;
    /** 项目时区：相对时间/动态日期按查询侧同一时区解析 */
    timezone?: string;
}): ExportFilterColumn[] => {
    if (!filters) return [];

    const rules = [
        ...filters.dimensions,
        ...filters.metrics,
        ...filters.tableCalculations,
    ];
    const usedHeaders = new Set<string>();
    const columns: ExportFilterColumn[] = [];

    rules.forEach((rule) => {
        const value = formatDashboardFilterRuleValue(rule, timezone);
        if (value === null) return;

        const baseHeader = getRuleHeader(rule, itemMap);
        let header = baseHeader;
        let suffix = 2;
        while (usedHeaders.has(header)) {
            header = `${baseHeader} (${suffix})`;
            suffix += 1;
        }
        usedHeaders.add(header);
        columns.push({ header, value });
    });

    return columns;
};
