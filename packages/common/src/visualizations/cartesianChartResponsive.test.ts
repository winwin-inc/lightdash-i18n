import {
    applyMobileSeriesLabelAdjustments,
    applySeriesLabelLayoutForViewport,
    computeMobileBarLabelPlan,
    getSeriesLabelLayout,
} from './cartesianChartResponsive';

describe('getSeriesLabelLayout', () => {
    it('hides overlapping labels on desktop', () => {
        expect(getSeriesLabelLayout(false)).toEqual({ hideOverlap: true });
    });

    it('shifts labels horizontally on mobile before hiding overlaps', () => {
        expect(getSeriesLabelLayout(true)).toEqual({
            hideOverlap: true,
            moveOverlap: 'shiftX',
        });
    });
});

describe('computeMobileBarLabelPlan', () => {
    it('does not stagger when only one visible bar series has labels', () => {
        expect(
            computeMobileBarLabelPlan({
                series: [
                    {
                        type: 'bar',
                        labelShows: true,
                        legendVisible: true,
                        valuesByCategory: [100, 200],
                        yAxisIndex: 0,
                    },
                ],
            }),
        ).toEqual({
            staggerByCategoryIndex: [],
            applyBarGapTuning: false,
        });
    });

    it('does not stagger when one legend item is hidden', () => {
        expect(
            computeMobileBarLabelPlan({
                series: [
                    {
                        type: 'bar',
                        labelShows: true,
                        legendVisible: true,
                        valuesByCategory: [10, 20],
                        yAxisIndex: 0,
                    },
                    {
                        type: 'bar',
                        labelShows: true,
                        legendVisible: false,
                        valuesByCategory: [11, 21],
                        yAxisIndex: 1,
                    },
                ],
            }),
        ).toEqual({
            staggerByCategoryIndex: [],
            applyBarGapTuning: false,
        });
    });

    it('staggers only categories with similar normalized heights', () => {
        const plan = computeMobileBarLabelPlan({
            series: [
                {
                    type: 'bar',
                    labelShows: true,
                    legendVisible: true,
                    valuesByCategory: [23, 488, 851, 29],
                    yAxisIndex: 0,
                },
                {
                    type: 'bar',
                    labelShows: true,
                    legendVisible: true,
                    valuesByCategory: [4606, 154077, 62557, 11525],
                    yAxisIndex: 1,
                },
            ],
        });

        expect(plan.staggerByCategoryIndex).toEqual([true, false, false, true]);
        expect(plan.applyBarGapTuning).toBe(true);
    });
});

describe('applyMobileSeriesLabelAdjustments', () => {
    const dualAxisPlan = {
        staggerByCategoryIndex: [true, false, false, true],
        applyBarGapTuning: true,
    };

    it('applies per-category stagger via labelLayout for the right axis', () => {
        const rightAxis = applyMobileSeriesLabelAdjustments(
            {
                type: 'bar',
                yAxisIndex: 1,
                label: { show: true },
            },
            dualAxisPlan,
        );

        expect(rightAxis.label?.distance).toBe(6);
        expect(typeof rightAxis.labelLayout).toBe('function');

        const staggeredLayout = (
            rightAxis.labelLayout as (params: { dataIndex: number }) => {
                dy?: number;
            }
        )({ dataIndex: 0 });
        const normalLayout = (
            rightAxis.labelLayout as (params: { dataIndex: number }) => {
                dy?: number;
            }
        )({ dataIndex: 1 });

        expect(staggeredLayout.dy).toBe(-12);
        expect(normalLayout.dy).toBeUndefined();
        expect(rightAxis.barCategoryGap).toBe('32%');
    });

    it('does not stagger the left axis labels', () => {
        const leftAxis = applyMobileSeriesLabelAdjustments(
            {
                type: 'bar',
                yAxisIndex: 0,
                label: { show: true },
            },
            dualAxisPlan,
        );

        const layout = (
            leftAxis.labelLayout as (params: { dataIndex: number }) => {
                dy?: number;
            }
        )({ dataIndex: 0 });

        expect(layout.dy).toBeUndefined();
        expect(leftAxis.barCategoryGap).toBe('32%');
    });

    it('uses uniform distance when no categories need stagger', () => {
        const plan = {
            staggerByCategoryIndex: [false, false],
            applyBarGapTuning: false,
        };
        const rightAxis = applyMobileSeriesLabelAdjustments(
            {
                type: 'bar',
                yAxisIndex: 1,
                label: { show: true },
            },
            plan,
        );

        const layout = (
            rightAxis.labelLayout as (params: { dataIndex: number }) => {
                dy?: number;
            }
        )({ dataIndex: 0 });

        expect(rightAxis.label?.distance).toBe(6);
        expect(layout.dy).toBeUndefined();
        expect(rightAxis.barCategoryGap).toBeUndefined();
    });
});

describe('applySeriesLabelLayoutForViewport', () => {
    it('applies mobile label layout to visible series labels', () => {
        const spec = {
            series: [
                { type: 'bar', yAxisIndex: 0, label: { show: true } },
                { type: 'line', label: { show: false } },
            ],
            grid: { top: '70px' },
        };

        const result = applySeriesLabelLayoutForViewport(spec, true);

        expect(
            typeof (result.series[0] as { labelLayout?: unknown }).labelLayout,
        ).toBe('function');
        expect((result.grid as { top?: string }).top).toBe('85px');
    });
});
