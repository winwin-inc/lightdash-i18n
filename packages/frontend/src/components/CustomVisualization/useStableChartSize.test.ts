import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CHART_SIZE_CHANGE_EPSILON_PX,
    CHART_SIZE_DEBOUNCE_MS,
    MIN_STABLE_CHART_SIZE_PX,
    shouldAcceptChartSize,
    useStableChartSize,
} from './useStableChartSize';

describe('shouldAcceptChartSize', () => {
    it('rejects empty sizes', () => {
        expect(shouldAcceptChartSize({ width: 0, height: 100 }, null)).toBe(
            false,
        );
        expect(shouldAcceptChartSize({ width: 100, height: 0 }, null)).toBe(
            false,
        );
    });

    it('rejects candidates below min stable size', () => {
        expect(shouldAcceptChartSize({ width: 40, height: 40 }, null)).toBe(
            false,
        );
        expect(
            shouldAcceptChartSize(
                { width: MIN_STABLE_CHART_SIZE_PX - 1, height: 200 },
                null,
            ),
        ).toBe(false);
    });

    it('marks first candidate at or above min as acceptable (hook still debounces mount)', () => {
        expect(
            shouldAcceptChartSize(
                { width: MIN_STABLE_CHART_SIZE_PX, height: 200 },
                null,
            ),
        ).toBe(true);
        expect(
            shouldAcceptChartSize(
                { width: 360, height: MIN_STABLE_CHART_SIZE_PX },
                null,
            ),
        ).toBe(true);
    });

    it('rejects tiny jitter when a good size already exists', () => {
        const lastGood = { width: 360, height: 280 };
        expect(
            shouldAcceptChartSize({ width: 20, height: 280 }, lastGood),
        ).toBe(false);
        expect(
            shouldAcceptChartSize({ width: 360, height: 10 }, lastGood),
        ).toBe(false);
    });

    it('rejects sub-epsilon changes', () => {
        const lastGood = { width: 360, height: 280 };
        expect(
            shouldAcceptChartSize(
                {
                    width: 360 + CHART_SIZE_CHANGE_EPSILON_PX - 1,
                    height: 280,
                },
                lastGood,
            ),
        ).toBe(false);
    });

    it('accepts meaningful size changes', () => {
        const lastGood = { width: 360, height: 280 };
        expect(
            shouldAcceptChartSize(
                {
                    width: 360 + CHART_SIZE_CHANGE_EPSILON_PX,
                    height: 280,
                },
                lastGood,
            ),
        ).toBe(true);
        expect(
            shouldAcceptChartSize({ width: 400, height: 320 }, lastGood),
        ).toBe(true);
    });
});

describe('useStableChartSize', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not commit first paint until debounce settles', () => {
        const { result } = renderHook(() =>
            useStableChartSize({ width: 360, height: 280 }),
        );

        expect(result.current).toEqual({ width: 0, height: 0 });

        act(() => {
            vi.advanceTimersByTime(CHART_SIZE_DEBOUNCE_MS - 1);
        });
        expect(result.current).toEqual({ width: 0, height: 0 });

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toEqual({ width: 360, height: 280 });
    });

    it('resets settle timer when size changes before debounce fires', () => {
        const { result, rerender } = renderHook(
            ({ size }) => useStableChartSize(size),
            {
                initialProps: {
                    size: { width: 120, height: 200 },
                },
            },
        );

        act(() => {
            vi.advanceTimersByTime(CHART_SIZE_DEBOUNCE_MS - 20);
        });
        expect(result.current).toEqual({ width: 0, height: 0 });

        rerender({ size: { width: 360, height: 280 } });

        act(() => {
            vi.advanceTimersByTime(CHART_SIZE_DEBOUNCE_MS - 1);
        });
        expect(result.current).toEqual({ width: 0, height: 0 });

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toEqual({ width: 360, height: 280 });
    });

    it('ignores sub-min first candidates without committing', () => {
        const { result } = renderHook(() =>
            useStableChartSize({
                width: MIN_STABLE_CHART_SIZE_PX - 1,
                height: 200,
            }),
        );

        act(() => {
            vi.advanceTimersByTime(CHART_SIZE_DEBOUNCE_MS * 2);
        });
        expect(result.current).toEqual({ width: 0, height: 0 });
    });
});
