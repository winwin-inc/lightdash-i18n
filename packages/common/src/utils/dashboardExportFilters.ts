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

/**
 * 导出文件的文案跟随 UI 语言（后端从 csvOptions.locale 传进来，缺省中文）。
 * 值要能直接读懂：「不是 其他集团」而不是「!= 其他集团」。
 */
type ExportWording = {
    filterPrefix: string;
    between: string;
    notBetween: (range: string) => string;
    notRelative: (range: string) => string;
    notEquals: string;
    operators: Partial<Record<FilterOperator, string>>;
};

const WORDINGS: Record<'zh' | 'en', ExportWording> = {
    zh: {
        filterPrefix: '筛选：',
        between: ' 至 ',
        notBetween: (range) => `不在 ${range} 内`,
        notRelative: (range) => `不在 ${range} 内`,
        notEquals: '不是',
        operators: {
            [FilterOperator.EQUALS]: '',
            [FilterOperator.INCLUDE]: '',
            [FilterOperator.GREATER_THAN]: '大于',
            [FilterOperator.GREATER_THAN_OR_EQUAL]: '大于等于',
            [FilterOperator.LESS_THAN]: '小于',
            [FilterOperator.LESS_THAN_OR_EQUAL]: '小于等于',
            [FilterOperator.STARTS_WITH]: '开头是',
            [FilterOperator.ENDS_WITH]: '结尾是',
        },
    },
    en: {
        filterPrefix: 'Filter: ',
        between: ' to ',
        notBetween: (range) => `not between ${range}`,
        notRelative: (range) => `not in ${range}`,
        notEquals: 'is not',
        operators: {
            [FilterOperator.EQUALS]: '',
            [FilterOperator.INCLUDE]: '',
            [FilterOperator.GREATER_THAN]: '>',
            [FilterOperator.GREATER_THAN_OR_EQUAL]: '>=',
            [FilterOperator.LESS_THAN]: '<',
            [FilterOperator.LESS_THAN_OR_EQUAL]: '<=',
            [FilterOperator.STARTS_WITH]: 'starts with',
            [FilterOperator.ENDS_WITH]: 'ends with',
        },
    },
};

const getWording = (locale?: string): ExportWording =>
    (locale ?? 'zh').toLowerCase().startsWith('zh')
        ? WORDINGS.zh
        : WORDINGS.en;

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
    { timezone, locale }: { timezone?: string; locale?: string } = {},
): string | null => {
    if (rule.disabled) return null;

    const wording = getWording(locale);

    if (isRelativeDateOperator(rule)) {
        const [start, end] = getRuleValues(rule, timezone);
        if (!start && !end) return null;
        const range =
            start && end
                ? `${start}${wording.between}${end}`
                : `${start || end}`;
        return NOT_PREFIXED_OPERATORS.includes(rule.operator)
            ? wording.notRelative(range)
            : range;
    }

    const values = getRuleValues(rule, timezone);
    if (values.length === 0) return null;

    if (isBetweenOperator(rule)) {
        const [start, end] = values;
        const range =
            start && end
                ? `${start}${wording.between}${end}`
                : `${start || end || ''}`;
        if (!range) return null;
        return rule.operator === FilterOperator.NOT_IN_BETWEEN
            ? wording.notBetween(range)
            : range;
    }

    const formatted =
        values.filter((value) => value !== '').join(', ') || null;
    if (formatted === null) return null;

    if (
        rule.operator === FilterOperator.NOT_EQUALS ||
        rule.operator === FilterOperator.NOT_INCLUDE
    ) {
        return `${wording.notEquals} ${formatted}`;
    }

    const operatorLabel = wording.operators[rule.operator];
    return operatorLabel ? `${operatorLabel} ${formatted}` : formatted;
};

const getRuleHeader = (
    rule: DashboardFilterRule,
    itemMap: ItemsMap | undefined,
    locale: string | undefined,
): string => {
    const wording = getWording(locale);
    const customLabel = rule.label?.trim();
    if (customLabel) return `${wording.filterPrefix}${customLabel}`;

    // 表计算没有 label，用 displayName；SQL 列在筛选器上带 fieldLabel
    const item = itemMap?.[rule.target.fieldId];
    let itemLabel: string | undefined;
    if (item && 'label' in item) {
        itemLabel = item.label;
    } else if (item && 'displayName' in item) {
        itemLabel = item.displayName;
    }
    const fieldLabel =
        itemLabel?.trim() || rule.target.fieldLabel?.trim() || rule.target.fieldId;
    return `${wording.filterPrefix}${fieldLabel}`;
};

/**
 * 把生效的看板筛选器转成导出文件的前置常量列。
 * 列名取筛选器自定义名，缺失时退回字段名；同名列去重，避免 Excel 里混淆。
 */
export const getExportFilterColumns = ({
    filters,
    itemMap,
    timezone,
    locale,
    exportedFieldIds = [],
}: {
    filters: DashboardFilters | undefined;
    itemMap?: ItemsMap;
    /** 项目时区：相对时间/动态日期按查询侧同一时区解析 */
    timezone?: string;
    /** UI 语言：决定筛选器列名与取值里的用词（缺省中文） */
    locale?: string;
    /**
     * 该图表自身已经导出的字段 id。命中这些字段的筛选器不再输出常量列：
     * 每行本来就有这一列（如「集团」既是筛选器又是维度），再加一列只会重名。
     */
    exportedFieldIds?: string[];
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
        if (exportedFieldIds.includes(rule.target.fieldId)) return;

        const value = formatDashboardFilterRuleValue(rule, {
            timezone,
            locale,
        });
        if (value === null) return;

        const baseHeader = getRuleHeader(rule, itemMap, locale);
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
