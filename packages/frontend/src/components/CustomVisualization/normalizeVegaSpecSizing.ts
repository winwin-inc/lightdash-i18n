import type { ResponsiveLayout } from './responsive/types';

const COMPOSITE_KEYS = [
    'hconcat',
    'vconcat',
    'concat',
    'facet',
    'repeat',
] as const;

/** 与 Vega-Lite concat 默认 spacing 一致，避免尺寸计算与渲染间距不一致导致右侧裁切 */
const DEFAULT_SPACING = 20;

type VegaSpec = Record<string, unknown>;

type PaddingInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

/** 解析 spec 顶层 padding（Vega-Lite 原生字段，复合图尺寸分配时需预留边距） */
function getPaddingInsets(spec: VegaSpec): PaddingInsets {
    const padding = spec.padding;
    if (padding === undefined || padding === null) {
        return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    if (typeof padding === 'number' && padding >= 0) {
        return {
            top: padding,
            right: padding,
            bottom: padding,
            left: padding,
        };
    }
    if (typeof padding === 'object' && !Array.isArray(padding)) {
        const raw = padding as VegaSpec;
        return {
            top: typeof raw.top === 'number' ? raw.top : 0,
            right: typeof raw.right === 'number' ? raw.right : 0,
            bottom: typeof raw.bottom === 'number' ? raw.bottom : 0,
            left: typeof raw.left === 'number' ? raw.left : 0,
        };
    }
    return { top: 0, right: 0, bottom: 0, left: 0 };
}

function insetSizeForPadding(
    containerSize: { width: number; height: number },
    padding: PaddingInsets,
): { width: number; height: number } {
    return {
        width: Math.max(1, containerSize.width - padding.left - padding.right),
        height: Math.max(
            1,
            containerSize.height - padding.top - padding.bottom,
        ),
    };
}

/** 复合图子视图使用固定像素高度时，x/y 轴与标题在绘图区外渲染，需预留空间避免被 tile 裁切 */
const COMPOSITE_AXIS_RESERVE: PaddingInsets = {
    top: 20,
    right: 48,
    bottom: 40,
    left: 68,
};

/** Extra right reserve when a child uses axis.orient === 'right' */
const COMPOSITE_RIGHT_AXIS_EXTRA = 24;

/**
 * Modest default padding for narrow single views when the author did not set padding.
 * Smaller than scatter-era chrome so bar charts are not drowned in white space;
 * labelAngle bumps bottom/right separately.
 */
const NARROW_SINGLE_VIEW_DEFAULT_PADDING: PaddingInsets = {
    top: 16,
    right: 12,
    bottom: 28,
    left: 44,
};

const MIN_NARROW_DATA_RECT_WIDTH = 160;
const MIN_NARROW_DATA_RECT_HEIGHT = 120;
const MAX_DEFAULT_PADDING_WIDTH_RATIO = 0.35;
const MAX_DEFAULT_PADDING_HEIGHT_RATIO = 0.3;

/**
 * Scale invented default padding down so small tiles keep a usable data-rect.
 * Protect left (y-axis ticks) and bottom (-90 x labels): shrink right/top first.
 * Does not alter author-explicit padding.
 */
export function clampDefaultNarrowPadding(
    padding: PaddingInsets,
    containerSize: { width: number; height: number },
): PaddingInsets {
    const maxHorizontal = Math.max(
        0,
        Math.min(
            containerSize.width * MAX_DEFAULT_PADDING_WIDTH_RATIO,
            Math.max(0, containerSize.width - MIN_NARROW_DATA_RECT_WIDTH),
        ),
    );
    const maxVertical = Math.max(
        0,
        Math.min(
            containerSize.height * MAX_DEFAULT_PADDING_HEIGHT_RATIO,
            Math.max(0, containerSize.height - MIN_NARROW_DATA_RECT_HEIGHT),
        ),
    );

    let { top, right, bottom, left } = padding;
    if (left + right > maxHorizontal) {
        // Prefer keeping left; compress angle-inflated right first
        right = Math.max(0, maxHorizontal - left);
        if (left > maxHorizontal) {
            left = maxHorizontal;
            right = 0;
        }
    }
    if (top + bottom > maxVertical) {
        // Prefer keeping bottom for rotated x labels; compress top first
        top = Math.max(0, maxVertical - bottom);
        if (bottom > maxVertical) {
            bottom = maxVertical;
            top = 0;
        }
    }
    return { top, right, bottom, left };
}

/**
 * True when the author set padding — including explicit 0.
 * Must not use truthiness (padding: 0 is a valid configuration).
 */
function hasExplicitPadding(spec: VegaSpec): boolean {
    return spec.padding !== undefined && spec.padding !== null;
}

/**
 * True when the author set autosize — including string or object forms.
 */
function hasExplicitAutosize(spec: VegaSpec): boolean {
    return spec.autosize !== undefined && spec.autosize !== null;
}

function getAuthorNumericHeight(spec: VegaSpec): number | null {
    return typeof spec.height === 'number' && spec.height > 0
        ? spec.height
        : null;
}

function stripRangeStepFromEncoding(encoding: unknown): unknown {
    if (
        encoding === undefined ||
        typeof encoding !== 'object' ||
        encoding === null
    ) {
        return encoding;
    }
    const enc = encoding as VegaSpec;
    const x = enc.x;
    if (x === undefined || typeof x !== 'object' || x === null) {
        return encoding;
    }
    const xDef = x as VegaSpec;
    const scale = xDef.scale;
    if (scale === undefined || typeof scale !== 'object' || scale === null) {
        return encoding;
    }
    const scaleObj = scale as VegaSpec;
    if (!('rangeStep' in scaleObj)) {
        return encoding;
    }
    const { rangeStep: _removed, ...restScale } = scaleObj;
    return {
        ...enc,
        x: {
            ...xDef,
            scale: restScale,
        },
    };
}

/**
 * Remove discrete band width hints so ordinal bands share the pinned plot width
 * (narrow fit-in-tile). Keeps other scale props such as padding.
 */
export function stripDiscreteBandWidth(spec: VegaSpec): VegaSpec {
    let result = { ...spec };

    const width = result.width;
    if (
        width !== undefined &&
        typeof width === 'object' &&
        width !== null &&
        'step' in (width as VegaSpec)
    ) {
        delete result.width;
    }

    if (result.encoding !== undefined) {
        result = {
            ...result,
            encoding: stripRangeStepFromEncoding(result.encoding) as VegaSpec,
        };
    }

    if (Array.isArray(result.layer)) {
        result = {
            ...result,
            layer: result.layer.map((layer) => {
                if (typeof layer !== 'object' || layer === null) {
                    return layer;
                }
                const view = layer as VegaSpec;
                return {
                    ...view,
                    encoding: stripRangeStepFromEncoding(
                        view.encoding,
                    ) as VegaSpec,
                };
            }),
        };
    }

    return result;
}

type VegaAutosizeConfig = {
    type: 'fit' | 'pad' | 'none';
    resize?: boolean;
    contains?: 'padding' | 'content';
};

function getAuthorAutosizeConfig(spec: VegaSpec): VegaAutosizeConfig | null {
    if (!hasExplicitAutosize(spec)) {
        return null;
    }
    const autosize = spec.autosize;
    if (typeof autosize === 'string') {
        if (autosize === 'fit' || autosize === 'pad' || autosize === 'none') {
            return { type: autosize };
        }
        return { type: 'fit' };
    }
    if (typeof autosize === 'object' && !Array.isArray(autosize)) {
        const raw = autosize as VegaSpec;
        const type =
            raw.type === 'pad' || raw.type === 'none' || raw.type === 'fit'
                ? raw.type
                : 'fit';
        const contains =
            raw.contains === 'padding' || raw.contains === 'content'
                ? raw.contains
                : undefined;
        return {
            type,
            ...(contains !== undefined ? { contains } : {}),
        };
    }
    return { type: 'fit' };
}

function axisShowsLabels(axis: unknown): boolean {
    // Vega-Lite: null and false both disable the axis
    if (axis === false || axis === null) {
        return false;
    }
    if (axis === undefined || axis === true) {
        return true;
    }
    if (typeof axis === 'object') {
        return (axis as VegaSpec).labels !== false;
    }
    return true;
}

function channelIsQuantitative(channelDef: unknown): boolean {
    return (
        channelDef !== undefined &&
        typeof channelDef === 'object' &&
        channelDef !== null &&
        (channelDef as VegaSpec).type === 'quantitative'
    );
}

function channelExplicitlyDisablesAxisLabels(channelDef: unknown): boolean {
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return false;
    }
    const axis = (channelDef as VegaSpec).axis;
    if (axis === false || axis === null) {
        return true;
    }
    if (typeof axis === 'object' && axis !== null) {
        return (axis as VegaSpec).labels === false;
    }
    return false;
}

function channelAxisOrient(channelDef: VegaSpec): string | null {
    const axis = channelDef.axis;
    if (axis === undefined || typeof axis !== 'object' || axis === null) {
        return null;
    }
    const orient = (axis as VegaSpec).orient;
    return typeof orient === 'string' ? orient : null;
}

/**
 * True when a y/y2 channel needs invented left padding for tick labels.
 * Skips: axis:false/null, labels:false, orient:right, nominal/ordinal.
 */
function channelNeedsLeftYAxisLabelReserve(channelDef: unknown): boolean {
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return false;
    }
    const def = channelDef as VegaSpec;
    if (def.type !== 'quantitative') {
        return false;
    }
    if (!axisShowsLabels(def.axis)) {
        return false;
    }
    if (channelAxisOrient(def) === 'right') {
        return false;
    }
    return true;
}

function channelShowsXAxisLabels(channelDef: unknown): boolean {
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return false;
    }
    const def = channelDef as VegaSpec;
    if (typeof def.field !== 'string' && def.type === undefined) {
        return false;
    }
    return axisShowsLabels(def.axis);
}

function forEachViewEncoding(
    spec: VegaSpec,
    visit: (encoding: unknown) => void,
): void {
    function walk(obj: unknown): void {
        if (obj === null || typeof obj !== 'object') {
            return;
        }
        if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
        }
        const view = obj as VegaSpec;
        if (view.encoding !== undefined) {
            visit(view.encoding);
        }
        if (Array.isArray(view.layer)) {
            view.layer.forEach(walk);
        }
        for (const key of COMPOSITE_KEYS) {
            if (!(key in view)) {
                continue;
            }
            const value = view[key];
            if (Array.isArray(value)) {
                value.forEach(walk);
            }
        }
        if ('spec' in view) {
            walk(view.spec);
        }
    }
    walk(spec);
}

/**
 * Left reserve only when a left-side quantitative y axis actually draws labels.
 * If any layer/view explicitly disables y labels (common on bar+text layers),
 * do not invent left — layer axes merge and ticks usually stay off.
 */
export function needsLeftYAxisLabelReserve(spec: VegaSpec): boolean {
    let anyExplicitDisable = false;
    let anyNeedsReserve = false;
    forEachViewEncoding(spec, (encoding) => {
        if (encoding === undefined || typeof encoding !== 'object') {
            return;
        }
        const enc = encoding as VegaSpec;
        for (const channel of [enc.y, enc.y2]) {
            if (
                channelIsQuantitative(channel) &&
                channelExplicitlyDisablesAxisLabels(channel)
            ) {
                anyExplicitDisable = true;
            }
            if (channelNeedsLeftYAxisLabelReserve(channel)) {
                anyNeedsReserve = true;
            }
        }
    });
    if (anyExplicitDisable) {
        return false;
    }
    return anyNeedsReserve;
}

function needsXAxisLabelReserve(spec: VegaSpec): boolean {
    if (collectMaxXAxisLabelAngle(spec) > 0) {
        return true;
    }
    let needed = false;
    forEachViewEncoding(spec, (encoding) => {
        if (needed || encoding === undefined || typeof encoding !== 'object') {
            return;
        }
        const enc = encoding as VegaSpec;
        if (
            channelShowsXAxisLabels(enc.x) ||
            channelShowsXAxisLabels(enc.x2)
        ) {
            needed = true;
        }
    });
    return needed;
}

/**
 * Invent modest chrome only when some axis labels actually need reserve.
 * Not every layer / quantitative y — labels:false and category-y charts skip.
 */
function needsAxisChrome(spec: VegaSpec): boolean {
    return needsLeftYAxisLabelReserve(spec) || needsXAxisLabelReserve(spec);
}

function labelAnglePaddingExtra(maxLabelAngle: number): number {
    if (maxLabelAngle <= 0) {
        return 0;
    }
    return 16 + Math.min(48, Math.floor(maxLabelAngle / 15) * 8);
}

/** Split angle chrome: near-vertical labels need bottom, not a fat right gutter. */
function labelAngleSideExtras(maxLabelAngle: number): {
    right: number;
    bottom: number;
} {
    const extra = labelAnglePaddingExtra(maxLabelAngle);
    if (extra === 0) {
        return { right: 0, bottom: 0 };
    }
    if (maxLabelAngle >= 60) {
        return {
            right: Math.min(8, Math.floor(extra / 8)),
            bottom: extra,
        };
    }
    return { right: extra, bottom: extra };
}

function buildNarrowDefaultPadding(spec: VegaSpec): PaddingInsets {
    const needLeft = needsLeftYAxisLabelReserve(spec);
    const needX = needsXAxisLabelReserve(spec);
    const maxAngle = collectMaxXAxisLabelAngle(spec);
    const { right: angleRight, bottom: angleBottom } = labelAngleSideExtras(
        maxAngle,
    );
    // |angle|≥60: only tiny right (≤8); do not stack base 8 + angleRight
    const right =
        maxAngle >= 60 ? angleRight : (needX ? 8 : 0) + angleRight;
    return {
        top: needLeft || needX ? 8 : 0,
        right,
        bottom:
            (needX ? NARROW_SINGLE_VIEW_DEFAULT_PADDING.bottom : 0) +
            angleBottom,
        left: needLeft ? NARROW_SINGLE_VIEW_DEFAULT_PADDING.left : 0,
    };
}

function isZeroPadding(padding: PaddingInsets): boolean {
    return (
        padding.top === 0 &&
        padding.right === 0 &&
        padding.bottom === 0 &&
        padding.left === 0
    );
}

function maxPaddingSides(...pads: PaddingInsets[]): PaddingInsets {
    return {
        top: Math.max(0, ...pads.map((p) => p.top)),
        right: Math.max(0, ...pads.map((p) => p.right)),
        bottom: Math.max(0, ...pads.map((p) => p.bottom)),
        left: Math.max(0, ...pads.map((p) => p.left)),
    };
}

function getMarkDef(view: VegaSpec): VegaSpec | null {
    const mark = view.mark;
    if (typeof mark === 'string') {
        return { type: mark };
    }
    if (typeof mark === 'object' && mark !== null && !Array.isArray(mark)) {
        return mark as VegaSpec;
    }
    return null;
}

/** Pixel offset parsed from encoding value / value.expr */
type PixelOffset =
    | { kind: 'absolute'; value: number }
    | { kind: 'widthPlus'; value: number }
    | { kind: 'heightPlus'; value: number };

/**
 * Parse simple out-of-plot pixel expressions used by Boston-matrix chrome.
 * Supports: number, "-60", "width+60", "height+45". Skips complex signals.
 */
function parsePixelOffset(raw: unknown): PixelOffset | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return { kind: 'absolute', value: raw };
    }
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const expr = (raw as VegaSpec).expr;
        if (typeof expr === 'string') {
            return parsePixelOffsetExpr(expr);
        }
    }
    if (typeof raw === 'string') {
        return parsePixelOffsetExpr(raw);
    }
    return null;
}

function parsePixelOffsetExpr(expr: string): PixelOffset | null {
    const trimmed = expr.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return { kind: 'absolute', value: Number(trimmed) };
    }
    const widthPlus = /^width\s*\+\s*(-?\d+(\.\d+)?)$/.exec(trimmed);
    if (widthPlus) {
        return { kind: 'widthPlus', value: Number(widthPlus[1]) };
    }
    const heightPlus = /^height\s*\+\s*(-?\d+(\.\d+)?)$/.exec(trimmed);
    if (heightPlus) {
        return { kind: 'heightPlus', value: Number(heightPlus[1]) };
    }
    return null;
}

function getEncodingPixelOffset(channelDef: unknown): PixelOffset | null {
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return null;
    }
    return parsePixelOffset((channelDef as VegaSpec).value);
}

const OUT_OF_PLOT_LEGEND_ROW_EXTRA = 16;
const OUT_OF_PLOT_BOTTOM_LEGEND_EXTRA = 40;
const OUT_OF_PLOT_AXIS_TITLE_EXTRA = 20;
/** Estimate ~3 digit average label width relative to fontSize */
const OUT_OF_PLOT_LEFT_TEXT_CHARS = 3;
const OUT_OF_PLOT_LEFT_CHAR_WIDTH = 0.65;

function applyPixelOffsetToSide(
    offset: PixelOffset,
    axis: 'x' | 'y' | 'x2' | 'y2',
    sides: { top: number; right: number; bottom: number; left: number },
    markExtent: number,
): void {
    if (offset.kind === 'absolute') {
        if ((axis === 'y' || axis === 'y2') && offset.value < 0) {
            sides.top = Math.max(
                sides.top,
                -offset.value + Math.ceil(markExtent / 2) + 4,
            );
        }
        if ((axis === 'x' || axis === 'x2') && offset.value < 0) {
            sides.left = Math.max(sides.left, -offset.value);
        }
        return;
    }
    if (offset.kind === 'widthPlus' && (axis === 'x' || axis === 'x2')) {
        sides.right = Math.max(sides.right, Math.max(0, offset.value));
        return;
    }
    if (offset.kind === 'heightPlus' && (axis === 'y' || axis === 'y2')) {
        sides.bottom = Math.max(sides.bottom, Math.max(0, offset.value));
    }
}

function channelHasAxisTitle(channelDef: unknown): boolean {
    if (
        channelDef === undefined ||
        typeof channelDef !== 'object' ||
        channelDef === null
    ) {
        return false;
    }
    const axis = (channelDef as VegaSpec).axis;
    if (axis === false || axis === null) {
        return false;
    }
    if (typeof axis !== 'object' || axis === null) {
        return false;
    }
    const title = (axis as VegaSpec).title;
    return typeof title === 'string' && title.length > 0;
}

/**
 * Estimate padding needed for marks / legends placed outside the data rect
 * (negative pixel y/x, width+N / height+N expr, legendY, bottom legend, axis titles).
 * Does not invent composite axis 68.
 */
export function collectOutOfPlotChromeReserve(spec: VegaSpec): PaddingInsets {
    const sides = { top: 0, right: 0, bottom: 0, left: 0 };

    function markExtentFor(mark: VegaSpec | null): number {
        if (mark === null) {
            return 8;
        }
        let extent = 8;
        if (typeof mark.height === 'number' && mark.height > 0) {
            extent = Math.max(extent, mark.height);
        }
        if (typeof mark.width === 'number' && mark.width > 0) {
            extent = Math.max(extent, mark.width);
        }
        if (mark.type === 'text') {
            const fontSize =
                typeof mark.fontSize === 'number' ? mark.fontSize : 12;
            extent = Math.max(extent, fontSize);
        }
        return extent;
    }

    function visitView(view: VegaSpec): void {
        const encoding = view.encoding;
        if (
            encoding === undefined ||
            typeof encoding !== 'object' ||
            encoding === null
        ) {
            return;
        }
        const enc = encoding as VegaSpec;
        const mark = getMarkDef(view);
        const extent = markExtentFor(mark);

        const color = enc.color;
        if (color !== undefined && typeof color === 'object' && color !== null) {
            const legend = (color as VegaSpec).legend;
            if (
                legend !== undefined &&
                typeof legend === 'object' &&
                legend !== null
            ) {
                const legendY = (legend as VegaSpec).legendY;
                if (typeof legendY === 'number' && legendY < 0) {
                    sides.top = Math.max(
                        sides.top,
                        -legendY + OUT_OF_PLOT_LEGEND_ROW_EXTRA,
                    );
                }
            }
        }

        for (const axis of ['x', 'x2', 'y', 'y2'] as const) {
            const offset = getEncodingPixelOffset(enc[axis]);
            if (offset !== null) {
                applyPixelOffsetToSide(offset, axis, sides, extent);
            }
        }

        // Left overhang text: x≈0 + negative dx (monthly average label)
        const xOffset = getEncodingPixelOffset(enc.x);
        if (
            mark !== null &&
            mark.type === 'text' &&
            xOffset?.kind === 'absolute' &&
            xOffset.value <= 8
        ) {
            const dx = typeof mark.dx === 'number' ? mark.dx : 0;
            if (dx < 0) {
                const fontSize =
                    typeof mark.fontSize === 'number' ? mark.fontSize : 12;
                const textWidth = Math.ceil(
                    fontSize *
                        OUT_OF_PLOT_LEFT_TEXT_CHARS *
                        OUT_OF_PLOT_LEFT_CHAR_WIDTH,
                );
                if (mark.align === 'right') {
                    sides.left = Math.max(sides.left, -dx + textWidth);
                } else {
                    sides.left = Math.max(
                        sides.left,
                        -(xOffset.value + dx) + textWidth,
                    );
                }
            }
        }

        if (channelHasAxisTitle(enc.x) || channelHasAxisTitle(enc.x2)) {
            sides.bottom = Math.max(
                sides.bottom,
                OUT_OF_PLOT_AXIS_TITLE_EXTRA,
            );
        }
        if (channelHasAxisTitle(enc.y) || channelHasAxisTitle(enc.y2)) {
            sides.left = Math.max(sides.left, OUT_OF_PLOT_AXIS_TITLE_EXTRA);
        }
    }

    function walk(obj: unknown): void {
        if (obj === null || typeof obj !== 'object') {
            return;
        }
        if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
        }
        const view = obj as VegaSpec;
        visitView(view);
        if (Array.isArray(view.layer)) {
            view.layer.forEach(walk);
        }
        for (const key of COMPOSITE_KEYS) {
            if (!(key in view)) {
                continue;
            }
            const value = view[key];
            if (Array.isArray(value)) {
                value.forEach(walk);
            }
        }
        if ('spec' in view) {
            walk(view.spec);
        }
    }

    walk(spec);

    const config = spec.config;
    if (config !== undefined && typeof config === 'object' && config !== null) {
        const legend = (config as VegaSpec).legend;
        if (
            legend !== undefined &&
            typeof legend === 'object' &&
            legend !== null &&
            (legend as VegaSpec).orient === 'bottom'
        ) {
            sides.bottom = Math.max(
                sides.bottom,
                OUT_OF_PLOT_BOTTOM_LEGEND_EXTRA,
            );
        }
    }

    return sides;
}

function maybeClampPadding(
    padding: PaddingInsets,
    containerSize?: { width: number; height: number },
): PaddingInsets {
    if (containerSize === undefined) {
        return padding;
    }
    return clampDefaultNarrowPadding(padding, containerSize);
}

/**
 * Author padding:0 stays 0. Non-zero author padding is merged with out-of-plot
 * chrome and axis-label reserves (desktop pad used to absorb those).
 * No author padding → max(axis defaults, out-of-plot chrome).
 * Discrete step-width charts pass skipDefaultPadding to skip invented chrome.
 */
export function getNarrowSingleViewPadding(
    spec: VegaSpec,
    containerSize?: { width: number; height: number },
    options?: { skipDefaultPadding?: boolean },
): PaddingInsets {
    if (hasExplicitPadding(spec)) {
        const author = getPaddingInsets(spec);
        // Explicit 0 (or all-zero object): author wants flush plot — do not bump
        if (isZeroPadding(author)) {
            return author;
        }
        const chrome = collectOutOfPlotChromeReserve(spec);
        // Floors: author + out-of-plot marks (legendY / overhang text). Axis-angle
        // clamp must not eat these — desktop pad used to absorb them.
        const floors = maxPaddingSides(author, chrome);
        const desired = maxPaddingSides(floors, buildNarrowDefaultPadding(spec));
        const clamped = maybeClampPadding(desired, containerSize);
        return maxPaddingSides(clamped, floors);
    }
    if (options?.skipDefaultPadding === true) {
        return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const chrome = collectOutOfPlotChromeReserve(spec);
    const hasChrome = !isZeroPadding(chrome);
    if (hasExplicitAutosize(spec) && !needsAxisChrome(spec) && !hasChrome) {
        return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    // No axis label reserve and no out-of-plot chrome → do not invent padding
    if (!needsAxisChrome(spec) && !hasChrome) {
        return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const defaults = needsAxisChrome(spec)
        ? buildNarrowDefaultPadding(spec)
        : { top: 0, right: 0, bottom: 0, left: 0 };
    const floors = chrome;
    const desired = maxPaddingSides(defaults, chrome);
    const clamped = maybeClampPadding(desired, containerSize);
    // Out-of-plot chrome floors must survive clamp (same as author path)
    return maxPaddingSides(clamped, floors);
}

function hasCompositeKey(spec: VegaSpec): boolean {
    return COMPOSITE_KEYS.some((key) => key in spec);
}

function getXAxisLabelAngle(view: VegaSpec): number | null {
    const encoding = view.encoding;
    if (
        encoding === undefined ||
        typeof encoding !== 'object' ||
        encoding === null
    ) {
        return null;
    }
    const x = (encoding as VegaSpec).x;
    if (x === undefined || typeof x !== 'object' || x === null) {
        return null;
    }
    const axis = (x as VegaSpec).axis;
    if (axis === undefined || typeof axis !== 'object' || axis === null) {
        return null;
    }
    const labelAngle = (axis as VegaSpec).labelAngle;
    return typeof labelAngle === 'number' ? labelAngle : null;
}

function channelHasRightOrient(encoding: unknown): boolean {
    if (
        encoding === undefined ||
        typeof encoding !== 'object' ||
        encoding === null
    ) {
        return false;
    }
    const enc = encoding as VegaSpec;
    for (const channel of ['x', 'x2', 'y', 'y2'] as const) {
        const def = enc[channel];
        if (def === undefined || typeof def !== 'object' || def === null) {
            continue;
        }
        const axis = (def as VegaSpec).axis;
        if (axis === undefined || typeof axis !== 'object' || axis === null) {
            continue;
        }
        if ((axis as VegaSpec).orient === 'right') {
            return true;
        }
    }
    return false;
}

function hasRightOrientedAxis(spec: VegaSpec): boolean {
    let found = false;
    function walk(obj: unknown): void {
        if (found || obj === null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
        }
        const view = obj as VegaSpec;
        if (channelHasRightOrient(view.encoding)) {
            found = true;
            return;
        }
        if (Array.isArray(view.layer)) {
            view.layer.forEach(walk);
        }
        if (hasCompositeKey(view)) {
            for (const key of COMPOSITE_KEYS) {
                const value = view[key];
                if (Array.isArray(value)) value.forEach(walk);
            }
            if ('spec' in view) walk(view.spec);
        }
    }
    walk(spec);
    return found;
}

function collectMaxXAxisLabelAngle(spec: VegaSpec): number {
    let maxAngle = 0;
    function walk(obj: unknown): void {
        if (obj === null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
        }
        const view = obj as VegaSpec;
        if (hasCompositeKey(view)) {
            for (const key of COMPOSITE_KEYS) {
                const value = view[key];
                if (Array.isArray(value)) value.forEach(walk);
            }
            if ('spec' in view) walk(view.spec);
            return;
        }
        if (Array.isArray(view.layer)) {
            view.layer.forEach(walk);
        }
        const angle = getXAxisLabelAngle(view);
        if (angle !== null) {
            maxAngle = Math.max(maxAngle, Math.abs(angle));
        }
    }
    walk(spec);
    return maxAngle;
}

function getCompositeAxisReserve(spec: VegaSpec): PaddingInsets {
    const needLeft = needsLeftYAxisLabelReserve(spec);
    const needX = needsXAxisLabelReserve(spec);
    const maxAngle = collectMaxXAxisLabelAngle(spec);
    const { right: angleRight, bottom: angleBottom } = labelAngleSideExtras(
        maxAngle,
    );
    const rightOrientExtra = hasRightOrientedAxis(spec)
        ? COMPOSITE_RIGHT_AXIS_EXTRA
        : 0;
    // |angle|≥60: skip fat COMPOSITE right; category/TOP10 with no quant left → left 0
    const right =
        (maxAngle >= 60
            ? angleRight
            : (needX ? COMPOSITE_AXIS_RESERVE.right : 8) + angleRight) +
        rightOrientExtra;
    return {
        top: needLeft || needX ? COMPOSITE_AXIS_RESERVE.top : 0,
        right,
        bottom:
            (needX ? COMPOSITE_AXIS_RESERVE.bottom : 0) + angleBottom,
        left: needLeft ? COMPOSITE_AXIS_RESERVE.left : 0,
    };
}

/**
 * Insets used when allocating composite child pixel sizes.
 * Author padding (including 0) wins; otherwise use axis/title reserve only.
 */
function getCompositeContentInsets(spec: VegaSpec): PaddingInsets {
    if (hasExplicitPadding(spec)) {
        return getPaddingInsets(spec);
    }
    return getCompositeAxisReserve(spec);
}

/** 根 spec 是否为 Vega-Lite 复合视图（hconcat / vconcat / concat / facet / repeat） */
export function isCompositeVegaSpec(spec: VegaSpec): boolean {
    return hasCompositeKey(spec);
}

function getSpacing(spec: VegaSpec): number {
    const spacing = spec.spacing;
    return typeof spacing === 'number' && spacing >= 0
        ? spacing
        : DEFAULT_SPACING;
}

function hasExplicitNumericSize(value: unknown): boolean {
    return typeof value === 'number' && value > 0;
}

function getRepeatArrayLength(value: unknown): number {
    if (Array.isArray(value)) return value.length;
    if (value !== undefined && value !== null) return 1;
    return 0;
}

function getFacetFieldName(facetDef: unknown): string | null {
    if (
        typeof facetDef === 'object' &&
        facetDef !== null &&
        typeof (facetDef as VegaSpec).field === 'string'
    ) {
        return (facetDef as VegaSpec).field as string;
    }
    return null;
}

function countUniqueFieldValues(
    series: Record<string, unknown>[] | undefined,
    field: string | null,
): number {
    if (!field || !series || series.length === 0) return 1;
    const unique = new Set(series.map((row) => row[field]));
    return Math.max(1, unique.size);
}

function distributeAlongAxis(
    total: number,
    count: number,
    spacing: number,
): number {
    if (count <= 0) return total;
    const totalSpacing = spacing * Math.max(0, count - 1);
    return Math.max(1, Math.floor((total - totalSpacing) / count));
}

function sizeLeafView(
    view: VegaSpec,
    availWidth: number,
    availHeight: number,
): VegaSpec {
    const result = { ...view };
    if (!hasExplicitNumericSize(result.width)) {
        result.width = availWidth;
    }
    if (!hasExplicitNumericSize(result.height)) {
        result.height = availHeight;
    }
    return result;
}

function applyCompositeSizing(
    spec: VegaSpec,
    availWidth: number,
    availHeight: number,
    series?: Record<string, unknown>[],
): VegaSpec {
    const sizeView = (
        view: unknown,
        viewWidth: number,
        viewHeight: number,
    ): VegaSpec => {
        if (typeof view !== 'object' || view === null) {
            return {};
        }
        const v = view as VegaSpec;

        if (hasCompositeKey(v)) {
            const sized = applyCompositeSizing(
                v,
                viewWidth,
                viewHeight,
                series,
            );
            if (!hasExplicitNumericSize(sized.width)) {
                sized.width = viewWidth;
            }
            if (!hasExplicitNumericSize(sized.height)) {
                sized.height = viewHeight;
            }
            return sized;
        }

        return sizeLeafView(v, viewWidth, viewHeight);
    };

    const result = { ...spec };
    const spacing = getSpacing(result);

    if ('hconcat' in result && Array.isArray(result.hconcat)) {
        const views = result.hconcat as VegaSpec[];
        const childWidth = distributeAlongAxis(
            availWidth,
            views.length,
            spacing,
        );
        result.hconcat = views.map((view) =>
            sizeView(view, childWidth, availHeight),
        );
    }

    if ('vconcat' in result && Array.isArray(result.vconcat)) {
        const views = result.vconcat as VegaSpec[];
        const childHeight = distributeAlongAxis(
            availHeight,
            views.length,
            spacing,
        );
        result.vconcat = views.map((view) =>
            sizeView(view, availWidth, childHeight),
        );
    }

    if ('concat' in result && Array.isArray(result.concat)) {
        const views = result.concat as VegaSpec[];
        const columns =
            typeof result.columns === 'number' && result.columns > 0
                ? result.columns
                : views.length;
        const rowCount = Math.ceil(views.length / columns);
        const childWidth = distributeAlongAxis(availWidth, columns, spacing);
        const childHeight = distributeAlongAxis(availHeight, rowCount, spacing);
        result.concat = views.map((view) =>
            sizeView(view, childWidth, childHeight),
        );
    }

    if (
        'repeat' in result &&
        typeof result.repeat === 'object' &&
        result.repeat !== null
    ) {
        const repeatDef = result.repeat as VegaSpec;
        const rowCount = getRepeatArrayLength(repeatDef.row) || 1;
        const colCount = getRepeatArrayLength(repeatDef.column) || 1;
        const childWidth = distributeAlongAxis(availWidth, colCount, spacing);
        const childHeight = distributeAlongAxis(availHeight, rowCount, spacing);

        if (
            'spec' in result &&
            typeof result.spec === 'object' &&
            result.spec !== null
        ) {
            result.spec = sizeView(
                result.spec as VegaSpec,
                childWidth,
                childHeight,
            );
        }
    }

    if ('facet' in result) {
        const columnField = getFacetFieldName(result.column);
        const rowField = getFacetFieldName(result.row);
        const facetField = getFacetFieldName(result.facet);

        let colCount = 1;
        let rowCount = 1;
        if (columnField) {
            colCount = countUniqueFieldValues(series, columnField);
        } else if (facetField && !rowField) {
            // 仅 facet.field 时按唯一值横向排列
            colCount = countUniqueFieldValues(series, facetField);
        }
        if (rowField) {
            rowCount = countUniqueFieldValues(series, rowField);
        }

        const childWidth = distributeAlongAxis(availWidth, colCount, spacing);
        const childHeight = distributeAlongAxis(availHeight, rowCount, spacing);

        if (
            'spec' in result &&
            typeof result.spec === 'object' &&
            result.spec !== null
        ) {
            result.spec = sizeView(
                result.spec as VegaSpec,
                childWidth,
                childHeight,
            );
        }
    }

    return result;
}

function stripContainerSizing(spec: VegaSpec): VegaSpec {
    const result = { ...spec };
    if (result.width === 'container') delete result.width;
    if (result.height === 'container') delete result.height;
    return result;
}

export type VegaSizingOptions = {
    /**
     * Narrow / embed: pin single-view size with inset pixels + autosize none
     * so React size corrections update the spec (no reliance on autosize.resize
     * or fit, which collapses heavy layers).
     * Must not override mobile height.step (useStepHeight) — only pin width.
     */
    useExplicitPixelSize?: boolean;
};

/**
 * 按容器尺寸归一化 Vega-Lite spec：
 * - 单视图 / layer：默认 width/height = 'container'；窄屏改为 inset 像素 + none
 * - mobile height.step：只钉宽度，保留 step（防类目表拉伸）
 * - 窄屏 fit-in-tile：剥离 rangeStep / width.step，高度跟容器 inset
 * - 宽屏 width.step / rangeStep：钉自然宽（useStepWidth）
 * - 复合视图：递归为子视图分配像素 width/height（Vega-Lite 不支持 container/fit）
 */
export function normalizeVegaSpecSizing(
    spec: VegaSpec,
    containerSize: { width: number; height: number },
    series?: Record<string, unknown>[],
    layout?: ResponsiveLayout,
    options?: VegaSizingOptions,
): VegaSpec {
    const { width, height } = containerSize;
    const useExplicitPixelSize = options?.useExplicitPixelSize === true;

    if (!isCompositeVegaSpec(spec)) {
        if (layout?.useStepHeight) {
            // Historical mobile table path: never replace height.step
            return {
                ...spec,
                width: useExplicitPixelSize ? width : 'container',
            };
        }
        if (layout?.useStepWidth) {
            // Wide discrete band width: pin natural width from layout; keep author height;
            // never invent large default chrome padding that shrinks bands.
            const padding = getNarrowSingleViewPadding(spec, containerSize, {
                skipDefaultPadding: true,
            });
            const authorHeight = getAuthorNumericHeight(spec);
            const authorAutosize = getAuthorAutosizeConfig(spec);
            const pinnedHeight = authorHeight ?? height;
            if (useExplicitPixelSize) {
                return {
                    ...spec,
                    width,
                    height: pinnedHeight,
                    padding,
                    autosize: authorAutosize ?? { type: 'none' },
                };
            }
            return {
                ...spec,
                width,
                height: pinnedHeight,
                padding,
                ...(authorAutosize !== null ? { autosize: authorAutosize } : {}),
            };
        }
        if (useExplicitPixelSize) {
            // Fit-in-tile: strip rangeStep so bands share width; height follows container.
            const stripped = stripDiscreteBandWidth(spec);
            const padding = getNarrowSingleViewPadding(stripped, {
                width,
                height,
            });
            const plotSize = insetSizeForPadding({ width, height }, padding);
            const authorAutosize = getAuthorAutosizeConfig(stripped);
            if (authorAutosize !== null) {
                return {
                    ...stripped,
                    width: plotSize.width,
                    height: plotSize.height,
                    padding,
                    autosize: authorAutosize,
                };
            }
            return {
                ...stripped,
                width: plotSize.width,
                height: plotSize.height,
                padding,
                autosize: { type: 'none' },
            };
        }
        return {
            ...spec,
            width: 'container',
            height: 'container',
        };
    }

    // 复合图：子视图 height 为绘图区像素值；有作者 padding 则只扣作者边距，否则扣轴预留并写回
    const contentInsets = getCompositeContentInsets(spec);
    const innerSize = insetSizeForPadding({ width, height }, contentInsets);
    const sized = applyCompositeSizing(
        spec,
        innerSize.width,
        innerSize.height,
        series,
    );
    const withSpacing =
        sized.spacing === undefined
            ? { ...sized, spacing: DEFAULT_SPACING }
            : sized;
    const stripped = stripContainerSizing(withSpacing);
    // Write invented reserve as padding so pad/contains:padding keeps axes inside tile
    if (!hasExplicitPadding(spec)) {
        return { ...stripped, padding: contentInsets };
    }
    return stripped;
}

export type VegaAutosizeOptions = {
    /**
     * When false, dashboard charts still use fit but do not continuously
     * resize on every container jitter. Size updates come from React
     * remount with stabilized pixel dimensions instead.
     * Custom viz always passes false — fit+resize collapses overlay layers.
     */
    continuousResize?: boolean;
    /**
     * When true (and not useStepHeight), single-view charts use autosize none
     * with inset pixel width/height (no continuous resize / no fit crush).
     */
    useExplicitPixelSize?: boolean;
};

export function getVegaAutosizeConfig(
    spec: VegaSpec,
    isDashboard: boolean,
    layout?: ResponsiveLayout,
    options?: VegaAutosizeOptions,
): {
    type: 'fit' | 'pad' | 'none';
    resize?: boolean;
    contains?: 'padding' | 'content';
} {
    if (layout?.useAutosizeNone) {
        return { type: 'none' };
    }
    if (isCompositeVegaSpec(spec)) {
        // contains: padding 使子视图 width/height 与边距一并纳入布局计算
        return { type: 'pad', contains: 'padding' };
    }
    // Step-width on narrow: never fall through to fit (crushes rangeStep bands).
    if (layout?.useStepWidth && options?.useExplicitPixelSize) {
        const authorAutosize = getAuthorAutosizeConfig(spec);
        if (authorAutosize !== null) {
            return authorAutosize;
        }
        return { type: 'none' };
    }
    // Ordinary narrow single-view: preserve author autosize; else none.
    // Do not force this on step-height (fits-in-container may still use plain fit).
    if (
        options?.useExplicitPixelSize &&
        !layout?.useStepHeight &&
        !layout?.useStepWidth
    ) {
        const authorAutosize = getAuthorAutosizeConfig(spec);
        if (authorAutosize !== null) {
            // Never enable continuous resize on narrow (click-collapse).
            return authorAutosize;
        }
        return { type: 'none' };
    }
    const continuousResize = options?.continuousResize ?? true;
    return {
        type: 'fit',
        ...(isDashboard && continuousResize && { resize: true }),
    };
}
