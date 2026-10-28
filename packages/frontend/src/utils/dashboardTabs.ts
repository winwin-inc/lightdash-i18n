/**
 * Tab 维度的查询调度工具。
 *
 * 背景：看板的所有 Tab 面板都会渲染（非激活 Tab 只是 contentVisibility:hidden，
 * 并不会卸载），如果每个 tile 都无条件发起数仓查询，那么打开一块有 N 个 Tab 的
 * 看板就会一次性打出 N × M 条查询，这些查询在数仓侧排队，用户在任意一个 Tab
 * 上都要等别人占着资源。
 *
 * 这里按「访问过的 Tab」调度：只有用户已经进入过的 Tab 才允许发起查询。
 */

/**
 * 解析 tile 实际所属的 Tab。
 *
 * 与 DashboardTabs 的 tilesByTab 保持一致：
 * - tile 的 tabUuid 存在且有效 → 用它
 * - tile 的 tabUuid 不在 Tab 列表里（脏数据 / Tab 被删）→ 落到第一个 Tab
 * - 看板没有 Tab → undefined（视为「无 Tab 作用域」）
 *
 * 注意：dashboardTabs 尚未加载完成时（首屏）列表为空，但此时 tile 带 tabUuid
 * 仍然属于某个 Tab，不能当成「无 Tab 看板」放行，否则首屏查询风暴依旧。
 */
export const resolveEffectiveTabUuid = (
    tileTabUuid: string | undefined,
    dashboardTabs: { uuid: string }[],
): string | undefined => {
    if (!dashboardTabs || dashboardTabs.length === 0) {
        // Tab 列表还没加载出来：tile 带 tabUuid 就说明它属于某个 Tab
        // （具体是哪个未知，先按 tile 自己的 tabUuid 处理）
        return tileTabUuid;
    }
    if (tileTabUuid && dashboardTabs.some((tab) => tab.uuid === tileTabUuid)) {
        return tileTabUuid;
    }
    return dashboardTabs[0].uuid;
};

/**
 * 该 Tab 是否允许发起查询。
 *
 * - 无 Tab 作用域 → 允许（没有 Tab 的看板必须正常出数）
 * - 已访问过的 Tab → 允许
 * - 从未访问过的 Tab → 不允许（等用户切过去时再查，避免首屏查询风暴）
 */
export const shouldQueryTileForTab = (
    effectiveTabUuid: string | undefined,
    visitedTabUuids: Set<string> | undefined,
): boolean => {
    if (!effectiveTabUuid) return true;
    if (!visitedTabUuids) return true;
    return visitedTabUuids.has(effectiveTabUuid);
};
