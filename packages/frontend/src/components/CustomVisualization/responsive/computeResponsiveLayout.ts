import type { ResponsiveLayout, ResponsiveLayoutVariant, VegaSpec } from './types';

function getHeightStep(spec: VegaSpec): number | null {
    const height = spec.height;
    if (
        height !== undefined &&
        typeof height === 'object' &&
        height !== null &&
        typeof (height as VegaSpec).step === 'number'
    ) {
        const step = (height as VegaSpec).step as number;
        return step > 0 ? step : null;
    }
    return null;
}

function getNominalYField(spec: VegaSpec): string | null {
    const encoding = spec.encoding;
    if (encoding === undefined || typeof encoding !== 'object' || encoding === null) {
        return null;
    }
    const y = (encoding as VegaSpec).y;
    if (y === undefined || typeof y !== 'object' || y === null) {
        return null;
    }
    const field = (y as VegaSpec).field;
    return typeof field === 'string' ? field : null;
}

function countCategories(
    series: Record<string, unknown>[] | undefined,
    field: string | null,
): number {
    if (!series || series.length === 0) {
        return 1;
    }
    if (!field) {
        return series.length;
    }
    return Math.max(1, new Set(series.map((row) => row[field])).size);
}

function buildDefaultLayout(
    variant: ResponsiveLayoutVariant,
    containerWidth: number,
    containerHeight: number,
): ResponsiveLayout {
    return {
        layoutId: variant,
        variant,
        useStepHeight: false,
        useAutosizeNone: false,
        chartSize: { width: containerWidth, height: containerHeight },
        containerStyle: { overflow: 'hidden' },
        vegaStyle: { width: containerWidth, height: containerHeight },
    };
}

export function computeResponsiveLayout(
    variant: ResponsiveLayoutVariant,
    activeSpec: VegaSpec,
    containerWidth: number,
    containerHeight: number,
    series?: Record<string, unknown>[],
): ResponsiveLayout {
    const defaultLayout = buildDefaultLayout(
        variant,
        containerWidth,
        containerHeight,
    );

    if (variant !== 'mobile') {
        return defaultLayout;
    }

    const step = getHeightStep(activeSpec);
    if (step === null) {
        return defaultLayout;
    }

    const yField = getNominalYField(activeSpec);
    const categoryCount = countCategories(series, yField);
    const chartHeight = categoryCount * step;
    const needsScroll = chartHeight > containerHeight;
    const vegaHeight = needsScroll ? chartHeight : containerHeight;

    return {
        layoutId: variant,
        variant,
        useStepHeight: true,
        useAutosizeNone: needsScroll,
        chartSize: { width: containerWidth, height: vegaHeight },
        containerStyle: needsScroll
            ? {
                  overflowX: 'hidden',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
              }
            : { overflow: 'hidden' },
        vegaStyle: { width: containerWidth, height: vegaHeight },
    };
}
