import type {
    ApiErrorDetail,
    ChartConfig,
    ChartType,
    ItemsMap,
    MetricQuery,
    StackType,
} from '@lightdash/common';
import type EChartsReact from 'echarts-for-react';
import { createContext, type RefObject } from 'react';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type EChartSeries } from '../../hooks/echarts/useEchartsCartesianConfig';
import { type SeriesLike } from '../../hooks/useChartColorConfig/types';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { type EchartSeriesClickEvent } from '../SimpleChart';
import { type VisualizationConfig } from './types';

/**
 * Warehouse row-count / pagination for TABLE charts.
 * - enabled: true → OFFSET/LIMIT pager + optional total from calculate-count
 * - enabled: false → count-only (showResultsTotal without pagination); page* fields omitted
 */
export type TablePaginationState = {
    enabled: boolean;
    totalRowCount: number | undefined;
    isCountLoading: boolean;
    isCountError: boolean;
    pageIndex?: number;
    pageSize?: number;
    onPageChange?: (pageIndex: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
};

type VisualizationContext = {
    minimal: boolean;
    isDashboard: boolean;
    chartRef: RefObject<EChartsReact | null>;
    pivotDimensions: string[] | undefined;
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
          })
        | undefined;
    isLoading: boolean;
    columnOrder: string[];
    itemsMap: ItemsMap | undefined;
    visualizationConfig: VisualizationConfig;
    // cartesian config related
    setStacking: (value: boolean | StackType | undefined) => void;
    setCartesianType(args: CartesianTypeOptions | undefined): void;
    // --
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;

    getSeriesColor: (seriesLike: SeriesLike) => string;
    getGroupColor: (groupPrefix: string, groupName: string) => string;
    getGroupColors: (
        groupPrefix: string,
        identifiers: string[],
    ) => Record<string, string>;
    colorPalette: string[];
    chartConfig: ChartConfig;
    apiErrorDetail?: ApiErrorDetail | null;
    useHashBased: boolean;
    /**
     * 看板级颜色同步信息（仅看板且开启「同步图表颜色」时生效）。
     * 自定义图表（Vega-Lite）用它把看板色表注入 spec 的 color scale。
     */
    colorSync: {
        /** 是否开启同步（= useHashBased） */
        enabled: boolean;
        /** 看板调色板 */
        palette: string[];
        /** 看板已知系列 + 追加未知名后的合并色表 */
        hashAssignments: Record<string, string>;
        /** 把当前图可见系列名追加进看板色表 */
        registerVisibleColorKeys: (keys: string[]) => void;
    };
    tablePagination?: TablePaginationState;
};

const Context = createContext<VisualizationContext | undefined>(undefined);

export default Context;
