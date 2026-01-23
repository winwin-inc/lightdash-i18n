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

    // 优化：只在首次加载时显示 Loading，有数据后立即渲染
    // 这样即使数据还在分页加载，也能先渲染已有数据，避免白屏
    const isInitialLoading = useMemo(() => {
        // 如果没有数据且正在加载，显示 Loading
        if (!resultsData?.rows || resultsData.rows.length === 0) {
            return isLoading;
        }
        // 如果有数据了，即使还在加载更多数据，也先渲染已有数据
        return false;
    }, [isLoading, resultsData?.rows]);

    // 优化：使用 useMemo 缓存 config 对象，避免频繁重新创建
    const config = useMemo(
        () => ({
            autosize: {
                type: 'fit' as const,
                ...(isDashboard && { resize: true }),
            },
        }),
        [isDashboard],
    );

    // 优化：使用 useMemo 缓存 style 对象，只有当尺寸变化时才重新创建
    const chartStyle = useMemo(
        () => ({
            width: rect.width,
            height: rect.height,
        }),
        [rect.width, rect.height],
    );

    // 获取 baseSpec，如果不存在则返回 null
    const baseSpec = useMemo(() => {
        if (
            !visualizationConfig ||
            !isCustomVisualizationConfig(visualizationConfig)
        ) {
            return null;
        }
        return visualizationConfig.chartConfig.validConfig.spec;
    }, [visualizationConfig]);

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    const visProps = useMemo(() => {
        if (
            !visualizationConfig ||
            !isCustomVisualizationConfig(visualizationConfig)
        ) {
            return null;
        }
        return visualizationConfig.chartConfig as CustomVisualizationConfigAndData;
    }, [visualizationConfig]);

    // 优化：使用 useMemo 缓存 data 对象，避免每次渲染都创建新对象
    const data = useMemo(
        () => (visProps ? { values: visProps.series } : { values: [] }),
        [visProps],
    );

    // 优化：使用 useMemo 缓存 spec 对象，只有当 baseSpec 变化时才重新创建
    const spec = useMemo(
        () => {
            if (!baseSpec) return null;
            return {
                ...baseSpec,
                // @ts-ignore, see comment below
                width: 'container',
                // @ts-ignore, see comment below
                height: 'container',
                data: { name: 'values' },
            };
        },
        [baseSpec],
    );

    if (!isCustomVisualizationConfig(visualizationConfig)) return null;

    if (isInitialLoading) {
        return <LoadingChart />;
    }

    if (
        !visualizationConfig ||
        !isCustomVisualizationConfig(visualizationConfig) ||
        !baseSpec ||
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
                    style={chartStyle}
                    config={config}
                    // TODO: We are ignoring some typescript errors here because the type
                    // that vegalite expects doesn't include a few of the properties
                    // that are required to make data and layout properties work. This
                    // might be a mismatch in which of the vega spec union types gets
                    // picked, or a bug in the vegalite typescript definitions.
                    // @ts-ignore
                    spec={spec}
                    data={data}
                    actions={false}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
