import {
    type DashboardFilterRule,
    type DashboardFilters,
    type FieldValueSearchResult,
    FilterOperator,
} from '@lightdash/common';
import { lightdashApi } from '../api';
import { isWarehouseResourceLimitError } from './warehouseError';

/**
 * 类目字段名映射
 */
export const CATEGORY_FIELD_NAMES = {
    LEVEL1: ['cls_1', 'cls1'],
    LEVEL2: ['cls_2', 'cls2'],
    LEVEL3: ['cls_3', 'cls3'],
    LEVEL4: ['cls_4', 'cls4'],
} as const;

/**
 * 从 DashboardFieldTarget 中提取字段名
 * fieldId 格式通常是 tableName_fieldName，如果没有下划线则返回 fieldId
 */
export const getFieldNameFromTarget = (
    target: DashboardFilterRule['target'],
): string => {
    // fieldId 格式通常是 tableName_fieldName
    const parts = target.fieldId.split('_');
    return parts.length > 1 ? parts[parts.length - 1] : target.fieldId;
};

type CategoryLevel = 1 | 2 | 3 | 4;

/**
 * 类型守卫：检查筛选器是否有 categoryLevel 属性
 */
type CategoryFilterRule = DashboardFilterRule & {
    categoryLevel: CategoryLevel;
};

const hasCategoryLevel = (
    filter: DashboardFilterRule,
): filter is CategoryFilterRule => {
    return (
        'categoryLevel' in filter &&
        filter.categoryLevel !== undefined &&
        typeof filter.categoryLevel === 'number' &&
        filter.categoryLevel >= 1 &&
        filter.categoryLevel <= 4
    );
};

/**
 * 检查筛选器是否是类目字段
 * 通过检查 filter.categoryLevel 属性来判断
 */
export const isCategoryField = (filter: DashboardFilterRule): boolean => {
    return hasCategoryLevel(filter);
};

/**
 * 筛选器列表是否包含至少一个类目筛选器
 */
export const hasCategoryFilters = (filters: DashboardFilters): boolean =>
    filters.dimensions.some((filter) => isCategoryField(filter));

/**
 * 获取筛选器对应的类目层级
 * 从 filter.categoryLevel 配置属性中读取
 */
export const getCategoryLevel = (
    filter: DashboardFilterRule,
): CategoryLevel | null => {
    if (hasCategoryLevel(filter)) {
        return filter.categoryLevel;
    }
    return null;
};

/**
 * 获取筛选器的父级筛选器字段ID
 * 从 filter.parentFieldId 配置属性中读取
 */
export const getParentFieldId = (
    filter: DashboardFilterRule,
): string | null => {
    return filter.parentFieldId || null;
};

/**
 * 根据父级筛选器字段ID查找父级筛选器（仅在同一个筛选器集合内查找）
 */
export const findParentFilter = (
    filters: DashboardFilters,
    parentFieldId: string,
): DashboardFilterRule | null => {
    return (
        filters.dimensions.find(
            (filter) => filter.target.fieldId === parentFieldId,
        ) || null
    );
};

/* -------------------------------------------------------------------------- */
/*                            作用域（全局 / Tab）模型                          */
/* -------------------------------------------------------------------------- */

/**
 * 类目筛选器所在作用域
 * - global：全局筛选器
 * - tab：某个 Tab 的筛选器
 */
export type CategoryFilterScope = 'global' | 'tab';

/**
 * 类目筛选器的位置：作用域 + 所在 Tab（global 时为 null）
 */
export type CategoryFilterLocation = {
    scope: CategoryFilterScope;
    tabUuid: string | null;
};

export const GLOBAL_FILTER_LOCATION: CategoryFilterLocation = {
    scope: 'global',
    tabUuid: null,
};

export const isSameCategoryLocation = (
    a: CategoryFilterLocation,
    b: CategoryFilterLocation,
): boolean => a.scope === b.scope && a.tabUuid === b.tabUuid;

/**
 * 跨作用域的筛选器集合：全局 + 各 Tab
 */
export type CategoryFilterLayers = {
    globalFilters: DashboardFilters;
    tabFilters: Record<string, DashboardFilters>;
};

/**
 * 链上的一条规则：规则本身 + 所在位置
 */
export type CategoryChainEntry = {
    rule: DashboardFilterRule;
    location: CategoryFilterLocation;
};

export type CategoryChain = CategoryChainEntry[];

/**
 * 构建级联链：全局筛选器在前，Tab 筛选器在后。
 *
 * 链的顺序即「左侧筛选器」的顺序：
 * - 全局筛选器永远在 Tab 筛选器之前（全局条件对 Tab 生效）
 * - Tab 内的筛选器保持自身顺序
 */
export const buildCategoryChain = (
    layers: CategoryFilterLayers,
    tabUuid: string | null,
): CategoryChain => [
    ...layers.globalFilters.dimensions.map((rule) => ({
        rule,
        location: GLOBAL_FILTER_LOCATION,
    })),
    ...(tabUuid
        ? (layers.tabFilters[tabUuid]?.dimensions ?? []).map((rule) => ({
              rule,
              location: { scope: 'tab' as const, tabUuid },
          }))
        : []),
];

/**
 * 单作用域内的链（不跨作用域）
 */
export const buildCategoryChainFromFilters = (
    filters: DashboardFilters,
    location: CategoryFilterLocation,
): CategoryChain => filters.dimensions.map((rule) => ({ rule, location }));

/**
 * 把链拍平成 DashboardFilters（仅 dimensions），用于签名 / field/search 条件
 */
export const getCategoryChainFilters = (
    chain: CategoryChain,
): DashboardFilters => ({
    dimensions: chain.map((entry) => entry.rule),
    metrics: [],
    tableCalculations: [],
});

/**
 * 读取筛选器显式声明的父级作用域
 */
export const getParentFilterLocation = (
    filter: DashboardFilterRule,
): CategoryFilterLocation | null => {
    if (filter.parentScope === 'global') {
        return GLOBAL_FILTER_LOCATION;
    }
    if (filter.parentScope === 'tab') {
        return { scope: 'tab', tabUuid: filter.parentTabUuid ?? null };
    }
    return null;
};

/**
 * 父级层级必须低于子级，否则视为无效绑定（避免成环）
 */
const isValidParentLevel = (
    parent: DashboardFilterRule,
    child: DashboardFilterRule,
): boolean => {
    const parentLevel = getCategoryLevel(parent);
    const childLevel = getCategoryLevel(child);
    if (parentLevel === null || childLevel === null) return true;
    return parentLevel < childLevel;
};

/**
 * 在链中查找子筛选器的父级：
 * - 显式声明作用域（parentScope / parentTabUuid）→ 精确匹配，找不到即视为绑定失效
 * - 旧数据（未声明作用域）→ 同作用域优先，其次全局
 */
export const findParentCategoryEntry = (
    chain: CategoryChain,
    child: CategoryChainEntry,
): CategoryChainEntry | null => {
    const parentFieldId = getParentFieldId(child.rule);
    if (!parentFieldId) return null;

    const candidates = chain.filter(
        (entry) =>
            entry.rule.target.fieldId === parentFieldId &&
            entry.rule.id !== child.rule.id &&
            isValidParentLevel(entry.rule, child.rule),
    );
    if (candidates.length === 0) return null;

    const explicit = getParentFilterLocation(child.rule);
    if (explicit) {
        return (
            candidates.find(
                (entry) =>
                    entry.location.scope === explicit.scope &&
                    (explicit.scope === 'global' ||
                        entry.location.tabUuid === explicit.tabUuid),
            ) ?? null
        );
    }

    const sameScope = candidates.find((entry) =>
        isSameCategoryLocation(entry.location, child.location),
    );
    if (sameScope) return sameScope;

    return (
        candidates.find((entry) => entry.location.scope === 'global') ?? null
    );
};

/**
 * 比较两组筛选器的 dimension 规则是否等价（值 / 操作符 / 禁用状态）
 * 用于判断级联结果是否真的改变了筛选器
 */
export const areFilterDimensionsEqual = (
    a: DashboardFilters,
    b: DashboardFilters,
): boolean => {
    if (a.dimensions.length !== b.dimensions.length) return false;
    return a.dimensions.every((dimension, index) => {
        const other = b.dimensions[index];
        if (!other) return false;
        return (
            dimension.id === other.id &&
            dimension.operator === other.operator &&
            (dimension.disabled ?? false) === (other.disabled ?? false) &&
            (dimension.values ?? []).join('|') ===
                (other.values ?? []).join('|')
        );
    });
};

/**
 * 取得链上某个作用域自己的筛选器（用于把解析结果写回对应作用域）
 */
export const getScopeFiltersFromChain = (
    chain: CategoryChain,
    location: CategoryFilterLocation,
    fallback: DashboardFilters,
): DashboardFilters => ({
    ...fallback,
    dimensions: chain
        .filter((entry) => isSameCategoryLocation(entry.location, location))
        .map((entry) => entry.rule),
});

export type DashboardFilterContext = {
    dashboardSlug?: string;
    dashboardName?: string;
};

const FIELD_SEARCH_CACHE_TTL_MS = 5000;

/**
 * 类目 field/search 的单个请求超时。
 * 超时的请求会被 abort，避免一个卡死的查询把整条队列堵住。
 */
const FIELD_SEARCH_TIMEOUT_MS = 30000;

/**
 * 类目 field/search 请求队列（并发 1）。
 *
 * 仓库引擎的内存限额是**所有 query 合计**的全局限额：类目解析 / 级联用的
 * field/search 是重查询（带 dbt sql_filter + GROUP BY），并发跑容易把引擎内存打满
 * （HGERR_code 53200），连带把看板自己的查询一起拒绝。
 * 这里把所有类目解析请求串行化，减轻引擎压力。
 *
 * 队列空闲时立即启动（不推迟到下一个 microtask），
 * 避免无谓地拖慢第一个请求。
 */
let fieldSearchInFlight = false;
const fieldSearchWaiters: (() => void)[] = [];

const runFieldSearchTask = async <T>(task: () => Promise<T>): Promise<T> => {
    try {
        return await task();
    } finally {
        const next = fieldSearchWaiters.shift();
        if (next) {
            next();
        } else {
            fieldSearchInFlight = false;
        }
    }
};

const enqueueFieldSearch = <T>(task: () => Promise<T>): Promise<T> => {
    if (!fieldSearchInFlight) {
        fieldSearchInFlight = true;
        return runFieldSearchTask(task);
    }
    return new Promise<T>((resolve, reject) => {
        fieldSearchWaiters.push(() => {
            runFieldSearchTask(task).then(resolve, reject);
        });
    });
};

const isAbortError = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError';

/**
 * 类目解析失败时的日志：
 * - 仓库资源限额错误（引擎内存打满）：给出可读提示，避免刷屏的 HGERR 原文
 * - 其他错误：保留原始信息便于排查
 */
const logCategorySearchError = (
    context: string,
    error: unknown,
): void => {
    if (isWarehouseResourceLimitError(error)) {
        // eslint-disable-next-line no-console
        console.warn(
            `[categoryFilters] ${context}: warehouse resource limit reached (engine memory limit), keeping current value`,
        );
        return;
    }
    // eslint-disable-next-line no-console
    console.warn(`[categoryFilters] ${context}`, error);
};

type FieldSearchCacheEntry = {
    expiresAt: number;
    promise: Promise<FieldSearchResult>;
};

const fieldSearchCache = new Map<string, FieldSearchCacheEntry>();

/** 清除 field/search 内存缓存（仅测试使用） */
export const clearFieldSearchCacheForTests = (): void => {
    fieldSearchCache.clear();
};

const pruneExpiredFieldSearchCache = (now: number): void => {
    for (const [key, entry] of fieldSearchCache.entries()) {
        if (entry.expiresAt <= now) {
            fieldSearchCache.delete(key);
        }
    }
};

const serializeFieldSearchFilters = (
    filters?: DashboardFilterRule[],
): string => {
    if (!filters || filters.length === 0) {
        return '[]';
    }

    return JSON.stringify(
        filters.map((filter) => ({
            target: { fieldId: filter.target.fieldId },
            operator: filter.operator,
            values: filter.values ?? null,
            // settings 参与后端的 SQL 编译（日期的单位 / 是否完成），
            // 不参与签名会让不同时间窗口共用同一个缓存
            settings: filter.settings ?? null,
        })),
    );
};

const getFieldSearchCacheKey = (
    projectUuid: string,
    fieldId: string,
    tableName: string,
    filters: DashboardFilterRule[] | undefined,
    dashboardContext: DashboardFilterContext | undefined,
): string =>
    JSON.stringify({
        projectUuid,
        fieldId,
        tableName,
        filters: serializeFieldSearchFilters(filters),
        dashboardSlug: dashboardContext?.dashboardSlug ?? null,
        dashboardName: dashboardContext?.dashboardName ?? null,
    });

/**
 * 类目初始化签名：仅包含真实 field/search 依赖。
 * collectFieldSearchFilters 会发送「目标类目左侧」的筛选，因此保留截至最后一个类目的 dimension 前缀；
 * 最后一个类目之后的筛选不可能参与查询，排除以免误触发 init。
 */
export const getCategoryFiltersSignature = (
    filters: DashboardFilters,
    projectUuid: string,
    dashboardContext?: DashboardFilterContext,
): string => {
    let lastCategoryIndex = -1;
    filters.dimensions.forEach((filter, index) => {
        if (isCategoryField(filter)) {
            lastCategoryIndex = index;
        }
    });

    const relevantDimensions =
        lastCategoryIndex === -1
            ? []
            : filters.dimensions.slice(0, lastCategoryIndex + 1);

    return JSON.stringify({
        projectUuid,
        dashboardSlug: dashboardContext?.dashboardSlug ?? null,
        dashboardName: dashboardContext?.dashboardName ?? null,
        dimensions: relevantDimensions.map((filter) => ({
            id: filter.id,
            fieldId: filter.target.fieldId,
            tableName: filter.target.tableName,
            operator: filter.operator,
            values: filter.values ?? null,
            disabled: filter.disabled ?? false,
            categoryLevel: filter.categoryLevel ?? null,
            parentFieldId: filter.parentFieldId ?? null,
            parentScope: filter.parentScope ?? null,
            parentTabUuid: filter.parentTabUuid ?? null,
        })),
    });
};

/**
 * field/search 调用结果。
 * - ok: 请求成功，values 为底层表实际存在的类目（已按用户权限/行级过滤）
 * - error: 请求失败，无法判断类目是否存在
 */
type FieldSearchResult =
    | { status: 'ok'; values: string[] }
    | { status: 'error'; error: unknown };

/**
 * 类目值解析结果。
 * - resolved: 解析出有效类目（当前值有效，或重置为第一个有权限的类目）
 * - clear: 链路断裂（父级没有值 / 父级被删除）→ 当前级应被清空
 * - keep: 无法判断类目是否存在（没有候选值）→ 保留当前值
 * - error: 请求失败，无法判断
 */
type CategoryValueResolution =
    | { status: 'resolved'; value: string }
    | { status: 'clear'; reason: 'parent-unresolved' }
    | { status: 'keep'; reason: 'no-candidates' }
    | { status: 'error'; error: unknown };

/**
 * 调用 field/search 接口获取字段的实际可用值（含看板上下文以触发 dbt sql_filter）
 */
const fetchFieldSearchValues = async (
    projectUuid: string,
    fieldId: string,
    tableName: string,
    filters: DashboardFilterRule[] | undefined,
    dashboardContext: DashboardFilterContext | undefined,
): Promise<FieldSearchResult> => {
    const now = Date.now();
    pruneExpiredFieldSearchCache(now);

    const cacheKey = getFieldSearchCacheKey(
        projectUuid,
        fieldId,
        tableName,
        filters,
        dashboardContext,
    );
    const cachedEntry = fieldSearchCache.get(cacheKey);

    if (cachedEntry && cachedEntry.expiresAt > now) {
        return cachedEntry.promise;
    }

    const requestPromise = enqueueFieldSearch(
        async (): Promise<FieldSearchResult> => {
            const controller = new AbortController();
            const timeoutId = setTimeout(
                () => controller.abort(),
                FIELD_SEARCH_TIMEOUT_MS,
            );
            try {
                try {
                    const filterGroup =
                        filters && filters.length > 0
                            ? {
                                  id: 'category_cascade_filter',
                                  // 条件必须与下拉搜索发送的规则保持一致（对齐
                                  // getAutocompleteFilterGroup）：后端按规则原文编译 SQL。
                                  // - 不能丢 settings：日期条件的单位在 settings 里，
                                  //   丢掉后「过去 13 个月」会退化成「过去 13 天」，查询没有数据。
                                  // - 不能带 disabled：编译器遇到 disabled 会渲染 1=1，
                                  //   等于把父级条件整个丢掉。
                                  // - tileTargets 只用于图表定向，查询时不需要。
                                  and: filters.map((rule) => {
                                      const { tileTargets, disabled, ...rest } =
                                          rule;
                                      return { ...rest, disabled: false };
                                  }),
                              }
                            : undefined;

                    const result = await lightdashApi<FieldValueSearchResult>({
                        url: `/projects/${projectUuid}/field/${fieldId}/search`,
                        method: 'POST',
                        body: JSON.stringify({
                            search: '',
                            limit: 1000,
                            table: tableName,
                            filters: filterGroup,
                            forceRefresh: false,
                            dashboardSlug: dashboardContext?.dashboardSlug,
                            dashboardName: dashboardContext?.dashboardName,
                        }),
                        signal: controller.signal,
                    });
                    return {
                        status: 'ok',
                        values: result.results.filter(
                            (v): v is string => typeof v === 'string',
                        ),
                    };
                } catch (error) {
                    fieldSearchCache.delete(cacheKey);
                    if (isAbortError(error)) {
                        return {
                            status: 'error',
                            error: new Error(
                                `Category field search timed out after ${FIELD_SEARCH_TIMEOUT_MS}ms`,
                            ),
                        };
                    }
                    return { status: 'error', error };
                }
            } finally {
                clearTimeout(timeoutId);
            }
        },
    );

    fieldSearchCache.set(cacheKey, {
        expiresAt: now + FIELD_SEARCH_CACHE_TTL_MS,
        promise: requestPromise,
    });

    return requestPromise;
};

type ResolveCategoryValueArgs = {
    filter: DashboardFilterRule;
    chain: CategoryChain;
    projectUuid: string;
    dashboardContext?: DashboardFilterContext;
    parentValueOverride?: string | null;
    /**
     * 是否允许在「带级联的查询没有候选」时，再用不带级联的查询兜底一次。
     * 只用于恢复被误清空的筛选器（寻常路径不需要，避免请求翻倍）。
     */
    allowUnfilteredFallback?: boolean;
};

/**
 * 读取筛选器当前值（统一成字符串）。
 */
const getFilterCurrentValue = (
    filter: DashboardFilterRule,
): string | undefined => {
    if (filter.values && filter.values.length > 0) {
        return String(filter.values[0]);
    }
    return undefined;
};

/**
 * 收集 field/search 级联条件：目标筛选器左侧已有值的规则（对齐下拉 getAutocompleteFilterGroup），
 * 并对父级类目应用 override。
 */
const collectFieldSearchFilters = (
    chain: CategoryChain,
    child: CategoryChainEntry,
    parentValueOverride?: string | null,
): DashboardFilterRule[] | undefined => {
    const currentIndex = chain.findIndex(
        (entry) => entry.rule.id === child.rule.id,
    );
    const leftEntries = (
        currentIndex === -1 ? chain : chain.slice(0, currentIndex)
    ).filter(
        (entry) =>
            !entry.rule.disabled &&
            entry.rule.values !== undefined &&
            entry.rule.values.length > 0,
    );

    const parentFieldId = getParentFieldId(child.rule);
    if (!parentFieldId) {
        return leftEntries.length > 0
            ? leftEntries.map((entry) => entry.rule)
            : undefined;
    }

    const parentEntry = findParentCategoryEntry(chain, child);
    if (!parentEntry || !isCategoryField(parentEntry.rule)) {
        // 父级不存在（被删除 / 绑定失效）→ 链路断裂
        return undefined;
    }

    // parentValueOverride === null 表示用户清空了父级
    // parentValueOverride === undefined 表示首次加载，用父级当前值
    // parentValueOverride 有具体值表示用户切换了父级
    // 父级即使还带 disabled 标记，只要当前有「确认选中的值」，也要作为级联条件：
    // 否则子级会退化成「不带父级条件」的查询，联动结果与类目层级对不上。
    const parentLabel =
        parentValueOverride !== undefined
            ? parentValueOverride
            : getFilterCurrentValue(parentEntry.rule);

    if (!parentLabel) {
        // 父级没有值 → 链路断裂
        return undefined;
    }

    const parentRule: DashboardFilterRule = {
        ...parentEntry.rule,
        values: [parentLabel],
        operator: FilterOperator.EQUALS,
    };

    const withoutParent = leftEntries.filter(
        (entry) => entry.rule.target.fieldId !== parentFieldId,
    );
    return [...withoutParent.map((entry) => entry.rule), parentRule];
};

/**
 * 该筛选器是否需要参与类目解析（初始化）。
 *
 * - 正常筛选器（未禁用）→ 需要
 * - 被禁用且有值 → 作者显式禁用，保留原样
 * - 被禁用且无值 → 旧版本「类目不存在就清空并禁用」留下的状态，需要重新解析并恢复
 */
const shouldResolveCategoryFilter = (
    filter: DashboardFilterRule,
    recoverableFilterIds?: Set<string>,
): boolean => {
    if (!filter.disabled) {
        return true;
    }
    return recoverableFilterIds?.has(filter.id) ?? false;
};

/**
 * 该筛选器是否参与父子联动。
 *
 * 联动的判断依据是「当前是否有确认选中的值」，而不是 disabled 标记本身：
 * - 有确认选中的值 → 参与。父级变了，子级必须跟着变；
 *   disabled 只说明「作者没配默认值」，若当前确实有选中的值（历史配置残留或
 *   用户在看板里选过），不能因此把联动丢掉，否则会出现「上级变了、下级没变」。
 * - 没有值 → 沿用初始化的语义：disabled（作者没配默认值）不参与、不发请求；
 *   未禁用（未设置默认值的控件）参与并按实际数据补齐。
 */
const shouldCascadeCategoryFilter = (
    filter: DashboardFilterRule,
    recoverableFilterIds?: Set<string>,
): boolean => {
    if (getFilterCurrentValue(filter) !== undefined) {
        return true;
    }
    return shouldResolveCategoryFilter(filter, recoverableFilterIds);
};

/**
 * 按仓库实际类目解析筛选器值（field/search + 左侧筛选 + 父级 + dashboardSlug）
 *
 * 以底层表实际数据为准：
 * - 当前值在实际数据里 → 保留
 * - 当前值不在实际数据里 → 重置为第一个有权限的类目
 * - 父级没有值（链路断裂）→ 清空当前值（避免带着失效值查询出空页面）
 * - 查询没有候选值 → keep（无法区分「表里没这个类目」与「行级过滤把行都过滤了」，保留原值）
 *   - 例外：被旧逻辑清空并禁用的筛选器（无值 + disabled）→ 用不带级联的查询恢复
 * - 请求失败 → error（无法判断，保留原值）
 */
const resolveCategoryFilterValueAsync = async ({
    filter,
    chain,
    projectUuid,
    dashboardContext,
    parentValueOverride,
    allowUnfilteredFallback = false,
}: ResolveCategoryValueArgs): Promise<CategoryValueResolution> => {
    if (!isCategoryField(filter)) {
        return { status: 'keep', reason: 'no-candidates' };
    }

    const childEntry = chain.find((entry) => entry.rule.id === filter.id);
    const searchFilters = collectFieldSearchFilters(
        chain,
        childEntry ?? { rule: filter, location: GLOBAL_FILTER_LOCATION },
        parentValueOverride,
    );
    // 配置了父级但父级无值时，collect 返回 undefined：链路断裂 → 清空当前级
    if (getParentFieldId(filter) && searchFilters === undefined) {
        return { status: 'clear', reason: 'parent-unresolved' };
    }

    const result = await fetchFieldSearchValues(
        projectUuid,
        filter.target.fieldId,
        filter.target.tableName,
        searchFilters,
        dashboardContext,
    );

    if (result.status === 'error') {
        return { status: 'error', error: result.error };
    }

    const fieldValues = result.values;
    const currentValue = getFilterCurrentValue(filter);

    if (fieldValues.length === 0) {
        // 空结果：无法区分「底层表确实没有该类目」与「行级过滤把候选值都过滤了」。
        // 直接保留原值：清空会抹掉看板里已经保存的类目。
        // （不做「不带级联」的兜底查询：保留原值与兜底命中当前值的结果一致，
        //   兜底多出来的请求只会拖慢初始化。）
        if (allowUnfilteredFallback && currentValue === undefined) {
            // 例外：被旧逻辑清空并禁用的筛选器需要恢复，
            // 此时用不带级联条件的查询再试一次（罕见路径，请求量可忽略）。
            const fallback = await fetchFieldSearchValues(
                projectUuid,
                filter.target.fieldId,
                filter.target.tableName,
                undefined,
                dashboardContext,
            );

            if (fallback.status === 'error') {
                return { status: 'error', error: fallback.error };
            }

            if (fallback.values.length > 0) {
                return { status: 'resolved', value: fallback.values[0] };
            }
        }

        return { status: 'keep', reason: 'no-candidates' };
    }

    if (currentValue && fieldValues.includes(currentValue)) {
        return { status: 'resolved', value: currentValue };
    }

    return { status: 'resolved', value: fieldValues[0] };
};

/**
 * 按类目层级（1 → 4）排序类目筛选器。
 * 重置时必须先处理父级（一级类目），子级才能基于新的父级值重新解析。
 */
const sortCategoryFiltersByLevel = (
    filters: DashboardFilters,
): DashboardFilterRule[] =>
    filters.dimensions
        .filter((filter) => isCategoryField(filter))
        .sort(
            (a, b) => (getCategoryLevel(a) ?? 0) - (getCategoryLevel(b) ?? 0),
        );

const replaceRuleInChain = (
    chain: CategoryChain,
    ruleId: string,
    nextRule: DashboardFilterRule,
): CategoryChain =>
    chain.map((entry) =>
        entry.rule.id === ruleId ? { ...entry, rule: nextRule } : entry,
    );

const replaceRuleInFilters = (
    filters: DashboardFilters,
    ruleId: string,
    nextRule: DashboardFilterRule,
): DashboardFilters => ({
    ...filters,
    dimensions: filters.dimensions.map((dimension) =>
        dimension.id === ruleId ? nextRule : dimension,
    ),
});

/**
 * 联动上下文
 */
type CascadeContext = {
    projectUuid: string;
    dashboardContext?: DashboardFilterContext;
    recoverableFilterIds: Set<string>;
    /** 只有返回 true 的规则才允许被写回（用于限定作用域） */
    canUpdate: (entry: CategoryChainEntry) => boolean;
};

/**
 * 找出某个规则在链上的直接子级
 */
const getChildEntries = (
    chain: CategoryChain,
    parent: CategoryChainEntry,
): CategoryChainEntry[] =>
    chain.filter((entry) => {
        if (!isCategoryField(entry.rule)) return false;
        const resolvedParent = findParentCategoryEntry(chain, entry);
        return resolvedParent?.rule.id === parent.rule.id;
    });

/**
 * 清空某个规则的所有后代（链路断裂时调用）
 */
const clearDescendantsAsync = async (
    chain: CategoryChain,
    parent: CategoryChainEntry,
    ctx: CascadeContext,
): Promise<{ chain: CategoryChain; hasChanges: boolean }> => {
    let currentChain = chain;
    let hasChanges = false;

    for (const child of getChildEntries(currentChain, parent)) {
        const currentChild =
            currentChain.find((entry) => entry.rule.id === child.rule.id) ??
            child;

        if (
            ctx.canUpdate(currentChild) &&
            currentChild.rule.values !== undefined &&
            currentChild.rule.values.length > 0
        ) {
            currentChain = replaceRuleInChain(
                currentChain,
                currentChild.rule.id,
                {
                    ...currentChild.rule,
                    values: [],
                },
            );
            hasChanges = true;
        }

        const sub = await clearDescendantsAsync(
            currentChain,
            currentChild,
            ctx,
        );
        currentChain = sub.chain;
        hasChanges = hasChanges || sub.hasChanges;
    }

    return { chain: currentChain, hasChanges };
};

/**
 * 父改子联动（链上）：父改子时按 field/search 实际类目纠正选中值；
 * 链路断裂（中间某级没有值）时清空更下级，避免带着失效值查询出空页面。
 */
const cascadeChildrenAsync = async (
    chain: CategoryChain,
    parentEntry: CategoryChainEntry,
    parentValue: string | null,
    ctx: CascadeContext,
): Promise<{ chain: CategoryChain; hasChanges: boolean }> => {
    let currentChain = chain;
    let hasChanges = false;

    for (const originalChild of getChildEntries(chain, parentEntry)) {
        const child =
            currentChain.find(
                (entry) => entry.rule.id === originalChild.rule.id,
            ) ?? originalChild;

        if (!isCategoryField(child.rule)) continue;

        // 如果 operator 不是默认的 EQUALS，说明用户手动修改过，保留用户的设置
        if (child.rule.operator !== FilterOperator.EQUALS) {
            continue;
        }

        // 联动的判断依据是「当前是否有确认选中的值」：
        // 有选中值就必须跟着父级联动（disabled 可能只是历史残留）；
        // 没有值时才沿用既有语义（禁用 = 没有配置默认值 → 不参与）。
        if (
            !shouldCascadeCategoryFilter(child.rule, ctx.recoverableFilterIds)
        ) {
            // 断链：当前级没有值（被禁用）→ 后代失去依据 → 清空后代
            const cleared = await clearDescendantsAsync(
                currentChain,
                child,
                ctx,
            );
            currentChain = cleared.chain;
            hasChanges = hasChanges || cleared.hasChanges;
            continue;
        }

        if (!ctx.canUpdate(child)) {
            // 不属于当前作用域（例如 Tab 链上的全局父级）：
            // 不改它的值，但需要继续向下级联（全局二级 → Tab 三级）
            const childValue = getFilterCurrentValue(child.rule) ?? null;
            const childResult = await cascadeChildrenAsync(
                currentChain,
                child,
                childValue,
                ctx,
            );
            currentChain = childResult.chain;
            hasChanges = hasChanges || childResult.hasChanges;
            continue;
        }

        const resolution = await resolveCategoryFilterValueAsync({
            filter: child.rule,
            chain: currentChain,
            projectUuid: ctx.projectUuid,
            dashboardContext: ctx.dashboardContext,
            parentValueOverride: parentValue,
        });

        if (resolution.status === 'error') {
            // 请求失败：无法判断，保留子级当前值
            logCategorySearchError(
                `Failed to cascade category filter ${child.rule.target.fieldId}, keeping current value`,
                resolution.error,
            );
            const childResult = await cascadeChildrenAsync(
                currentChain,
                child,
                getFilterCurrentValue(child.rule) ?? null,
                ctx,
            );
            currentChain = childResult.chain;
            hasChanges = hasChanges || childResult.hasChanges;
            continue;
        }

        if (resolution.status === 'keep') {
            // 无法判断类目是否存在：保留子级当前值，并按当前值继续向下级联
            const keptValue = getFilterCurrentValue(child.rule) ?? null;

            const childResult = await cascadeChildrenAsync(
                currentChain,
                child,
                keptValue,
                ctx,
            );
            currentChain = childResult.chain;
            hasChanges = hasChanges || childResult.hasChanges;
            continue;
        }

        if (resolution.status === 'clear') {
            // 父级没有值 → 当前级清空，更下级一起清空
            const clearedRule: DashboardFilterRule = {
                ...child.rule,
                values: [],
            };
            currentChain = replaceRuleInChain(
                currentChain,
                child.rule.id,
                clearedRule,
            );
            hasChanges = true;

            const cleared = await clearDescendantsAsync(
                currentChain,
                { ...child, rule: clearedRule },
                ctx,
            );
            currentChain = cleared.chain;
            hasChanges = hasChanges || cleared.hasChanges;
            continue;
        }

        const resolvedValue = resolution.value;

        const currentValue = getFilterCurrentValue(child.rule);
        const wasCleared = child.rule.disabled === true;

        let appliedRule = child.rule;
        if (!currentValue || currentValue !== resolvedValue || wasCleared) {
            appliedRule = {
                ...child.rule,
                values: [resolvedValue],
                operator: FilterOperator.EQUALS,
                // 旧版本把「类目不存在」的筛选器清空并禁用，这里恢复成可用状态；
                // 有确认选中的值时同样适用：值是实际选中的，筛选器应当生效
                ...(wasCleared ? { disabled: false } : {}),
            };

            currentChain = replaceRuleInChain(
                currentChain,
                child.rule.id,
                appliedRule,
            );
            hasChanges = true;
        }

        const childResult = await cascadeChildrenAsync(
            currentChain,
            { ...child, rule: appliedRule },
            resolvedValue,
            ctx,
        );
        currentChain = childResult.chain;
        hasChanges = hasChanges || childResult.hasChanges;
    }

    return { chain: currentChain, hasChanges };
};

/**
 * 异步初始化类目筛选器：以底层表实际数据为准
 * - 当前值在实际数据里 → 保留
 * - 当前值不在实际数据里 → 重置为第一个有权限的类目（并按一级→四级顺序联动子级）
 * - 父级没有值（链路断裂）→ 清空当前值，并继续清空更下级
 * - 查询没有候选值 → 保留原值（无法区分「表里没这个类目」与「行级过滤把行都过滤了」，
 *   清空会直接抹掉看板里已经保存的类目）
 * - 请求失败 → 保留原值（无法判断，不改变用户筛选语义）
 *
 * `skipFilterIds` 用于跳过用户刚刚手动改过的筛选器：用户的显式选择优先，
 * 不能被随后的自动解析覆盖。
 *
 * `scope.chain` 用于跨作用域解析（Tab 筛选器绑定全局父级）：
 * 父级查找与「左侧条件」都基于链（全局在前、Tab 在后）。
 */
export const initializeCategoryFiltersAsync = async (
    filters: DashboardFilters,
    projectUuid: string,
    dashboardContext?: DashboardFilterContext,
    options?: {
        skipFilterIds?: string[];
        recoverableFilterIds?: string[];
        scope?: {
            location: CategoryFilterLocation;
            chain: CategoryChain;
        };
    },
): Promise<DashboardFilters> => {
    let workingFilters = filters;
    let hasChanges = false;
    const skipFilterIds = new Set(options?.skipFilterIds ?? []);
    const recoverableFilterIds = new Set(options?.recoverableFilterIds ?? []);

    const location = options?.scope?.location ?? GLOBAL_FILTER_LOCATION;
    let workingChain: CategoryChain = (
        options?.scope?.chain ??
        buildCategoryChainFromFilters(filters, location)
    ).map((entry) => ({ ...entry, rule: { ...entry.rule } }));

    // 同步本作用域的规则：调用方可能先做了级联，再用级联后的结果重新解析，
    // 链里的旧值必须以传入的筛选器为准。
    workingChain = workingChain.map((entry) => {
        if (!isSameCategoryLocation(entry.location, location)) return entry;
        const rule = filters.dimensions.find((d) => d.id === entry.rule.id);
        return rule ? { ...entry, rule: { ...rule } } : entry;
    });

    // 按层级顺序（一级 → 四级）处理，保证父级先重置，子级再基于新父级值解析
    for (const filter of sortCategoryFiltersByLevel(filters)) {
        if (!isCategoryField(filter) || skipFilterIds.has(filter.id)) {
            continue;
        }

        const currentFilter =
            workingFilters.dimensions.find((d) => d.id === filter.id) ?? filter;

        // 如果用户手动修改过 operator（如 NOT_NULL, NULL），保留用户的设置
        if (currentFilter.operator !== FilterOperator.EQUALS) {
            continue;
        }

        // 被禁用的筛选器不参与自动赋值（沿用既有语义：禁用 = 没有配置默认值）。
        // 只有被旧逻辑误清空、且服务端仍保存着原值的筛选器才恢复。
        if (!shouldResolveCategoryFilter(currentFilter, recoverableFilterIds)) {
            // 被禁用但仍有确认选中的值 → 这一级依然是有效的链路，不能清空后代
            if (getFilterCurrentValue(currentFilter) !== undefined) {
                continue;
            }
            // 被禁用且没有值：链路在这一级断开 → 更下级（子类目）失去依据
            const cleared = await clearDescendantsAsync(
                workingChain,
                {
                    rule: currentFilter,
                    location,
                },
                {
                    projectUuid,
                    dashboardContext,
                    recoverableFilterIds,
                    canUpdate: (entry) =>
                        isSameCategoryLocation(entry.location, location),
                },
            );
            workingChain = cleared.chain;
            if (cleared.hasChanges) {
                hasChanges = true;
                workingFilters = getScopeFiltersFromChain(
                    workingChain,
                    location,
                    workingFilters,
                );
            }
            continue;
        }

        const resolution = await resolveCategoryFilterValueAsync({
            filter: currentFilter,
            chain: workingChain,
            projectUuid,
            dashboardContext,
            allowUnfilteredFallback: recoverableFilterIds.has(filter.id),
        });

        if (resolution.status === 'error') {
            // 请求失败：无法判断当前值是否有效，保留原值
            logCategorySearchError(
                `Failed to resolve category filter ${currentFilter.target.fieldId}, keeping current value`,
                resolution.error,
            );
            continue;
        }

        if (resolution.status === 'keep') {
            // 无法判断类目是否存在：保留当前值，不清空、不禁用
            // eslint-disable-next-line no-console
            console.warn(
                `[categoryFilters] Could not confirm category filter ${currentFilter.target.fieldId} (${resolution.reason}), keeping current value`,
            );
            continue;
        }

        if (resolution.status === 'clear') {
            // 链路断裂（父级没有值）：清空当前级 → 更下级也要清空
            const clearedRule: DashboardFilterRule = {
                ...currentFilter,
                values: [],
            };
            const cleared = await clearDescendantsAsync(
                replaceRuleInChain(workingChain, currentFilter.id, clearedRule),
                {
                    rule: clearedRule,
                    location,
                },
                {
                    projectUuid,
                    dashboardContext,
                    recoverableFilterIds,
                    canUpdate: (entry) =>
                        isSameCategoryLocation(entry.location, location),
                },
            );
            workingChain = cleared.chain;
            hasChanges = true;
            workingFilters = getScopeFiltersFromChain(
                workingChain,
                location,
                workingFilters,
            );
            continue;
        }

        const resolvedValue = resolution.value;

        const currentValue = getFilterCurrentValue(currentFilter);
        const wasCleared = currentFilter.disabled === true;
        if (currentValue === resolvedValue && !wasCleared) {
            continue;
        }

        hasChanges = true;
        const updatedFilter: DashboardFilterRule = {
            ...currentFilter,
            values: [resolvedValue],
            operator: FilterOperator.EQUALS,
            // 旧版本把「类目不存在」的筛选器清空并禁用，这里恢复成可用状态
            ...(wasCleared ? { disabled: false } : {}),
        };

        workingChain = replaceRuleInChain(
            workingChain,
            currentFilter.id,
            updatedFilter,
        );
        workingFilters = replaceRuleInFilters(
            workingFilters,
            currentFilter.id,
            updatedFilter,
        );
    }

    if (!hasChanges) return filters;
    return workingFilters;
};

/**
 * 异步处理类目筛选器联动：父改子时按 field/search 实际类目纠正选中值
 *
 * 只更新传入作用域（filters）里的规则；跨作用域的父级查找通过 `scope.chain` 完成。
 */
export const updateCategoryFilterCascadeAsync = async (
    filters: DashboardFilters,
    changedFilter: DashboardFilterRule,
    newValue: string | null,
    projectUuid: string,
    dashboardContext?: DashboardFilterContext,
    options?: {
        recoverableFilterIds?: string[];
        scope?: {
            location: CategoryFilterLocation;
            chain: CategoryChain;
        };
    },
): Promise<DashboardFilters> => {
    const recoverableFilterIds = new Set(options?.recoverableFilterIds ?? []);
    if (!isCategoryField(changedFilter)) return filters;

    const location = options?.scope?.location ?? GLOBAL_FILTER_LOCATION;
    const chain: CategoryChain = (
        options?.scope?.chain ??
        buildCategoryChainFromFilters(filters, location)
    ).map((entry) => ({ ...entry, rule: { ...entry.rule } }));

    const changedEntry = chain.find(
        (entry) => entry.rule.id === changedFilter.id,
    );
    if (!changedEntry) return filters;

    const scopeRuleIds = new Set(filters.dimensions.map((d) => d.id));

    const result = await cascadeChildrenAsync(
        chain,
        changedEntry,
        newValue ? String(newValue) : null,
        {
            projectUuid,
            dashboardContext,
            recoverableFilterIds,
            canUpdate: (entry) => scopeRuleIds.has(entry.rule.id),
        },
    );

    if (!result.hasChanges) {
        return filters;
    }

    return getScopeFiltersFromChain(result.chain, location, filters);
};

/**
 * 跨作用域联动：全局筛选器变更时，把联动传播到各 Tab 的子类目筛选器。
 *
 * 处理顺序：先全局（全局一二级），再各 Tab（Tab 三四级）。
 * 这样 Tab 解析时拿到的全局父级值已经是最终值。
 */
export const updateCrossScopeCategoryCascadeAsync = async (
    layers: CategoryFilterLayers,
    changedFilter: DashboardFilterRule,
    newValue: string | null,
    projectUuid: string,
    dashboardContext?: DashboardFilterContext,
    options?: {
        recoverableFilterIds?: string[];
    },
): Promise<CategoryFilterLayers> => {
    const recoverableFilterIds = new Set(options?.recoverableFilterIds ?? []);
    if (!isCategoryField(changedFilter)) {
        return {
            globalFilters: layers.globalFilters,
            tabFilters: layers.tabFilters,
        };
    }

    let globalFilters = layers.globalFilters;
    let tabFilters: Record<string, DashboardFilters> = { ...layers.tabFilters };

    const scopes: CategoryFilterLocation[] = [
        GLOBAL_FILTER_LOCATION,
        ...Object.keys(tabFilters).map((tabUuid) => ({
            scope: 'tab' as const,
            tabUuid,
        })),
    ];

    for (const scope of scopes) {
        const chain = buildCategoryChain(
            { globalFilters, tabFilters },
            scope.tabUuid,
        );
        const changedEntry = chain.find(
            (entry) => entry.rule.id === changedFilter.id,
        );
        // 变更的筛选器不在该作用域的链里（例如别的 Tab 的筛选器）→ 跳过
        if (!changedEntry) continue;

        const result = await cascadeChildrenAsync(
            chain,
            changedEntry,
            newValue ? String(newValue) : null,
            {
                projectUuid,
                dashboardContext,
                recoverableFilterIds,
                canUpdate: (entry) =>
                    isSameCategoryLocation(entry.location, scope),
            },
        );

        if (!result.hasChanges) continue;

        if (scope.scope === 'global') {
            globalFilters = getScopeFiltersFromChain(
                result.chain,
                scope,
                globalFilters,
            );
        } else if (scope.tabUuid) {
            tabFilters = {
                ...tabFilters,
                [scope.tabUuid]: getScopeFiltersFromChain(
                    result.chain,
                    scope,
                    tabFilters[scope.tabUuid],
                ),
            };
        }
    }

    return { globalFilters, tabFilters };
};
