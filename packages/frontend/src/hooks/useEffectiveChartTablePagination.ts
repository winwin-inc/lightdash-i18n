import { useMemo } from 'react';
import {
    selectChartTablePagination,
    useExplorerSelector,
} from '../features/explorer/store';
import useApp from '../providers/App/useApp';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import {
    type ChartTablePagination,
} from '../utils/applyChartTablePaginationToMetricQuery';
import {
    getTableConfigPageSize,
    isWarehousePaginatedTableConfig,
} from '../utils/isWarehousePaginatedTableChart';

/**
 * Pagination for View SQL / 语义查询:
 * 1. Only when warehouse table pagination is enabled in chart config
 * 2. Prefer Redux (current page from chart preview)
 * 3. Fallback to page 0 + configured pageSize when store not synced yet
 */
export const useEffectiveChartTablePagination =
    (): ChartTablePagination | null => {
        const fromStore = useExplorerSelector(selectChartTablePagination);
        const chartConfig = useExplorerContext(
            (context) => context.state.unsavedChartVersion.chartConfig,
        );
        const pivotConfig = useExplorerContext(
            (context) => context.state.unsavedChartVersion.pivotConfig,
        );
        const { health } = useApp();
        const maxLimit = health.data?.query.maxLimit ?? 5000;

        return useMemo(() => {
            // Gate on chart config first so toggling enablePagination off
            // ignores a stale Redux pageSize/offset immediately.
            if (!isWarehousePaginatedTableConfig(chartConfig, pivotConfig)) {
                return null;
            }
            if (fromStore) {
                return fromStore;
            }
            return {
                pageIndex: 0,
                pageSize: getTableConfigPageSize(chartConfig, maxLimit),
            };
        }, [fromStore, chartConfig, pivotConfig, maxLimit]);
    };
