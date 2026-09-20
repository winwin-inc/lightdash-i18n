import { type ItemsMap } from '@lightdash/common';

import { decomposeCustomVisSpec } from './responsive';
import { type VegaSpec } from './responsive/types';
import { prepareSpecForVega } from './rewriteVegaSpecFieldLabels';

export type CustomVisEditorTab = 'desktop' | 'mobile';

type InlineValues = Record<string, unknown>[];

function isValuesDataRef(data: unknown): boolean {
    return (
        typeof data === 'object' &&
        data !== null &&
        !Array.isArray(data) &&
        (data as Record<string, unknown>).name === 'values'
    );
}

function isLookupFromValuesRef(from: unknown): boolean {
    if (typeof from !== 'object' || from === null || Array.isArray(from)) {
        return false;
    }
    const data = (from as Record<string, unknown>).data;
    return isValuesDataRef(data);
}

/** Replace `data: { name: "values" }` references so the copied spec is self-contained.
 * - top-level / per-layer `data: { name: "values" }` is removed (the real data is
 *   added back at the root after this walk);
 * - `transform[].from.data` for lookups is replaced with inline `data: { values: series }`. */
function inlineValuesDataRef(obj: unknown, series: InlineValues): unknown {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map((item) => inlineValuesDataRef(item, series));
    }
    const raw = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) {
        const value = raw[key];
        if (key === 'data' && isValuesDataRef(value)) {
            // Drop the named reference; the real `data` array is added at the root.
            continue;
        }
        if (key === 'from' && isLookupFromValuesRef(value)) {
            const fromObj = value as Record<string, unknown>;
            result[key] = { ...fromObj, data: { values: series } };
            continue;
        }
        result[key] = inlineValuesDataRef(value, series);
    }
    return result;
}

/**
 * Resolve the spec currently shown in the custom visualization editor.
 * This mirrors the renderer's rewrite path so copied specs use query field IDs.
 * When `series` is provided, replaces the `data: { name: "values" }` reference
 * with the actual rows, so the copied spec is self-contained for any
 * Vega-Lite viewer.
 */
export function prepareCustomVisSpecForClipboard(
    visSpec: string | undefined,
    editorTab: CustomVisEditorTab,
    itemsMap: ItemsMap | undefined,
    fieldIds: string[],
    series?: InlineValues,
): VegaSpec | undefined {
    if (!visSpec) return undefined;

    try {
        const parsed = JSON.parse(visSpec) as VegaSpec;
        const { desktop, mobile, rewrite } = decomposeCustomVisSpec(parsed);
        const activeSpec = editorTab === 'mobile' ? mobile : desktop;

        if (!activeSpec) return undefined;

        const rewritten = prepareSpecForVega(
            rewrite ? { ...activeSpec, rewrite: true } : activeSpec,
            itemsMap,
            fieldIds,
        );

        if (!rewritten) return undefined;

        if (series && series.length > 0) {
            const inlined = inlineValuesDataRef(rewritten, series) as VegaSpec;
            return { ...inlined, data: { values: series } };
        }

        return rewritten;
    } catch {
        return undefined;
    }
}
