import { describe, expect, it } from 'vitest';
import {
    CHART_SIZE_CHANGE_EPSILON_PX,
    MIN_STABLE_CHART_SIZE_PX,
    shouldAcceptChartSize,
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

    it('accepts first paint above or below min when no last good size', () => {
        expect(
            shouldAcceptChartSize(
                { width: MIN_STABLE_CHART_SIZE_PX, height: 200 },
                null,
            ),
        ).toBe(true);
        expect(shouldAcceptChartSize({ width: 40, height: 40 }, null)).toBe(
            true,
        );
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
