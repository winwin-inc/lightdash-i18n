import { type Dashboard } from '../types/dashboard';

export const getActiveTabForTabs = (
    dashboardTabs: Dashboard['tabs'],
    tabUuid: string | undefined,
    isEditMode: boolean,
    currentActiveTab: Dashboard['tabs'][number] | undefined,
) => {
    if (dashboardTabs.length === 0) return undefined;

    const selectableTabs = isEditMode
        ? dashboardTabs
        : dashboardTabs.filter((tab) => !tab.hidden);
    const tabsForFallback =
        selectableTabs.length > 0 ? selectableTabs : dashboardTabs;

    const urlMatch = selectableTabs.find((tab) => tab.uuid === tabUuid);
    if (urlMatch) return urlMatch;

    // Only reuse in-memory current tab when the URL did not ask for a specific tab.
    // If URL has a tabUuid that is missing/hidden, fall back to the first selectable
    // tab instead of keeping a stale currentActiveTab.
    if (tabUuid === undefined) {
        const currentMatch = selectableTabs.find(
            (tab) => tab.uuid === currentActiveTab?.uuid,
        );
        if (currentMatch) return currentMatch;
    }

    return tabsForFallback[0];
};
