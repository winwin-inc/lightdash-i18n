import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps } from 'echarts-for-react/lib/types';
import { forwardRef } from 'react';

/**
 * Wrapper around echarts-for-react.
 * Uses autoResize={false} to avoid size-sensor ResizeObserver issues; chart
 * components handle window resize via chartRef.getEchartsInstance().resize().
 */
const LightdashECharts = forwardRef<EChartsReact, EChartsReactProps>(
    (
        {
            autoResize = false,
            replaceMerge = ['xAxis', 'yAxis', 'series', 'dataset', 'grid'],
            ...props
        },
        ref,
    ) => (
        <EChartsReact
            ref={ref}
            autoResize={autoResize}
            replaceMerge={replaceMerge}
            {...props}
        />
    ),
);

LightdashECharts.displayName = 'LightdashECharts';

export default LightdashECharts;
