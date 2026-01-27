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
    // 先计算这些值，但不在条件返回之前使用它们
    const isValidCustomVis = isCustomVisualizationConfig(visualizationConfig);
    const spec = isValidCustomVis ? visualizationConfig.chartConfig.validConfig.spec : null;
    const visProps = isValidCustomVis
        ? (visualizationConfig.chartConfig as CustomVisualizationConfigAndData)
        : null;

    // 修复：使用 useMemo 确保 data 对象引用稳定，同时确保数据更新时能触发重新渲染
    // 生产环境中数据会分页加载（rows 逐步增加），需要确保每次 series 更新时都能触发 Vega-Lite 重新渲染
    const data = useMemo(() => {
        if (!visProps?.series) return { values: [] };
        return { values: visProps.series };
    }, [visProps?.series]);
    
    // 修复：使用数据长度和 rows 的引用作为 key，确保分页加载时数据更新能强制重新渲染
    // 生产环境关键差异：数据分页加载时，resultsData.rows 会逐步增加（如 100 -> 200 -> 600）
    // 需要确保每次 rows 更新导致 series 变化时，key 也会变化，从而触发 Vega-Lite 重新渲染
    const dataKey = useMemo(() => {
        const length = visProps?.series?.length ?? 0;
        // 使用 resultsData.rows 的引用和长度来生成 key，确保分页加载时能检测到变化
        const rowsLength = resultsData?.rows?.length ?? 0;
        // 组合 series 长度和 rows 长度，确保分页加载时 key 会变化
        return `vega-${length}-${rowsLength}`;
    }, [visProps?.series?.length, resultsData?.rows?.length]);

    // 修复：只在 rect 有有效尺寸时才传递 style，避免 rect.width/height 为 0 时导致图表无法渲染
    // 当 rect 尺寸为 0 时，不传 style，让 Vega-Lite 使用 container 自动计算
    const chartStyle = useMemo(() => {
        if (rect.width > 0 && rect.height > 0) {
            return {
                width: rect.width,
                height: rect.height,
            };
        }
        return undefined;
    }, [rect.width, rect.height]);

    // 现在可以安全地进行条件返回
    if (!isValidCustomVis) return null;

    // 修复：当 isLoading 为 true，或者数据未准备好时（spec/visProps 为空，或 series 为空且 resultsData 存在），显示加载状态
    // 这样可以避免在数据分页加载过程中，isLoading 为 false 但数据还未准备好时显示错误状态
    const hasData = visProps?.series && visProps.series.length > 0;
    const shouldShowLoading = isLoading || (!spec || !visProps || (!hasData && resultsData));

    if (shouldShowLoading) {
        return <LoadingChart />;
    }

    if (!spec || !visProps) {
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
                    key={`vega-${dataKey}`}
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
                    spec={{
                        ...spec,
                        // @ts-ignore, see above
                        width: 'container',
                        // @ts-ignore, see above
                        height: 'container',
                        data: { name: 'values' },
                    }}
                    data={data}
                    actions={false}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
