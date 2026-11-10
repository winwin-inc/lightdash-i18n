import { useCallback, useEffect, useRef, useState } from 'react';
import { clampColumnWidth, isValidColumnWidth } from './columnWidth';

const STORAGE_PREFIX = 'ld:table-col-width:v1:';

/**
 * 宽度作用域：
 * - 看板 tile（有 tileUuid）→ 图表 + tile，同一图表在两个看板互不影响
 * - 图表页（无 tileUuid）→ 图表级
 * 图表版本切换（versionUuid 每次都变）不影响 key。
 */
const getStorageKey = (savedChartUuid?: string, tileUuid?: string) => {
    if (!savedChartUuid) return undefined;
    return tileUuid
        ? `${STORAGE_PREFIX}${savedChartUuid}:tile:${tileUuid}`
        : `${STORAGE_PREFIX}${savedChartUuid}`;
};

const readWidths = (storageKey: string): Record<string, number> => {
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};

        return Object.entries(parsed as Record<string, unknown>).reduce<
            Record<string, number>
        >((acc, [fieldId, width]) => {
            if (isValidColumnWidth(width)) {
                acc[fieldId] = Math.round(width);
            }
            return acc;
        }, {});
    } catch {
        // Corrupted JSON / disabled storage: fall back to automatic widths.
        return {};
    }
};

/**
 * Viewer-scoped column widths ("I widened this column, just for me").
 *
 * Saved charts persist widths in `chartConfig.columns[].width` (Explore edit
 * mode). Dashboards, view mode and embeds are read-only, so dragging there
 * would otherwise be impossible; those widths are kept locally instead.
 *
 * Scoped by `savedChartUuid` (+ `tileUuid` inside dashboards) so widening a
 * column in one dashboard tile does not change the same chart elsewhere.
 * Charts without a uuid (AI generated / unsaved) stay in memory.
 */
export const useLocalColumnWidths = (
    savedChartUuid?: string,
    tileUuid?: string,
) => {
    const storageKey = getStorageKey(savedChartUuid, tileUuid);

    const [localColumnWidths, setWidths] = useState<Record<string, number>>(
        () => (storageKey ? readWidths(storageKey) : {}),
    );
    const widthsRef = useRef(localColumnWidths);
    const storageKeyRef = useRef(storageKey);

    // Different chart in the same mounted component (dashboard tile reuse).
    useEffect(() => {
        if (storageKeyRef.current === storageKey) return;
        storageKeyRef.current = storageKey;
        const next = storageKey ? readWidths(storageKey) : {};
        widthsRef.current = next;
        setWidths(next);
    }, [storageKey]);

    const setLocalColumnWidth = useCallback(
        (fieldId: string, width: number | null) => {
            const next = { ...widthsRef.current };
            if (width === null) {
                delete next[fieldId];
            } else {
                next[fieldId] = clampColumnWidth(width);
            }
            widthsRef.current = next;
            setWidths(next);

            const key = storageKeyRef.current;
            if (!key) return;
            try {
                if (Object.keys(next).length === 0) {
                    window.localStorage.removeItem(key);
                } else {
                    window.localStorage.setItem(key, JSON.stringify(next));
                }
            } catch {
                // Quota exceeded / private mode: keep the in-memory value.
            }
        },
        [],
    );

    return { localColumnWidths, setLocalColumnWidth };
};
