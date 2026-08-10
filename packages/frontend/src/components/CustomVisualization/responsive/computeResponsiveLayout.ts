import type { ResponsiveLayout, ResponsiveLayoutVariant, VegaSpec } from './types';

const FALLBACK_ORDINAL_CATEGORY_COUNT = 8;

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

function getWidthStep(spec: VegaSpec): number | null {
    const width = spec.width;
    if (
        width !== undefined &&
        typeof width === 'object' &&
        width !== null &&
        typeof (width as VegaSpec).step === 'number'
    ) {
        const step = (width as VegaSpec).step as number;
        return step > 0 ? step : null;
    }
    return null;
}

function getRangeStepFromChannel(
    encoding: unknown,
    channel: 'x' | 'y',
): number | null {
    if (
        encoding === undefined ||
        typeof encoding !== 'object' ||
        encoding === null
    ) {
        return null;
    }
    const channelDef = (encoding as VegaSpec)[channel];
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return null;
    }
    const scale = (channelDef as VegaSpec).scale;
    if (scale === undefined || typeof scale !== 'object' || scale === null) {
        return null;
    }
    const rangeStep = (scale as VegaSpec).rangeStep;
    return typeof rangeStep === 'number' && rangeStep > 0 ? rangeStep : null;
}

function getFieldFromChannel(
    encoding: unknown,
    channel: 'x' | 'y',
): string | null {
    if (
        encoding === undefined ||
        typeof encoding !== 'object' ||
        encoding === null
    ) {
        return null;
    }
    const channelDef = (encoding as VegaSpec)[channel];
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return null;
    }
    const field = (channelDef as VegaSpec).field;
    return typeof field === 'string' ? field : null;
}

/** width.step or encoding.x.scale.rangeStep (top-level or first matching layer) */
export function findDiscreteWidthStep(spec: VegaSpec): number | null {
    const widthStep = getWidthStep(spec);
    if (widthStep !== null) {
        return widthStep;
    }

    const topLevel = getRangeStepFromChannel(spec.encoding, 'x');
    if (topLevel !== null) {
        return topLevel;
    }

    if (Array.isArray(spec.layer)) {
        for (const layer of spec.layer) {
            if (typeof layer !== 'object' || layer === null) {
                continue;
            }
            const step = getRangeStepFromChannel(
                (layer as VegaSpec).encoding,
                'x',
            );
            if (step !== null) {
                return step;
            }
        }
    }

    return null;
}

function getChannelType(encoding: unknown, channel: 'x' | 'y'): string | null {
    if (
        encoding === undefined ||
        typeof encoding !== 'object' ||
        encoding === null
    ) {
        return null;
    }
    const channelDef = (encoding as VegaSpec)[channel];
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return null;
    }
    const type = (channelDef as VegaSpec).type;
    return typeof type === 'string' ? type : null;
}

function channelIsDiscreteBand(type: string | null): boolean {
    return type === 'nominal' || type === 'ordinal';
}

/**
 * True when some view has a discrete (nominal/ordinal) y band suitable for
 * height.step tables. Quantitative y (e.g. Boston Matrix scatter) does not.
 */
function hasDiscreteBandY(spec: VegaSpec): boolean {
    function checkEncoding(encoding: unknown): boolean {
        return channelIsDiscreteBand(getChannelType(encoding, 'y'));
    }

    if (checkEncoding(spec.encoding)) {
        return true;
    }
    if (Array.isArray(spec.layer)) {
        for (const layer of spec.layer) {
            if (typeof layer !== 'object' || layer === null) {
                continue;
            }
            if (checkEncoding((layer as VegaSpec).encoding)) {
                return true;
            }
        }
    }
    return false;
}

function getNominalYField(spec: VegaSpec): string | null {
    const top = getFieldFromChannel(spec.encoding, 'y');
    if (top !== null && channelIsDiscreteBand(getChannelType(spec.encoding, 'y'))) {
        return top;
    }
    if (Array.isArray(spec.layer)) {
        for (const layer of spec.layer) {
            if (typeof layer !== 'object' || layer === null) {
                continue;
            }
            const encoding = (layer as VegaSpec).encoding;
            if (
                channelIsDiscreteBand(getChannelType(encoding, 'y')) &&
                getFieldFromChannel(encoding, 'y') !== null
            ) {
                return getFieldFromChannel(encoding, 'y');
            }
        }
    }
    // Fall back to top-level field for category counting when type omitted
    return getFieldFromChannel(spec.encoding, 'y');
}

function getNominalXField(spec: VegaSpec): string | null {
    const top = getFieldFromChannel(spec.encoding, 'x');
    if (top !== null) {
        return top;
    }
    if (Array.isArray(spec.layer)) {
        for (const layer of spec.layer) {
            if (typeof layer !== 'object' || layer === null) {
                continue;
            }
            const field = getFieldFromChannel(
                (layer as VegaSpec).encoding,
                'x',
            );
            if (field !== null) {
                return field;
            }
        }
    }
    return null;
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

function getMaxBinsFromTransform(spec: VegaSpec): number | null {
    const transform = spec.transform;
    if (!Array.isArray(transform)) {
        return null;
    }
    for (const entry of transform) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }
        const bin = (entry as VegaSpec).bin;
        if (bin === true) {
            return null;
        }
        if (typeof bin === 'object' && bin !== null) {
            const maxbins = (bin as VegaSpec).maxbins;
            if (typeof maxbins === 'number' && maxbins > 0) {
                return maxbins;
            }
        }
    }
    return null;
}

/**
 * Estimate ordinal band count for natural width.
 * Prefer unique values of the x field; if missing (e.g. post-bin calculate),
 * fall back to transform.maxbins, then a conservative default.
 */
export function estimateWidthStepCategoryCount(
    spec: VegaSpec,
    series?: Record<string, unknown>[],
): number {
    const xField = getNominalXField(spec);
    if (xField && series && series.length > 0) {
        const unique = new Set(series.map((row) => row[xField]));
        // Calculated/bin labels often absent from raw series — ignore empty uniques
        if (unique.size > 0 && ![...unique].every((v) => v === undefined)) {
            return Math.max(1, unique.size);
        }
    }

    const maxbins = getMaxBinsFromTransform(spec);
    if (maxbins !== null) {
        return maxbins;
    }

    return FALLBACK_ORDINAL_CATEGORY_COUNT;
}

function getAuthorNumericHeight(spec: VegaSpec): number | null {
    return typeof spec.height === 'number' && spec.height > 0
        ? spec.height
        : null;
}

function buildScrollStyle(needsScrollX: boolean, needsScrollY: boolean): {
    overflow?: 'hidden';
    overflowX?: 'hidden' | 'auto';
    overflowY?: 'hidden' | 'auto';
    WebkitOverflowScrolling?: 'touch';
} {
    if (!needsScrollX && !needsScrollY) {
        return { overflow: 'hidden' };
    }
    return {
        overflowX: needsScrollX ? 'auto' : 'hidden',
        overflowY: needsScrollY ? 'auto' : 'hidden',
        WebkitOverflowScrolling: 'touch',
    };
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
        useStepWidth: false,
        useAutosizeNone: false,
        chartSize: { width: containerWidth, height: containerHeight },
        containerStyle: { overflow: 'hidden' },
        vegaStyle: { width: containerWidth, height: containerHeight },
    };
}

export type ComputeResponsiveLayoutOptions = {
    /**
     * Narrow / embed: force fit-in-tile — skip rangeStep natural width and
     * author numeric height scroll so bands share container size (matches prod).
     */
    preferFitInTile?: boolean;
};

export function computeResponsiveLayout(
    variant: ResponsiveLayoutVariant,
    activeSpec: VegaSpec,
    containerWidth: number,
    containerHeight: number,
    series?: Record<string, unknown>[],
    options?: ComputeResponsiveLayoutOptions,
): ResponsiveLayout {
    const defaultLayout = buildDefaultLayout(
        variant,
        containerWidth,
        containerHeight,
    );
    const preferFitInTile = options?.preferFitInTile === true;
    const authorHeight = getAuthorNumericHeight(activeSpec);

    // Historical mobile table path: height.step + vertical scroll
    // Only when y is a discrete band (nominal/ordinal). Quant×quant scatter
    // with a stray height.step (e.g. Boston Matrix) must not take this path.
    if (variant === 'mobile') {
        const step = getHeightStep(activeSpec);
        if (step !== null && hasDiscreteBandY(activeSpec)) {
            const yField = getNominalYField(activeSpec);
            const categoryCount = countCategories(series, yField);
            const chartHeight = categoryCount * step;
            const needsScroll = chartHeight > containerHeight;
            const vegaHeight = needsScroll ? chartHeight : containerHeight;

            return {
                layoutId: variant,
                variant,
                useStepHeight: true,
                useStepWidth: false,
                useAutosizeNone: needsScroll,
                chartSize: { width: containerWidth, height: vegaHeight },
                containerStyle: buildScrollStyle(false, needsScroll),
                vegaStyle: { width: containerWidth, height: vegaHeight },
            };
        }
    }

    // Narrow: stay at container size (do not expand via rangeStep / author height)
    if (preferFitInTile) {
        return defaultLayout;
    }

    // Discrete band width (wide viewport): natural width + optional H-scroll
    const widthStep = findDiscreteWidthStep(activeSpec);
    if (widthStep !== null) {
        const categoryCount = estimateWidthStepCategoryCount(
            activeSpec,
            series,
        );
        const naturalWidth = categoryCount * widthStep;
        const needsScrollX = naturalWidth > containerWidth;
        const chartWidth = needsScrollX ? naturalWidth : containerWidth;

        let chartHeight = containerHeight;
        let needsScrollY = false;
        if (authorHeight !== null) {
            chartHeight = authorHeight;
            needsScrollY = authorHeight > containerHeight;
        }

        return {
            layoutId: variant,
            variant,
            useStepHeight: false,
            useStepWidth: true,
            useAutosizeNone: needsScrollX || needsScrollY,
            chartSize: { width: chartWidth, height: chartHeight },
            containerStyle: buildScrollStyle(needsScrollX, needsScrollY),
            vegaStyle: { width: chartWidth, height: chartHeight },
        };
    }

    // Author fixed numeric height taller than tile → vertical scroll (wide only)
    if (authorHeight !== null && authorHeight > containerHeight) {
        return {
            layoutId: variant,
            variant,
            useStepHeight: false,
            useStepWidth: false,
            useAutosizeNone: true,
            chartSize: { width: containerWidth, height: authorHeight },
            containerStyle: buildScrollStyle(false, true),
            vegaStyle: { width: containerWidth, height: authorHeight },
        };
    }

    return defaultLayout;
}
