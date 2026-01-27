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

    // 修复：所有 hooks 必须在条件返回之前调用，确保 hooks 调用顺序一致
    const isValidCustomVis = isCustomVisualizationConfig(visualizationConfig);
    const spec = isValidCustomVis ? visualizationConfig.chartConfig.validConfig.spec : null;
    const visProps = isValidCustomVis
        ? (visualizationConfig.chartConfig as CustomVisualizationConfigAndData)
        : null;

    // 性能优化：使用 useMemo 缓存 data 对象，避免每次渲染都创建新对象
    // 线上版本问题：const data = { values: visProps.series }; 每次渲染都创建新对象
    // 导致 VegaLite 认为 props 变化了，从而频繁重新渲染
    const data = useMemo(() => {
        if (!visProps?.series) return { values: [] };
        return { values: visProps.series };
    }, [visProps?.series]);

    // 性能优化：使用 useMemo 缓存 spec 对象，避免每次渲染都重新创建
    // 线上版本问题：spec={{ ...spec, ... }} 每次渲染都创建新对象
    const optimizedSpec = useMemo(() => {
        if (!spec) return null;
        return {
            ...spec,
            width: 'container',
            height: 'container',
            data: { name: 'values' },
        };
    }, [spec]);

    // 性能优化：使用 useMemo 缓存 style 对象，避免每次渲染都重新创建
    // 线上版本问题：style={{ width: rect.width, height: rect.height }} 每次渲染都创建新对象
    // 修复：只在 rect 有有效尺寸时才传递 style，避免 rect.width/height 为 0 时导致图表无法渲染
    const chartStyle = useMemo(() => {
        if (rect.width > 0 && rect.height > 0) {
            return {
                width: rect.width,
                height: rect.height,
            };
        }
        return undefined;
    }, [rect.width, rect.height]);

    // 修复：当 isLoading 为 true，或者数据未准备好时，显示加载状态
    const hasData = visProps?.series && visProps.series.length > 0;
    const isStillLoading = resultsData?.isFetchingRows || resultsData?.isInitialLoading;
    const shouldShowLoading = isLoading || (!spec || !visProps || (!hasData && resultsData && isStillLoading));

    if (!isValidCustomVis) return null;

    if (shouldShowLoading) {
        return <LoadingChart />;
    }

    if (
        !visualizationConfig ||
        !isCustomVisualizationConfig(visualizationConfig) ||
        !spec ||
        !visProps
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
                    {...(chartStyle && { style: chartStyle })}
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
                    spec={optimizedSpec}
                    data={data}
                    actions={false}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
