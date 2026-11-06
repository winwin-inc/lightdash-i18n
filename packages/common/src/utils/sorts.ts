import type { SortField } from '../types/metricQuery';

/**
 * Applies dashboard (tile level) sorts on top of the saved chart sorts.
 *
 * Clicking a table header inside a dashboard replaces the sorts of the tile.
 * Direction is the only thing the dashboard can change: properties that
 * describe *how a field is sorted* (custom value order, nulls position) belong
 * to the chart configuration and must be preserved, otherwise sorting a column
 * from a dashboard would silently drop the custom order.
 */
export const mergeDashboardSorts = (
    chartSorts: SortField[],
    dashboardSorts: SortField[],
): SortField[] => {
    if (dashboardSorts.length === 0) {
        return chartSorts;
    }

    return dashboardSorts.map((dashboardSort) => {
        const chartSort = chartSorts.find(
            (sort) => sort.fieldId === dashboardSort.fieldId,
        );
        if (chartSort === undefined) {
            return dashboardSort;
        }

        return {
            ...dashboardSort,
            ...(dashboardSort.valueOrder === undefined &&
                chartSort.valueOrder !== undefined && {
                    valueOrder: chartSort.valueOrder,
                }),
            ...(dashboardSort.nullsFirst === undefined &&
                chartSort.nullsFirst !== undefined && {
                    nullsFirst: chartSort.nullsFirst,
                }),
        };
    });
};
