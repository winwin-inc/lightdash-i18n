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

    // 修复：将所有 hooks 移到条件返回之前，确保 hooks 数量一致
    // 检查是否为自定义可视化配置
    const isValidCustomVis = isCustomVisualizationConfig(visualizationConfig);
    const baseSpec = isValidCustomVis
        ? visualizationConfig.chartConfig.validConfig.spec
        : null;

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    const visProps = isValidCustomVis
        ? (visualizationConfig.chartConfig as CustomVisualizationConfigAndData)
        : null;

    // 优化：使用 useMemo 缓存 data 对象，避免每次渲染都创建新对象
    // 修复：直接在 useMemo 内部使用 visProps?.series，避免闭包问题
    // 使用数据长度和引用作为依赖，确保数据更新时能触发重新渲染
    const rowsLength = resultsData?.rows?.length ?? 0;
    const seriesRef = visProps?.series || null;
    const data = useMemo(
        () => ({ values: visProps?.series ?? [] }),
        // 使用稳定的引用和长度作为依赖，确保数据更新时能触发
        [seriesRef, rowsLength],
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

    // 如果数据还在转换中（有 rows 但 series 为空），继续显示 Loading
    // 修复：使用更稳定的依赖，避免 undefined 导致的依赖数组不一致
    const seriesLength = visProps?.series?.length ?? 0;
    const hasRows = (resultsData?.rows?.length ?? 0) > 0;
    const isDataConverting = useMemo(() => {
        return hasRows && seriesLength === 0;
    }, [hasRows, seriesLength]);

    // 修复：只在 rect 有有效尺寸时才使用，否则让 Vega-Lite 自动计算
    // 这样可以避免 rect.width/height 为 0 时导致图表无法渲染的问题
    const chartStyle = useMemo(() => {
        // 如果 rect 有有效尺寸，使用 rect 的尺寸
        // 否则不传 style，让 Vega-Lite 使用 container 自动计算
        if (rect.width > 0 && rect.height > 0) {
            return {
                width: rect.width,
                height: rect.height,
            };
        }
        // 返回 undefined，让 Vega-Lite 自动计算尺寸
        return undefined;
    }, [rect.width, rect.height]);

    // 现在可以安全地进行条件返回，因为所有 hooks 都已经执行
    if (!isValidCustomVis) return null;

    if (isInitialLoading || isDataConverting) {
        return <LoadingChart />;
    }

    if (
        !baseSpec ||
        !visProps?.series ||
        visProps.series.length === 0
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
                    key={`vega-${rowsLength}-${seriesLength}`}
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
