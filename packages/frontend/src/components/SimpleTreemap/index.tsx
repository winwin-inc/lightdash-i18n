import { IconChartTreemap } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useEchartsTreemapConfig from '../../hooks/echarts/useEchartsTreemapConfig';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import LightdashECharts from '../common/LightdashECharts';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const EmptyChart = () => {
    const { t } = useTranslation();

    return (
        <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
            <SuboptimalState
                title={t('components_simple_treemap.empty.title')}
                description={t('components_simple_treemap.empty.description')}
                icon={IconChartTreemap}
            />
        </div>
    );
};

const LoadingChart = () => {
    const { t } = useTranslation();

    return (
        <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
            <SuboptimalState
                title={t('components_simple_treemap.loading.title')}
                loading
                className="loading_chart"
            />
        </div>
    );
};

type SimpleTreemapProps = {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
} & Omit<EChartsReactProps, 'option'>;

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleTreemap: FC<SimpleTreemapProps> = memo((props) => {
    const {
        isInDashboard,
        $shouldExpand,
        className,
        'data-testid': dataTestId,
    } = props;

    const { chartRef, isLoading, resultsData } = useVisualizationContext();

    const treemapOptions = useEchartsTreemapConfig(isInDashboard);

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    if (isLoading) return <LoadingChart />;
    if (!treemapOptions) return <EmptyChart />;

    return (
        <>
            <LightdashECharts
                ref={chartRef}
                data-testid={dataTestId}
                className={className}
                style={
                    $shouldExpand
                        ? {
                              minHeight: 'inherit',
                              height: '100%',
                              width: '100%',
                          }
                        : {
                              minHeight: 'inherit',
                              // height defaults to 300px
                              width: '100%',
                          }
                }
                opts={EchartOptions}
                option={treemapOptions.eChartsOption}
                notMerge
            />
        </>
    );
});

export default SimpleTreemap;
