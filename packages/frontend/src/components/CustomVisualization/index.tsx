import { Anchor, Text } from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';
import { IconChartBarOff } from '@tabler/icons-react';
import { Suspense, lazy, useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type CustomVisualizationConfigAndData } from '../../hooks/useCustomVisualizationConfig';
import { isCustomVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { LoadingChart } from '../SimpleChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const VegaLite = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaLite })),
);

type Props = {
    className?: string;
    'data-testid'?: string;
};

const CustomVisualization: FC<Props> = (props) => {
    const {
        chartRef,
        isLoading,
        visualizationConfig,
        resultsData,
        isDashboard,
    } = useVisualizationContext();
    const { t } = useTranslation();

    const [ref, rect] = useResizeObserver();

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    // All hooks must be called before any early returns
    // Get spec and visProps early, but handle them conditionally
    const spec = isCustomVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.validConfig.spec
        : undefined;
    const visProps = isCustomVisualizationConfig(visualizationConfig)
        ? (visualizationConfig.chartConfig as CustomVisualizationConfigAndData)
        : undefined;

    // Memoize data object to prevent unnecessary VegaLite re-renders
    // Only recreate when series data actually changes
    const data = useMemo(
        () => ({ values: visProps?.series || [] }),
        [visProps?.series],
    );

    // Memoize spec object to prevent unnecessary VegaLite re-renders
    const vegaliteSpec = useMemo(
        () => {
            if (!spec) return undefined;
            return {
                ...spec,
                // @ts-ignore, see comment below
                width: 'container',
                // @ts-ignore, see comment below
                height: 'container',
                data: { name: 'values' },
            };
        },
        [spec],
    );

    // Now we can do early returns after all hooks are called
    if (!isCustomVisualizationConfig(visualizationConfig)) return null;

    // Show loading state only when actually loading and no data available yet
    // This allows rendering as soon as first page of data is loaded
    if (isLoading && (!resultsData || resultsData.rows.length === 0)) {
        return <LoadingChart />;
    }

    if (
        !visualizationConfig ||
        !isCustomVisualizationConfig(visualizationConfig) ||
        !spec
    ) {
        return (
            <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
                <SuboptimalState
                    title={t(
                        'components_custom_visualization.no_visualization_loaded',
                    )}
                    description={
                        <Text>
                            {t(
                                'components_custom_visualization.tooltip.part_1',
                            )}{' '}
                            <Anchor
                                href="https://vega.github.io/vega-lite/examples/"
                                target="_blank"
                            >
                                {t(
                                    'components_custom_visualization.tooltip.part_2',
                                )}
                            </Anchor>{' '}
                            {t(
                                'components_custom_visualization.tooltip.part_3',
                            )}
                        </Text>
                    }
                    icon={IconChartBarOff}
                />
            </div>
        );
    }

    // Show empty state if there's no data
    if (!visProps?.series || visProps.series.length === 0) {
        return (
            <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
                <SuboptimalState
                    title={t('components_dashboard_tiles_sql_chart.no_data_available')}
                    description={t('components_dashboard_tiles_sql_chart.no_data')}
                    icon={IconChartBarOff}
                />
            </div>
        );
    }

    // At this point, we know spec exists (checked above), so vegaliteSpec should exist
    if (!vegaliteSpec) {
        return <LoadingChart />;
    }

    return (
        <div
            data-testid={props['data-testid']}
            className={props.className}
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
            }}
            ref={ref}
        >
            <Suspense fallback={<LoadingChart />}>
                <VegaLite
                    ref={chartRef}
                    style={{
                        width: rect.width,
                        height: rect.height,
                    }}
                    config={{
                        autosize: {
                            type: 'fit',
                            ...(isDashboard && { resize: true }),
                        },
                    }}
                    // TODO: We are ignoring some typescript errors here because the type
                    // that vegalite expects doesn't include a few of the properties
                    // that are required to make data and layout properties work. This
                    // might be a mismatch in which of the vega spec union types gets
                    // picked, or a bug in the vegalite typescript definitions.
                    // @ts-ignore
                    spec={vegaliteSpec}
                    data={data}
                    actions={false}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
