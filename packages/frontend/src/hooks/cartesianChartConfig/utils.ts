import {
    CartesianSeriesType,
    DimensionType,
    getDimensionsFromItemsMap,
    getItemId,
    getSeriesId,
    isDimension,
    StackType,
    type CartesianChart,
    type ItemsMap,
    type Series,
} from '@lightdash/common';
import {
    getPivotedData,
    getPivotedDataFromPivotDetails,
    isBaselineMergedPivotValues,
} from '../plottedData/getPlottedData';
import type { InfiniteQueryResults } from '../useQueryResults';

export const isStackEnabled = (stack: unknown): boolean =>
    stack === StackType.NORMAL ||
    stack === StackType.PERCENT ||
    stack === true;

export const applyStackFromLayout = (
    series: Series[],
    layout: Partial<CartesianChart['layout']> | undefined,
    pivotKeys: string[] | undefined,
): Series[] => {
    if (!isStackEnabled(layout?.stack)) {
        return series.map((serie) =>
            serie.stack === undefined ? serie : { ...serie, stack: undefined },
        );
    }

    const isPivoted = Boolean(pivotKeys && pivotKeys.length > 0);
    const yFields = layout?.yField ?? [];
    const baselineFieldIds = layout?.baselineFieldIds ?? [];

    return series.map((serie) => {
        const { field } = serie.encode.yRef;
        if (!yFields.includes(field)) {
            return serie;
        }

        // Baselines are reference lines: they never join the stack.
        if (baselineFieldIds.includes(field)) {
            return serie.stack === undefined
                ? serie
                : { ...serie, stack: undefined };
        }

        return {
            ...serie,
            stack: isPivoted ? field : 'stack-all-series',
        };
    });
};

export type GetExpectedSeriesMapArgs = {
    defaultSmooth?: boolean;
    defaultShowSymbol?: boolean;
    defaultFilledSymbol?: boolean;
    defaultCartesianType: CartesianSeriesType;
    defaultAreaStyle: Series['areaStyle'];
    isStacked: boolean;
    resultsData: InfiniteQueryResults;
    pivotKeys: string[] | undefined;
    yFields: string[];
    xField: string;
    availableDimensions: string[];
    defaultLabel?: Series['label'];
    itemsMap: ItemsMap | undefined;
    /** Metrics declared as baselines: collapse their pivot series into one. */
    baselineFieldIds?: string[];
};

export const getExpectedSeriesMap = ({
    defaultSmooth,
    defaultShowSymbol,
    defaultFilledSymbol,
    defaultCartesianType,
    defaultAreaStyle,
    isStacked,
    resultsData,
    pivotKeys,
    yFields,
    xField,
    availableDimensions,
    defaultLabel,
    itemsMap,
    baselineFieldIds,
}: GetExpectedSeriesMapArgs) => {
    let expectedSeriesMap: Record<string, Series>;

    const defaultProperties = {
        smooth: defaultSmooth,
        showSymbol: defaultShowSymbol,
        ...(defaultFilledSymbol !== undefined && {
            filledSymbol: defaultFilledSymbol,
        }),
        type: defaultCartesianType,
        areaStyle: defaultAreaStyle,
        yAxisIndex: 0,
        label: defaultLabel,
    };
    if (pivotKeys && pivotKeys.length > 0) {
        // Use new pivoted data format if available
        const { rowKeyMap } = resultsData.pivotDetails
            ? getPivotedDataFromPivotDetails(
                  resultsData,
                  itemsMap,
                  baselineFieldIds,
              )
            : getPivotedData(
                  resultsData.rows,
                  pivotKeys,
                  yFields.filter(
                      (yField) => !availableDimensions.includes(yField),
                  ),
                  yFields.filter((yField) =>
                      availableDimensions.includes(yField),
                  ),
                  baselineFieldIds,
              );

        expectedSeriesMap = Object.values(rowKeyMap).reduce<
            Record<string, Series>
        >((acc, rowKey) => {
            // Baseline metrics collapse into their single merged series;
            // skip the per-pivot-value baseline entries.
            const rowKeyField =
                typeof rowKey === 'string' ? rowKey : rowKey.field;
            const rowKeyPivotValues =
                typeof rowKey === 'string' ? undefined : rowKey.pivotValues;
            if (
                baselineFieldIds?.includes(rowKeyField) &&
                !isBaselineMergedPivotValues(rowKeyPivotValues)
            ) {
                return acc;
            }
            let series: Series;
            if (typeof rowKey === 'string') {
                series = {
                    ...defaultProperties,
                    encode: {
                        xRef: { field: xField },
                        yRef: {
                            field: rowKey,
                        },
                    },
                };
            } else {
                series = {
                    ...defaultProperties,
                    encode: {
                        xRef: { field: xField },
                        yRef: rowKey,
                    },
                    stack:
                        defaultAreaStyle || isStacked
                            ? rowKey.field
                            : undefined,
                };
            }
            return { ...acc, [getSeriesId(series)]: series };
        }, {});
    } else {
        expectedSeriesMap = (yFields || []).reduce<Record<string, Series>>(
            (sum, yField) => {
                const series = {
                    ...defaultProperties,
                    encode: {
                        xRef: { field: xField },
                        yRef: {
                            field: yField,
                        },
                    },
                    stack:
                        isStacked || !!defaultAreaStyle
                            ? 'stack-all-series'
                            : undefined,
                };
                return { ...sum, [getSeriesId(series)]: series };
            },
            {},
        );
    }
    return expectedSeriesMap;
};

/**
 * 用户在配置面板按「组」写入的系列属性（如 hideMetricName，
 * updateAllGroupedSeries 一次写进组内全部系列）。
 * 看板上 expected 系列 id 与存量不一致时（过滤器收窄/放开后出现新分组值、
 * 或基准线合并哨兵替换逐值系列）会由 defaultProperties 重建，
 * 这些用户属性必须从同 field 的存量系列携带过去，否则看板与编辑页表现不一致。
 */
const getGroupUserPropertiesFromExistingSeries = (
    expectedSeries: Series,
    existingSeries: Series[],
): Pick<
    Series,
    | 'hideMetricName'
    | 'color'
    | 'name'
    | 'label'
    | 'smooth'
    | 'showSymbol'
    | 'filledSymbol'
> => {
    const fieldSeries = existingSeries.filter(
        (serie) =>
            serie.encode.yRef.field === expectedSeries.encode.yRef.field,
    );
    if (fieldSeries.length === 0) return {};

    // 组级属性（hideMetricName）任何同 field 系列都携带；系列级自定义色只从
    // 第一个非隐藏系列取（与渲染层 collapseBaselineSeries 的取色规则一致，
    // 用户隐藏的系列不捐色）。全部隐藏时只携带 hideMetricName。
    const firstVisibleSeries = fieldSeries.find(
        (serie) => serie.hidden !== true,
    );

    // 逐值自定义颜色是系列级意图，不随新分组值继承；仅当合并基准线哨兵
    // 替换同 field 的逐值系列（同一条参考线）时携带用户色。改名同理：
    // 哨兵重建后逐值系列会被坍缩丢弃，用户改过的那条参考线上的改名
    // 必须随哨兵存活，否则看板与编辑页表现不一致。
    const replacesMergedBaseline = isBaselineMergedPivotValues(
        expectedSeries.encode.yRef.pivotValues,
    );

    // 哨兵残留 = 该 field 是基准线，且面板上只有它一行可见（改名/颜色
    // 都在它上面）。看板重建时 pivot 形态可能与编辑页不一致（如 pivot
    // 维度丢失后会生成无 pivotValues 的简单系列），此时 expected 不再是
    // 哨兵，但仍属同一条基准线：用户属性照样必须从哨兵携带，否则
    // tooltip 回落原始指标名。
    const sentinelSeries = fieldSeries.find(
        (serie) =>
            isBaselineMergedPivotValues(serie.encode.yRef.pivotValues) &&
            serie.hidden !== true,
    );
    const carriesBaselineIdentity = replacesMergedBaseline || !!sentinelSeries;

    // 携带源与渲染层 collapseBaselineSeries 的 donor 规则对齐：哨兵残留优先
    const carryDonor =
        sentinelSeries || firstVisibleSeries || fieldSeries[0];

    return {
        ...(carryDonor.hideMetricName !== undefined && {
            hideMetricName: carryDonor.hideMetricName,
        }),
        // 组级视觉属性（面板上 updateAllGroupedSeries 一次写给整组）：值标签、
        // 平滑、符号。重建时若从 defaultProperties 取模板系列的值，基准线
        // 开了值标签也会在看板丢失（编辑页能看到、看板看不到）。
        ...(carryDonor.label !== undefined && { label: carryDonor.label }),
        ...(carryDonor.smooth !== undefined && { smooth: carryDonor.smooth }),
        ...(carryDonor.showSymbol !== undefined && {
            showSymbol: carryDonor.showSymbol,
        }),
        ...(carryDonor.filledSymbol !== undefined && {
            filledSymbol: carryDonor.filledSymbol,
        }),
        ...(carriesBaselineIdentity &&
            carryDonor.color !== undefined && {
                color: carryDonor.color,
            }),
        ...(carriesBaselineIdentity &&
            carryDonor.name !== undefined && {
                name: carryDonor.name,
            }),
    };
};

type MergeExistingAndExpectedSeriesArgs = {
    expectedSeriesMap: Record<string, Series>;
    existingSeries: Series[];
};

export const mergeExistingAndExpectedSeries = ({
    expectedSeriesMap,
    existingSeries,
}: MergeExistingAndExpectedSeriesArgs) => {
    const { existingValidSeries, existingValidSeriesIds } =
        existingSeries.reduce<{
            existingValidSeries: Series[];
            existingValidSeriesIds: string[];
        }>(
            (sum, series) => {
                const id = getSeriesId(series);

                // this results in a string without the pivot values
                //e.g. 'orders_order_date_month|orders_average_order_size.orders_is_completed.true' -> 'orders_order_date_month|orders_average_order_size.orders_is_completed'
                // used to check if the series is not expected but part of the same pivot of expected series
                const idWithoutPivotValues = id.replace(/\.[^.]+$/, '');

                const isSeriesExpected =
                    Object.keys(expectedSeriesMap).includes(id);

                const isSeriesFilteredOut =
                    Object.keys(expectedSeriesMap).some((expectedId) =>
                        expectedId.startsWith(idWithoutPivotValues),
                    ) && !isSeriesExpected;

                if (!isSeriesExpected && !isSeriesFilteredOut) {
                    return { ...sum };
                }

                return {
                    ...sum,
                    existingValidSeries: [
                        ...sum.existingValidSeries,
                        {
                            ...series,
                            isFilteredOut: isSeriesFilteredOut,
                        },
                    ],
                    existingValidSeriesIds: [...sum.existingValidSeriesIds, id],
                };
            },
            { existingValidSeries: [], existingValidSeriesIds: [] },
        );

    if (existingValidSeries.length <= 0) {
        return Object.values(expectedSeriesMap).map((expectedSeries) => ({
            ...expectedSeries,
            ...getGroupUserPropertiesFromExistingSeries(
                expectedSeries,
                existingSeries,
            ),
        }));
    }

    // add missing series in the correct order (next to series of the same group)
    return Object.entries(expectedSeriesMap).reduce<Series[]>(
        (acc, [expectedSeriesId, expectedSeries]) => {
            // Don't add the expected series if there is a valid one already
            if (existingValidSeriesIds.includes(expectedSeriesId)) {
                return acc.map((series) =>
                    getSeriesId(series) === expectedSeriesId
                        ? {
                              ...series,
                              stack: expectedSeries.stack ?? series.stack,
                          }
                        : series,
                );
            }
            // Rebuilt series lose user-tuned group properties (hideMetricName,
            // merged-baseline color) — carry them over from the same field
            const expectedSeriesWithUserProperties: Series = {
                ...expectedSeries,
                ...getGroupUserPropertiesFromExistingSeries(
                    expectedSeries,
                    existingSeries,
                ),
            };
            // Add series to the end of its group
            if (
                expectedSeries.encode.yRef.pivotValues &&
                expectedSeries.encode.yRef.pivotValues.length > 0
            ) {
                const lastSeriesInGroupIndex = acc
                    .reverse()
                    .findIndex(
                        (series) =>
                            expectedSeries.encode.yRef.field ===
                            series.encode.yRef.field,
                    );
                if (lastSeriesInGroupIndex >= 0) {
                    return [
                        // part of the array before the specified index
                        ...acc.slice(0, lastSeriesInGroupIndex),
                        // inserted item
                        expectedSeriesWithUserProperties,
                        // part of the array after the specified index
                        ...acc.slice(lastSeriesInGroupIndex),
                    ].reverse();
                }
                return [...acc.reverse(), expectedSeriesWithUserProperties];
            }
            // Add series to the end
            return [...acc, expectedSeriesWithUserProperties];
        },
        existingValidSeries,
    );
};

export const getSeriesGroupedByField = (series: Series[]) => {
    const seriesGroupMap = series.reduce<
        Record<string, { index: number; value: Series[] }>
    >((acc, obj, index) => {
        if (
            acc[obj.encode.yRef.field] &&
            !!obj.encode.yRef.pivotValues &&
            obj.encode.yRef.pivotValues.length > 0
        ) {
            return {
                ...acc,
                [obj.encode.yRef.field]: {
                    ...acc[obj.encode.yRef.field],
                    value: [...acc[obj.encode.yRef.field].value, obj],
                },
            };
        }
        return {
            ...acc,
            [obj.encode.yRef.field]: { index, value: [obj] },
        };
    }, {});
    return Object.values(seriesGroupMap).sort((a, b) => a.index - b.index);
};

export const sortDimensions = (
    dimensionIds: string[],
    itemsMap: ItemsMap | undefined,
    columnOrder: string[],
) => {
    if (!itemsMap) return dimensionIds;

    if (dimensionIds.length <= 1) return dimensionIds;

    const dimensions = Object.values(getDimensionsFromItemsMap(itemsMap));

    const dateDimensions = dimensions.filter(
        (dimension) =>
            isDimension(dimension) &&
            dimensionIds.includes(getItemId(dimension)) &&
            [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                dimension.type,
            ),
    );
    switch (dateDimensions.length) {
        case 0:
            return dimensionIds; // No dates, we return the same order
        case 1: // Only 1 date, we return this date first
            const dateDimensionId = getItemId(dateDimensions[0]);
            return [
                dateDimensionId,
                ...dimensionIds.filter(
                    (dimensionId) => dimensionId !== dateDimensionId,
                ),
            ];
        default:
            // 2 or more dates, we return first the date further left in the results table
            const sortedDateDimensions = dateDimensions.sort(
                (a, b) =>
                    columnOrder.indexOf(getItemId(a)) -
                    columnOrder.indexOf(getItemId(b)),
            );
            const sortedDateDimensionIds = sortedDateDimensions.map(getItemId);
            return [
                ...sortedDateDimensionIds,
                ...dimensionIds.filter(
                    (dimensionId) =>
                        !sortedDateDimensionIds.includes(dimensionId),
                ),
            ];
    }
};

export type SeriesSortDirection = 'asc' | 'desc';

type LegacySeriesSortConfig = {
    tooltipSortByValue?: SeriesSortDirection;
};

export const isSeriesSortDirection = (
    value: unknown,
): value is SeriesSortDirection => value === 'asc' || value === 'desc';

const getLegacyTooltipSortDirection = (
    serie: Series,
): SeriesSortDirection | undefined => {
    const legacySortConfig = serie as Series & LegacySeriesSortConfig;
    return isSeriesSortDirection(legacySortConfig.tooltipSortByValue)
        ? legacySortConfig.tooltipSortByValue
        : undefined;
};

/**
 * Legacy charts stored sorting under `tooltipSortByValue`.
 * Only use when loading saved chart config, not during runtime series rebuilds.
 */
export const migrateLegacySeriesSortConfig = (serie: Series): Series => {
    const normalized = normalizeSeriesSortConfig(serie);
    const legacySortDirection = getLegacyTooltipSortDirection(serie);
    const withoutLegacyTooltipSort = stripLegacyTooltipSortConfig(normalized);

    if (!legacySortDirection) {
        return withoutLegacyTooltipSort;
    }

    if (
        withoutLegacyTooltipSort.seriesSortByValue !== undefined ||
        withoutLegacyTooltipSort.stackSeriesSortByValue !== undefined
    ) {
        return withoutLegacyTooltipSort;
    }

    if (
        serie.type === CartesianSeriesType.LINE ||
        serie.areaStyle !== undefined
    ) {
        return {
            ...withoutLegacyTooltipSort,
            seriesSortByValue: legacySortDirection,
        };
    }

    if (serie.stack && serie.type === CartesianSeriesType.BAR) {
        return {
            ...withoutLegacyTooltipSort,
            stackSeriesSortByValue: legacySortDirection,
        };
    }

    return withoutLegacyTooltipSort;
};

const stripLegacyTooltipSortConfig = (serie: Series): Series => {
    const stripped = { ...serie } as Series & LegacySeriesSortConfig;
    delete stripped.tooltipSortByValue;
    return stripped;
};

export const migrateLegacySeriesListSortConfig = (
    series: Series[],
): Series[] => series.map(migrateLegacySeriesSortConfig);

export const normalizeSeriesSortConfig = (serie: Series): Series => {
    const normalized = stripLegacyTooltipSortConfig({ ...serie });

    if (isSeriesSortDirection(serie.stackSeriesSortByValue)) {
        normalized.stackSeriesSortByValue = serie.stackSeriesSortByValue;
    } else {
        delete normalized.stackSeriesSortByValue;
    }

    if (isSeriesSortDirection(serie.seriesSortByValue)) {
        normalized.seriesSortByValue = serie.seriesSortByValue;
    } else {
        delete normalized.seriesSortByValue;
    }

    return normalized;
};

export const normalizeSeriesListSortConfig = (series: Series[]): Series[] =>
    series.map(normalizeSeriesSortConfig);

export const getStackSeriesSortDirection = (
    series: Series[] | undefined,
): SeriesSortDirection | undefined => {
    if (!series) return undefined;
    for (const serie of series) {
        if (isSeriesSortDirection(serie.stackSeriesSortByValue)) {
            return serie.stackSeriesSortByValue;
        }
    }
    return undefined;
};

export const getSeriesSortDirection = (
    series: Series[] | undefined,
): SeriesSortDirection | undefined => {
    if (!series) return undefined;
    for (const serie of series) {
        if (isSeriesSortDirection(serie.seriesSortByValue)) {
            return serie.seriesSortByValue;
        }
    }
    return undefined;
};
