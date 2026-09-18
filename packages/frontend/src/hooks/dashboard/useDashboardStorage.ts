import {
    type CreateDashboardChartTile,
    type DashboardFilters,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { useCallback, useEffect, useState } from 'react';

const dashboardLastTabStorageKey = (dashboardUuid: string) =>
    `lightdash:dashboard-last-tab:${dashboardUuid}`;

/** Session-scoped active tab for chart round-trips — also per dashboard. */
const dashboardSessionTabStorageKey = (dashboardUuid: string) =>
    `activeTabUuid:${dashboardUuid}`;

const getIsEditingDashboardChart = () => {
    return (
        !!sessionStorage.getItem('fromDashboard') ||
        !!sessionStorage.getItem('dashboardUuid')
    );
};

const useDashboardStorage = () => {
    const [isEditingDashboardChart, setIsEditingDashboardChart] = useState(
        getIsEditingDashboardChart(),
    );

    // Update isEditingDashboardChart when storage changes, so that NavBar can update accordingly
    useEffect(() => {
        const handleStorage = () => {
            setIsEditingDashboardChart(getIsEditingDashboardChart());
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const clearIsEditingDashboardChart = useCallback(() => {
        sessionStorage.removeItem('fromDashboard');
        sessionStorage.removeItem('dashboardUuid');
        // Trigger storage event to update NavBar
        window.dispatchEvent(new Event('storage'));
    }, []);

    const getEditingDashboardInfo = useCallback(() => {
        const dashboardUuid = sessionStorage.getItem('dashboardUuid');
        return {
            name: sessionStorage.getItem('fromDashboard'),
            dashboardUuid,
            activeTabUuid: dashboardUuid
                ? sessionStorage.getItem(
                      dashboardSessionTabStorageKey(dashboardUuid),
                  )
                : null,
        };
    }, []);

    const setDashboardChartInfo = useCallback(
        (dashboardData: { name: string; dashboardUuid: string }) => {
            sessionStorage.setItem('fromDashboard', dashboardData.name);
            sessionStorage.setItem(
                'dashboardUuid',
                dashboardData.dashboardUuid,
            );
            // Trigger storage event to update NavBar
            window.dispatchEvent(new Event('storage'));
        },
        [],
    );

    const getHasDashboardChanges = useCallback(() => {
        return JSON.parse(
            sessionStorage.getItem('getHasDashboardChanges') ?? 'false',
        );
    }, []);

    const getDashboardActiveTabUuid = useCallback(
        (dashUuid?: string | null) => {
            const id = dashUuid || sessionStorage.getItem('dashboardUuid');
            if (!id) return null;
            return sessionStorage.getItem(dashboardSessionTabStorageKey(id));
        },
        [],
    );

    const clearDashboardStorage = useCallback(() => {
        const dashUuid = sessionStorage.getItem('dashboardUuid');
        sessionStorage.removeItem('fromDashboard');
        sessionStorage.removeItem('dashboardUuid');
        sessionStorage.removeItem('unsavedDashboardTiles');
        sessionStorage.removeItem('unsavedDashboardFilters');
        sessionStorage.removeItem('hasDashboardChanges');
        sessionStorage.removeItem('activeTabUuid'); // legacy global key
        if (dashUuid) {
            sessionStorage.removeItem(dashboardSessionTabStorageKey(dashUuid));
        }
        // Trigger storage event to update NavBar
        window.dispatchEvent(new Event('storage'));
    }, []);

    const storeDashboard = useCallback(
        (
            dashboardTiles: DashboardTile[] | undefined,
            dashboardFilters: DashboardFilters,
            haveTilesChanged: boolean,
            haveFiltersChanged: boolean,
            dashboardUuid?: string,
            dashboardName?: string,
            activeTabUuid?: string,
            dashboardTabs?: DashboardTab[],
        ) => {
            sessionStorage.setItem('fromDashboard', dashboardName ?? '');
            sessionStorage.setItem('dashboardUuid', dashboardUuid ?? '');
            sessionStorage.setItem(
                'unsavedDashboardTiles',
                JSON.stringify(dashboardTiles ?? []),
            );
            if (dashboardTabs && dashboardTabs.length > 0) {
                sessionStorage.setItem(
                    'dashboardTabs',
                    JSON.stringify(dashboardTabs),
                );
            }
            if (
                dashboardFilters.dimensions.length > 0 ||
                dashboardFilters.metrics.length > 0
            ) {
                sessionStorage.setItem(
                    'unsavedDashboardFilters',
                    JSON.stringify(dashboardFilters),
                );
            }
            sessionStorage.setItem(
                'hasDashboardChanges',
                JSON.stringify(haveTilesChanged || haveFiltersChanged),
            );
            if (activeTabUuid && dashboardUuid) {
                sessionStorage.setItem(
                    dashboardSessionTabStorageKey(dashboardUuid),
                    activeTabUuid,
                );
                // keep legacy key briefly for older readers, scoped via dashboardUuid check on read
                sessionStorage.setItem('activeTabUuid', activeTabUuid);
                localStorage.setItem(
                    dashboardLastTabStorageKey(dashboardUuid),
                    activeTabUuid,
                );
            }
            // Trigger storage event to update NavBar
            window.dispatchEvent(new Event('storage'));
        },
        [],
    );

    const getUnsavedDashboardTiles = useCallback(() => {
        return JSON.parse(
            sessionStorage.getItem('unsavedDashboardTiles') ?? '[]',
        );
    }, []);

    const setUnsavedDashboardTiles = useCallback(
        (
            unsavedDashboardTiles: DashboardTile[] | CreateDashboardChartTile[],
        ) => {
            sessionStorage.setItem(
                'unsavedDashboardTiles',
                JSON.stringify(unsavedDashboardTiles),
            );
        },
        [],
    );

    const getDashboardLastTabUuid = useCallback(
        (dashUuid: string | undefined) => {
            if (!dashUuid) return null;
            return (
                localStorage.getItem(dashboardLastTabStorageKey(dashUuid)) ||
                null
            );
        },
        [],
    );

    const setDashboardActiveTabUuid = useCallback(
        (dashUuid: string | undefined, tabUuid: string | undefined) => {
            if (!tabUuid || !dashUuid) return;
            sessionStorage.setItem(
                dashboardSessionTabStorageKey(dashUuid),
                tabUuid,
            );
            sessionStorage.setItem('activeTabUuid', tabUuid); // legacy
            localStorage.setItem(
                dashboardLastTabStorageKey(dashUuid),
                tabUuid,
            );
            window.dispatchEvent(new Event('storage'));
        },
        [],
    );

    return {
        storeDashboard,
        clearDashboardStorage,
        isEditingDashboardChart,
        getIsEditingDashboardChart,
        getEditingDashboardInfo,
        setDashboardChartInfo,
        clearIsEditingDashboardChart,
        getHasDashboardChanges,
        getUnsavedDashboardTiles,
        setUnsavedDashboardTiles,
        getDashboardActiveTabUuid,
        getDashboardLastTabUuid,
        setDashboardActiveTabUuid,
    };
};

export default useDashboardStorage;
