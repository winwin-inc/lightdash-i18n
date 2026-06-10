import {
    applyBarMaxWidthToEchartsSpec,
    resolveBarMaxWidth,
} from './barChartWidth';

describe('resolveBarMaxWidth', () => {
    it('returns desktop value on desktop', () => {
        expect(
            resolveBarMaxWidth(
                { barMaxWidth: 40, barMaxWidthMobile: 24 },
                false,
            ),
        ).toBe(40);
    });

    it('returns mobile value on mobile when set', () => {
        expect(
            resolveBarMaxWidth(
                { barMaxWidth: 40, barMaxWidthMobile: 24 },
                true,
            ),
        ).toBe(24);
    });

    it('falls back to desktop value on mobile when mobile is unset', () => {
        expect(resolveBarMaxWidth({ barMaxWidth: 40 }, true)).toBe(40);
    });

    it('returns undefined when no values are configured', () => {
        expect(resolveBarMaxWidth(undefined, false)).toBeUndefined();
    });
});

describe('applyBarMaxWidthToEchartsSpec', () => {
    it('applies barMaxWidth to bar series only', () => {
        const spec = {
            series: [
                { type: 'bar', name: 'A' },
                { type: 'line', name: 'B' },
            ],
        };

        const result = applyBarMaxWidthToEchartsSpec(spec, 32);

        expect((result.series[0] as { barMaxWidth?: number }).barMaxWidth).toBe(
            32,
        );
        expect(
            (result.series[1] as { barMaxWidth?: number }).barMaxWidth,
        ).toBeUndefined();
    });

    it('removes barMaxWidth from bar series when value is undefined', () => {
        const spec = {
            series: [{ type: 'bar', name: 'A', barMaxWidth: 40 }],
        };

        const result = applyBarMaxWidthToEchartsSpec(spec, undefined);

        expect(
            (result.series[0] as { barMaxWidth?: number }).barMaxWidth,
        ).toBeUndefined();
    });
});
