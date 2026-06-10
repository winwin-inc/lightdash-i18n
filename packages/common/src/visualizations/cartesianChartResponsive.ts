import type { BarMaxWidthConfig } from './barChartWidth';
import {
    applyBarMaxWidthToEchartsSpec,
    resolveBarMaxWidth,
} from './barChartWidth';

export type SeriesWithLabel = {
    type?: string;
    name?: string;
    yAxisIndex?: number;
    encode?: { x?: string; y?: string };
    label?: {
        show?: boolean;
        fontSize?: number;
        distance?: number;
        align?: string;
    };
    labelLayout?:
        | {
              hideOverlap?: boolean;
              moveOverlap?: 'shiftX' | 'shiftY';
          }
        | ((params: { dataIndex?: number }) => {
              hideOverlap?: boolean;
              moveOverlap?: 'shiftX' | 'shiftY';
              dy?: number;
          });
    barCategoryGap?: string;
    barGap?: string;
};

export type MobileBarLabelSeriesInput = {
    type?: string;
    name?: string;
    yAxisIndex?: number;
    labelShows: boolean;
    legendVisible: boolean;
    valuesByCategory: number[];
};

export type MobileBarLabelPlan = {
    staggerByCategoryIndex: boolean[];
    applyBarGapTuning: boolean;
};

const DEFAULT_SIMILAR_HEIGHT_THRESHOLD = 0.15;
const MAX_NORMALIZED_HEIGHT_FOR_STAGGER = 0.85;
const BASE_LABEL_DISTANCE = 6;
const STAGGER_EXTRA_DISTANCE = 12;

const isSeriesLegendVisible = (
    name: string | undefined,
    legendSelected?: Record<string, boolean>,
): boolean => {
    if (!name || !legendSelected) return true;
    return legendSelected[name] !== false;
};

const shouldStaggerCategoryPair = (
    value: number,
    otherValue: number,
    maxFirst: number,
    maxSecond: number,
    similarHeightThreshold: number,
): boolean => {
    if (value <= 0 && otherValue <= 0) return false;

    const normalizedFirst = value / maxFirst;
    const normalizedSecond = otherValue / maxSecond;
    const heightDiff = Math.abs(normalizedFirst - normalizedSecond);
    const tallerBarHeight = Math.max(normalizedFirst, normalizedSecond);

    return (
        heightDiff < similarHeightThreshold &&
        tallerBarHeight < MAX_NORMALIZED_HEIGHT_FOR_STAGGER
    );
};

/** Desktop: hide overlapping labels. Mobile: shift horizontally first, then hide stubborn overlaps. */
export const getSeriesLabelLayout = (isMobile: boolean) =>
    isMobile
        ? { hideOverlap: true, moveOverlap: 'shiftX' as const }
        : { hideOverlap: true };

export const computeMobileBarLabelPlan = ({
    series,
    similarHeightThreshold = DEFAULT_SIMILAR_HEIGHT_THRESHOLD,
}: {
    series: MobileBarLabelSeriesInput[];
    similarHeightThreshold?: number;
}): MobileBarLabelPlan => {
    const visibleBars = series.filter(
        (serie) =>
            serie.type === 'bar' &&
            serie.labelShows &&
            serie.legendVisible &&
            serie.valuesByCategory.length > 0,
    );

    if (visibleBars.length <= 1) {
        return {
            staggerByCategoryIndex: [],
            applyBarGapTuning: false,
        };
    }

    if (visibleBars.length === 2) {
        const [first, second] = visibleBars;
        const maxFirst = Math.max(...first.valuesByCategory, 0) || 1;
        const maxSecond = Math.max(...second.valuesByCategory, 0) || 1;
        const categoryCount = Math.max(
            first.valuesByCategory.length,
            second.valuesByCategory.length,
        );

        const staggerByCategoryIndex = Array.from(
            { length: categoryCount },
            (_, index) =>
                shouldStaggerCategoryPair(
                    first.valuesByCategory[index] ?? 0,
                    second.valuesByCategory[index] ?? 0,
                    maxFirst,
                    maxSecond,
                    similarHeightThreshold,
                ),
        );

        return {
            staggerByCategoryIndex,
            applyBarGapTuning: true,
        };
    }

    return {
        staggerByCategoryIndex: [],
        applyBarGapTuning: true,
    };
};

const createMobileLabelLayout = (
    serie: SeriesWithLabel,
    plan: MobileBarLabelPlan,
) => {
    const yAxisIndex = serie.yAxisIndex ?? 0;

    return (params: { dataIndex?: number }) => {
        const dataIndex = params.dataIndex ?? 0;
        const shouldStagger =
            yAxisIndex === 1 && plan.staggerByCategoryIndex[dataIndex] === true;

        return {
            hideOverlap: true,
            moveOverlap: 'shiftX' as const,
            ...(shouldStagger && { dy: -STAGGER_EXTRA_DISTANCE }),
        };
    };
};

export const applyMobileSeriesLabelAdjustments = (
    serie: SeriesWithLabel,
    plan: MobileBarLabelPlan,
): Partial<SeriesWithLabel> => {
    if (!serie.label?.show) return {};

    const isBar = serie.type === 'bar';

    return {
        labelLayout: createMobileLabelLayout(serie, plan),
        label: {
            ...serie.label,
            ...(isBar && {
                fontSize: 10,
                align: 'center',
                distance: BASE_LABEL_DISTANCE,
            }),
        },
        ...(isBar &&
            plan.applyBarGapTuning && {
                barCategoryGap: '32%',
                barGap: '18%',
            }),
    };
};

const parseGridTopPx = (top: unknown): number => {
    if (typeof top === 'number') return top;
    if (typeof top === 'string' && top.includes('px')) {
        return parseInt(top, 10) || 70;
    }
    return 70;
};

const getValuesFromDatasetRow = (
    row: Record<string, unknown>,
    fieldKey: string,
): number => {
    const value = row[fieldKey];
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : 0;
};

const buildSeriesInputsFromEchartsSpec = (
    spec: Record<string, unknown>,
): MobileBarLabelSeriesInput[] => {
    if (!Array.isArray(spec.series)) return [];

    const legendSelected = (
        spec.legend as { selected?: Record<string, boolean> } | undefined
    )?.selected;
    const source = (spec.dataset as { source?: Record<string, unknown>[] })
        ?.source;

    return spec.series.map((serie: SeriesWithLabel) => {
        const yKey = serie.encode?.y;
        const valuesByCategory =
            yKey && Array.isArray(source)
                ? source.map((row) => getValuesFromDatasetRow(row, yKey))
                : [];

        return {
            type: serie.type,
            name: serie.name,
            yAxisIndex: serie.yAxisIndex,
            labelShows: !!serie.label?.show,
            legendVisible: isSeriesLegendVisible(serie.name, legendSelected),
            valuesByCategory,
        };
    });
};

export const applySeriesLabelLayoutForViewport = <
    T extends Record<string, unknown>,
>(
    spec: T,
    isMobile: boolean,
): T => {
    if (!Array.isArray(spec.series)) return spec;

    const mobileBarLabelPlan = isMobile
        ? computeMobileBarLabelPlan({
              series: buildSeriesInputsFromEchartsSpec(spec),
          })
        : null;

    const series = spec.series.map((serie: SeriesWithLabel) => {
        if (!serie.label?.show) return serie;
        if (!isMobile || !mobileBarLabelPlan) {
            return {
                ...serie,
                labelLayout: getSeriesLabelLayout(false),
            };
        }

        return {
            ...serie,
            ...applyMobileSeriesLabelAdjustments(serie, mobileBarLabelPlan),
        };
    });

    const hasVisibleLabels = series.some(
        (serie: SeriesWithLabel) => serie.label?.show,
    );

    if (!isMobile || !hasVisibleLabels || !spec.grid) {
        return { ...spec, series };
    }

    const grid = spec.grid as { top?: string | number };
    const topPx = parseGridTopPx(grid.top);

    return {
        ...spec,
        series,
        grid: {
            ...grid,
            top: `${Math.max(topPx, 85)}px`,
        },
    };
};

export const applyResponsiveCartesianSpec = <T extends Record<string, unknown>>(
    spec: T,
    options: {
        isMobile: boolean;
        barMaxWidthConfig?: BarMaxWidthConfig;
    },
): T => {
    const barMaxWidth = resolveBarMaxWidth(
        options.barMaxWidthConfig,
        options.isMobile,
    );
    const withBarWidth = applyBarMaxWidthToEchartsSpec(spec, barMaxWidth);
    return applySeriesLabelLayoutForViewport(withBarWidth, options.isMobile);
};
