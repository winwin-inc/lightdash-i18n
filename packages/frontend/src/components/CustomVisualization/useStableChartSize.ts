import { useEffect, useRef, useState } from 'react';

/** Ignore transient sub-threshold sizes once a good size exists (click/webview jitter). */
export const MIN_STABLE_CHART_SIZE_PX = 80;

/** Skip updates smaller than this to reduce resize chatter. */
export const CHART_SIZE_CHANGE_EPSILON_PX = 8;

/** Debounce container size updates so click/filter bursts settle first. */
export const CHART_SIZE_DEBOUNCE_MS = 120;

export type ChartSize = {
    width: number;
    height: number;
};

export function isAboveMinStableChartSize(size: ChartSize): boolean {
    return (
        size.width >= MIN_STABLE_CHART_SIZE_PX &&
        size.height >= MIN_STABLE_CHART_SIZE_PX
    );
}

/**
 * Decide whether an observed size should replace the last accepted size.
 * - First paint: accept any positive size (tile may start small).
 * - Later: reject sub-min jitter and sub-epsilon noise.
 */
export function shouldAcceptChartSize(
    next: ChartSize,
    lastGood: ChartSize | null,
): boolean {
    if (next.width <= 0 || next.height <= 0) {
        return false;
    }

    if (lastGood === null) {
        return true;
    }

    if (!isAboveMinStableChartSize(next)) {
        return false;
    }

    const widthDelta = Math.abs(next.width - lastGood.width);
    const heightDelta = Math.abs(next.height - lastGood.height);
    if (
        widthDelta < CHART_SIZE_CHANGE_EPSILON_PX &&
        heightDelta < CHART_SIZE_CHANGE_EPSILON_PX
    ) {
        return false;
    }

    return true;
}

/**
 * Stabilize ResizeObserver / early-measure sizes for Custom Viz.
 * Keeps last good dimensions across transient shrinks (e.g. click in webview).
 */
export function useStableChartSize(observed: ChartSize): ChartSize {
    const { width: observedWidth, height: observedHeight } = observed;
    const [stableSize, setStableSize] = useState<ChartSize>({
        width: 0,
        height: 0,
    });
    const lastGoodRef = useRef<ChartSize | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceTimerRef.current !== null) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        if (observedWidth <= 0 || observedHeight <= 0) {
            return undefined;
        }

        // First paint: apply immediately so the chart can mount without waiting.
        if (lastGoodRef.current === null) {
            if (
                shouldAcceptChartSize(
                    { width: observedWidth, height: observedHeight },
                    null,
                )
            ) {
                lastGoodRef.current = {
                    width: observedWidth,
                    height: observedHeight,
                };
                setStableSize({
                    width: observedWidth,
                    height: observedHeight,
                });
            }
            return undefined;
        }

        debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;
            const next = { width: observedWidth, height: observedHeight };
            if (!shouldAcceptChartSize(next, lastGoodRef.current)) {
                return;
            }
            lastGoodRef.current = next;
            setStableSize(next);
        }, CHART_SIZE_DEBOUNCE_MS);

        return () => {
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
        };
    }, [observedWidth, observedHeight]);

    return stableSize;
}
