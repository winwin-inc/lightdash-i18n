import {
    FilterOperator,
    isEmptyDashboardFilterRule,
    isWithValueFilter,
    type DashboardFilterRule,
} from '@lightdash/common';

/**
 * 已探测到的候选可用性（key = filter id）。
 * 缺省 = 未知：未知不隐藏（避免接口失败把图表误藏掉）。
 */
export type CandidateAvailabilityMap = Record<string, 'has' | 'none'>;

export type CandidateAvailabilityStatus = 'has' | 'none' | 'unknown';

/**
 * 需要「候选探测」的筛选器：
 * - 开启「无值时隐藏关联图表」
 * - 当前是「任何值」(disabled)：值本身为空，只能按候选是否存在判定
 * - 普通维度（类目不参与；SQL 列无法用 field/search 探测）
 * - 值型算子（NULL / NOT_NULL / IN_THE_CURRENT 本身有语义）
 */
export const needsCandidateProbe = (filter: DashboardFilterRule): boolean =>
    filter.hideTilesWhenEmpty === true &&
    filter.disabled === true &&
    filter.categoryLevel === undefined &&
    filter.target.isSqlColumn !== true &&
    isWithValueFilter(filter.operator) &&
    filter.operator !== FilterOperator.IN_THE_CURRENT &&
    filter.operator !== FilterOperator.NOT_IN_THE_CURRENT;

/**
 * 合并全局与某个 Tab 的候选可用性（Tab 覆盖全局）。
 */
export const mergeCandidateAvailability = (
    globalAvailability: CandidateAvailabilityMap,
    tabAvailability: CandidateAvailabilityMap | undefined,
): CandidateAvailabilityMap =>
    tabAvailability
        ? { ...globalAvailability, ...tabAvailability }
        : globalAvailability;

/**
 * 该筛选器当前是否「无值」，可用来隐藏它作用到的图表。
 *
 * - 未开启开关 → 不隐藏
 * - 「任何值」→ 仅当探测到无候选时隐藏；未知/有候选 → 不隐藏
 * - 非「任何值」→ 值型算子且 values 为空时隐藏
 */
export const isFilterEmptyForTileVisibility = (
    filter: DashboardFilterRule,
    availability: CandidateAvailabilityMap | undefined,
): boolean => {
    if (filter.hideTilesWhenEmpty !== true) return false;

    if (filter.disabled === true) {
        return (
            needsCandidateProbe(filter) && availability?.[filter.id] === 'none'
        );
    }

    return isEmptyDashboardFilterRule(filter);
};
