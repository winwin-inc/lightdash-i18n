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
    right: 16,
    bottom: 40,
    left: 52,
};

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
        const angle = getXAxisLabelAngle(view);
        if (angle !== null) {
            maxAngle = Math.max(maxAngle, Math.abs(angle));
        }
    }
    walk(spec);
    return maxAngle;
}

function getCompositeAxisReserve(spec: VegaSpec): PaddingInsets {
    const maxLabelAngle = collectMaxXAxisLabelAngle(spec);
    const labelAngleExtra =
        maxLabelAngle > 0
            ? 16 + Math.min(48, Math.floor(maxLabelAngle / 15) * 8)
            : 0;
    return {
        top: COMPOSITE_AXIS_RESERVE.top,
        // 倾斜 x 轴标签会向右下延伸，需同时预留 right / bottom
        right: COMPOSITE_AXIS_RESERVE.right + labelAngleExtra,
        bottom: COMPOSITE_AXIS_RESERVE.bottom + labelAngleExtra,
        left: COMPOSITE_AXIS_RESERVE.left,
    };
}

/** spec padding + 复合图轴标签预留（单图 container+fit 会自动处理，复合图需手动预留） */
function getCompositeLayoutInsets(spec: VegaSpec): PaddingInsets {
    const padding = getPaddingInsets(spec);
    const axisReserve = getCompositeAxisReserve(spec);
    return {
        top: padding.top + axisReserve.top,
        right: padding.right + axisReserve.right,
        bottom: padding.bottom + axisReserve.bottom,
        left: padding.left + axisReserve.left,
    };
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

/**
 * 按容器尺寸归一化 Vega-Lite spec：
 * - 单视图 / layer：注入 width/height = 'container'（响应式）
 * - 复合视图：递归为子视图分配像素 width/height（Vega-Lite 不支持 container/fit）
 */
export function normalizeVegaSpecSizing(
    spec: VegaSpec,
    containerSize: { width: number; height: number },
    series?: Record<string, unknown>[],
    layout?: ResponsiveLayout,
): VegaSpec {
    const { width, height } = containerSize;

    if (!isCompositeVegaSpec(spec)) {
        if (layout?.useStepHeight) {
            return {
                ...spec,
                width: 'container',
            };
        }
        return {
            ...spec,
            width: 'container',
            height: 'container',
        };
    }

    // 复合图：子视图 height 为绘图区像素值，padding 与轴标签在 Vega 中绘制在其外侧，需从容器扣除
    const innerSize = insetSizeForPadding(
        { width, height },
        getCompositeLayoutInsets(spec),
    );
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
    return stripContainerSizing(withSpacing);
}

export function getVegaAutosizeConfig(
    spec: VegaSpec,
    isDashboard: boolean,
    layout?: ResponsiveLayout,
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
    return {
        type: 'fit',
        ...(isDashboard && { resize: true }),
    };
}
