import {
    assertUnreachable,
    CartesianChartDataModel,
    ChartType,
    FeatureFlags,
    isDimension,
    type ApiErrorDetail,
    type ChartConfig,
    type DashboardFilters,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotValue,
    type Series,
    type StackType,
    type TableCalculationMetadata,
} from '@lightdash/common';
import type EChartsReact from 'echarts-for-react';
import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type RefObject,
} from 'react';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type EChartSeries } from '../../hooks/echarts/useEchartsCartesianConfig';
import {
    lookupSyncedColor,
    pieRowColorKeys,
} from '../../hooks/useChartColorConfig/colorSyncKeys';
import {
    appendUnknownHashColors,
    resolveSyncedHashColor,
} from '../../hooks/useChartColorConfig/hashColorAssignment';
import { type SeriesLike } from '../../hooks/useChartColorConfig/types';
import { useChartColorConfig } from '../../hooks/useChartColorConfig/useChartColorConfig';
import {
    calculateSeriesLikeIdentifier,
    isGroupedSeries,
} from '../../hooks/useChartColorConfig/utils';
import {
    useFeatureFlag,
    useFeatureFlagEnabled,
} from '../../hooks/useFeatureFlagEnabled';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { type EchartSeriesClickEvent } from '../SimpleChart';
import VisualizationBigNumberConfig from './VisualizationBigNumberConfig';
import VisualizationCartesianConfig from './VisualizationConfigCartesian';
import VisualizationConfigFunnel from './VisualizationConfigFunnel';
import VisualizationPieConfig from './VisualizationConfigPie';
import VisualizationTableConfig from './VisualizationConfigTable';
import VisualizationTreemapConfig from './VisualizationConfigTreemap';
import VisualizationCustomConfig from './VisualizationCustomConfig';
import Context, { type TablePaginationState } from './context';
import { type VisualizationConfig } from './types';
import { type useVisualizationContext } from './useVisualizationContext';

const EMPTY_COLOR_MAP: Record<string, string> = {};

export type VisualizationProviderProps = {
    minimal?: boolean;
    isDashboard?: boolean;
    chartConfig: ChartConfig;
    initialPivotDimensions: string[] | undefined;
    unsavedMetricQuery?: MetricQuery;
    resultsData: InfiniteQueryResults & {
        metricQuery?: MetricQuery;
        fields?: ItemsMap;
    };
    parameters?: ParametersValuesMap;
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    onChartTypeChange?: (value: ChartType) => void;
    onChartConfigChange?: (value: ChartConfig) => void;
    onPivotDimensionsChange?: (value: string[] | undefined) => void;
    pivotTableMaxColumnLimit: number;
    savedChartUuid?: string;
    dashboardFilters?: DashboardFilters;
    invalidateCache?: boolean;
    colorPalette: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
    setEchartsRef?: (ref: RefObject<EChartsReact | null>) => void;
    computedSeries?: Series[];
    apiErrorDetail?: ApiErrorDetail | null;
    dashboardSlug?: string;
    dashboardName?: string;
    /** 当为 true 时，使用哈希分配颜色，相同 identifier 获得相同颜色 */
    useHashBased?: boolean;
    /** 看板级系列手配色，跨 Tab 预取后传入 */
    manualColorMap?: Record<string, string>;
    /** 看板已知系列名的确定性哈希色，筛选新系列只避让这些槽 */
    hashAssignments?: Record<string, string>;
    tablePagination?: TablePaginationState;
};

const VisualizationProvider: FC<
    React.PropsWithChildren<VisualizationProviderProps>
> = ({
    minimal = false,
    isDashboard = false,
    initialPivotDimensions,
    resultsData,
    isLoading,
    columnOrder,
    pivotTableMaxColumnLimit,
    chartConfig,
    onChartConfigChange,
    onSeriesContextMenu,
    onChartTypeChange,
    onPivotDimensionsChange,
    children,
    savedChartUuid,
    dashboardFilters,
    invalidateCache,
    colorPalette,
    tableCalculationsMetadata,
    setEchartsRef,
    computedSeries,
    apiErrorDetail,
    parameters,
    unsavedMetricQuery,
    dashboardSlug,
    dashboardName,
    useHashBased = false,
    hashAssignments = EMPTY_COLOR_MAP,
    tablePagination,
}) => {
    const itemsMap = useMemo(() => {
        const metricOverrides = resultsData?.metricQuery?.metricOverrides;
        const resultItemsMap = resultsData?.fields;

        if (!metricOverrides) return resultItemsMap;

        return Object.fromEntries(
            Object.entries(resultItemsMap || {}).map(([key, value]) => {
                if (!metricOverrides?.[key]) return [key, value];
                const itemWithoutLegacyFormat = omit(value, [
                    'format',
                    'round',
                ]);
                return [
                    key,
                    {
                        ...itemWithoutLegacyFormat,
                        ...metricOverrides[key],
                    },
                ];
            }),
        );
    }, [resultsData]);

    const chartRef = useRef<EChartsReact | null>(null);
    useEffect(() => {
        if (setEchartsRef)
            setEchartsRef(chartRef as RefObject<EChartsReact | null>);
    }, [chartRef, setEchartsRef]);
    const [lastValidResultsData, setLastValidResultsData] = useState<
        InfiniteQueryResults & { metricQuery?: MetricQuery; fields?: ItemsMap }
    >();

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        initialPivotDimensions,
        useSqlPivotResults?.enabled
            ? (unsavedMetricQuery ?? lastValidResultsData?.metricQuery)
            : lastValidResultsData?.metricQuery,
    );

    const setChartType = useCallback(
        (value: ChartType) => onChartTypeChange?.(value),
        [onChartTypeChange],
    );

    const visibleColorKeys = useMemo(() => {
        const keys: string[] = [];

        if (chartConfig.type === ChartType.CARTESIAN) {
            const allSeries =
                computedSeries && computedSeries.length > 0
                    ? computedSeries
                    : chartConfig.config?.eChartsConfig.series;
            (allSeries ?? []).forEach((series) => {
                const completeIdentifier =
                    calculateSeriesLikeIdentifier(series)[1];
                if (completeIdentifier) keys.push(completeIdentifier);
            });
        }

        if (chartConfig.type === ChartType.PIE) {
            const pie = chartConfig.config;
            Object.keys(pie?.groupColorOverrides ?? {}).forEach((name) =>
                keys.push(name),
            );
            Object.keys(pie?.metadata ?? {}).forEach((name) => keys.push(name));
            (pie?.groupSortOverrides ?? []).forEach((name) => keys.push(name));
            const groupFieldIds = pie?.groupFieldIds ?? [];
            keys.push(...pieRowColorKeys(resultsData?.rows, groupFieldIds));
        }

        return keys;
    }, [chartConfig, computedSeries, resultsData]);

    const chartHashAssignments = useMemo(() => {
        if (!useHashBased) return hashAssignments;
        return appendUnknownHashColors(
            visibleColorKeys,
            colorPalette,
            hashAssignments,
        );
    }, [useHashBased, visibleColorKeys, colorPalette, hashAssignments]);

    const { calculateKeyColorAssignment, calculateSeriesColorAssignment } =
        useChartColorConfig({
            colorPalette,
            useHashBased,
            hashAssignments: chartHashAssignments,
        });

    // cartesian config related
    const [stacking, setStacking] = useState<boolean | StackType>();
    const [cartesianType, setCartesianType] = useState<CartesianTypeOptions>();
    // --

    // If we don't toggle any fields, (eg: when you `explore from here`) columnOrder on tableConfig might be empty
    // so we initialize it with the fields from resultData
    const defaultColumnOrder = useMemo(() => {
        if (columnOrder.length > 0) {
            return columnOrder;
        } else {
            const metricQuery = resultsData?.metricQuery;
            const metricQueryFields =
                metricQuery !== undefined
                    ? [
                          ...metricQuery.dimensions,
                          ...metricQuery.metrics,
                          ...metricQuery.tableCalculations.map(
                              ({ name }) => name,
                          ),
                      ]
                    : [];
            return metricQueryFields;
        }
    }, [resultsData?.metricQuery, columnOrder]);

    /**
     * Build a local set of fallback colors, used when dealing with ungrouped series.
     *
     * On dashboards, these must be passed in computedSeries prop
     * On charts, these are computed from the chartConfig
     * Colors are pre-calculated per-series, and re-calculated when series change.
     */
    const fallbackColors = useMemo<Record<string, string>>(() => {
        if (!chartConfig?.config || chartConfig.type !== ChartType.CARTESIAN) {
            return {};
        }

        const allSeries =
            computedSeries && computedSeries.length > 0
                ? computedSeries
                : chartConfig.config.eChartsConfig.series;

        const sortedSeriesIdentifiers = (allSeries ?? [])
            .map((series) => calculateSeriesLikeIdentifier(series).join('|'))
            .sort((a, b) => b.localeCompare(a));

        // 当 useHashBased 开启时，以看板 hashAssignments 为准，未知名只追加
        if (useHashBased) {
            return Object.fromEntries(
                sortedSeriesIdentifiers.map((identifier) => {
                    const parts = identifier.split('|');
                    const value = parts[parts.length - 1] ?? identifier;
                    const color = resolveSyncedHashColor(
                        value,
                        colorPalette,
                        chartHashAssignments,
                    );
                    return [identifier, color];
                }),
            );
        }

        return Object.fromEntries(
            sortedSeriesIdentifiers.map((identifier, i) => {
                return [
                    identifier,
                    CartesianChartDataModel.getDefaultColor(i, colorPalette),
                ];
            }),
        );
    }, [
        chartConfig,
        colorPalette,
        computedSeries,
        useHashBased,
        chartHashAssignments,
    ]);

    const handleChartConfigChange = useCallback(
        (newChartConfig: ChartConfig) => {
            if (!onChartConfigChange) return;
            if (isEqual(newChartConfig.config, chartConfig?.config)) return;

            onChartConfigChange(newChartConfig);
        },
        [onChartConfigChange, chartConfig?.config],
    );

    useEffect(() => {
        if (!resultsData) return;
        setLastValidResultsData(resultsData);
    }, [resultsData]);

    const effectiveResultsData = resultsData ?? lastValidResultsData;

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    /**
     * Gets a shared color for a given group name.
     * Used in pie charts
     */
    const getGroupColor = useCallback(
        (groupPrefix: string, identifier: string) => {
            if (useHashBased) {
                const mapped = lookupSyncedColor(
                    identifier,
                    chartHashAssignments,
                );
                if (mapped) return mapped;
            }

            if (itemsMap) {
                const dimension = itemsMap[groupPrefix];
                if (dimension && isDimension(dimension)) {
                    const colors = dimension.colors;
                    if (colors && colors[identifier]) {
                        return colors[identifier];
                    }
                }
            }

            return calculateKeyColorAssignment(groupPrefix, identifier);
        },
        [
            calculateKeyColorAssignment,
            chartHashAssignments,
            itemsMap,
            useHashBased,
        ],
    );

    const getGroupColors = useCallback(
        (groupPrefix: string, identifiers: string[]) => {
            if (useHashBased) {
                const assigned = appendUnknownHashColors(
                    identifiers,
                    colorPalette,
                    chartHashAssignments,
                );
                return Object.fromEntries(
                    identifiers.map((identifier) => [
                        identifier,
                        lookupSyncedColor(identifier, assigned) ??
                            resolveSyncedHashColor(
                                identifier,
                                colorPalette,
                                assigned,
                            ),
                    ]),
                );
            }

            return Object.fromEntries(
                identifiers.map((identifier) => [
                    identifier,
                    getGroupColor(groupPrefix, identifier),
                ]),
            );
        },
        [chartHashAssignments, colorPalette, getGroupColor, useHashBased],
    );

    const isCalculateSeriesColorEnabled = useFeatureFlagEnabled(
        FeatureFlags.CalculateSeriesColor,
    );

    /**
     * Gets a shared color for a given series.
     */
    const getSeriesColor = useCallback(
        (seriesLike: SeriesLike) => {
            // 哈希模式下，忽略当前图的 series/metadata 顺序色，改用看板系列色表 + 哈希避让
            if (!useHashBased && seriesLike.color) return seriesLike.color;

            const seriesIdentifier = calculateSeriesLikeIdentifier(seriesLike);
            const completeIdentifier = seriesIdentifier[1] ?? '';

            if (useHashBased) {
                const mapped = lookupSyncedColor(
                    completeIdentifier,
                    chartHashAssignments,
                );
                if (mapped) return mapped;
            } else {
                const serieId = seriesIdentifier.join('.');
                const metadata =
                    chartConfig.type === ChartType.CARTESIAN
                        ? chartConfig.config?.metadata
                        : undefined;
                if (metadata && metadata?.[serieId]?.color) {
                    return metadata?.[serieId].color;
                }
            }

            /** Check if color is set in the dimension metadata */

            let pivot: PivotValue | undefined;
            if ('pivotReference' in seriesLike && seriesLike.pivotReference) {
                pivot = seriesLike.pivotReference.pivotValues?.[0];
            } else if (seriesLike.encode && 'yRef' in seriesLike.encode) {
                pivot = seriesLike.encode.yRef.pivotValues?.[0];
            }
            if (itemsMap && pivot) {
                const { field, value } = pivot;
                const dimension = itemsMap[field];
                if (
                    dimension &&
                    isDimension(dimension) &&
                    typeof value === 'string'
                ) {
                    const colors = dimension.colors;
                    if (colors && colors[value]) {
                        return colors[value];
                    }
                }
            }

            /**
             * If this series is grouped, figure out a shared color assignment from the series;
             * otherwise, pick a series color from the palette based on its order.
             */
            return isGroupedSeries(seriesLike) && isCalculateSeriesColorEnabled
                ? calculateSeriesColorAssignment(seriesLike)
                : fallbackColors[
                      // Note: we don't use getSeriesId since we may not be dealing with a Series type here
                      seriesIdentifier.join('|')
                  ];
        },

        [
            calculateSeriesColorAssignment,
            fallbackColors,
            chartConfig,
            chartHashAssignments,
            itemsMap,
            isCalculateSeriesColorEnabled,
            useHashBased,
        ],
    );

    const value: Omit<
        ReturnType<typeof useVisualizationContext>,
        'visualizationConfig'
    > = {
        minimal,
        isDashboard,
        pivotDimensions: validPivotDimensions,
        chartRef,
        resultsData: effectiveResultsData,
        isLoading,
        apiErrorDetail,
        columnOrder,
        itemsMap,
        setStacking,
        setCartesianType,
        onSeriesContextMenu,
        setChartType,
        setPivotDimensions,
        colorPalette,
        getGroupColor,
        getGroupColors,
        getSeriesColor,
        chartConfig,
        useHashBased,
        tablePagination,
    };

    switch (chartConfig.type) {
        case ChartType.CARTESIAN:
            return (
                <VisualizationCartesianConfig
                    itemsMap={itemsMap}
                    resultsData={effectiveResultsData}
                    validPivotDimensions={validPivotDimensions}
                    columnOrder={defaultColumnOrder}
                    initialChartConfig={chartConfig.config}
                    stacking={stacking}
                    cartesianType={cartesianType}
                    setPivotDimensions={setPivotDimensions}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationCartesianConfig>
            );
        case ChartType.PIE:
            return (
                <VisualizationPieConfig
                    itemsMap={itemsMap}
                    resultsData={effectiveResultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationPieConfig>
            );
        case ChartType.FUNNEL:
            return (
                <VisualizationConfigFunnel
                    itemsMap={itemsMap}
                    resultsData={effectiveResultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationConfigFunnel>
            );
        case ChartType.BIG_NUMBER:
            return (
                <VisualizationBigNumberConfig
                    itemsMap={itemsMap}
                    resultsData={effectiveResultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationBigNumberConfig>
            );
        case ChartType.TREEMAP:
            return (
                <VisualizationTreemapConfig
                    itemsMap={itemsMap}
                    resultsData={effectiveResultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    parameters={parameters}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationTreemapConfig>
            );
        case ChartType.TABLE:
            return (
                <VisualizationTableConfig
                    itemsMap={itemsMap}
                    resultsData={effectiveResultsData}
                    columnOrder={defaultColumnOrder}
                    validPivotDimensions={validPivotDimensions}
                    pivotTableMaxColumnLimit={pivotTableMaxColumnLimit}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    savedChartUuid={savedChartUuid}
                    dashboardFilters={dashboardFilters}
                    invalidateCache={invalidateCache}
                    parameters={parameters}
                    dashboardSlug={dashboardSlug}
                    dashboardName={dashboardName}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationTableConfig>
            );
        case ChartType.CUSTOM:
            return (
                <VisualizationCustomConfig
                    resultsData={effectiveResultsData}
                    itemsMap={itemsMap}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationCustomConfig>
            );
        case ChartType.DATA_APP_VIZ: {
            // Full DataAppViz config lives under features/apps; stub until wired.
            const visualizationConfig: VisualizationConfig = {
                chartType: ChartType.DATA_APP_VIZ,
                chartConfig: { validConfig: null },
            };
            return (
                <Context.Provider value={{ ...value, visualizationConfig }}>
                    {children}
                </Context.Provider>
            );
        }
        default:
            return assertUnreachable(chartConfig, 'Unknown chart type');
    }
};

export default VisualizationProvider;
