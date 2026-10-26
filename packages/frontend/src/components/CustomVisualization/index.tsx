import { Anchor, Center, Loader, Text } from '@mantine/core';
import { IconChartBarOff } from '@tabler/icons-react';
import { Suspense, lazy, useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type CustomVisualizationConfigAndData } from '../../hooks/useCustomVisualizationConfig';
import { isCustomVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import {
    getVegaAutosizeConfig,
    normalizeVegaSpecSizing,
} from './normalizeVegaSpecSizing';
import {
    DEFAULT_RESPONSIVE_BREAKPOINT,
    computeResponsiveLayout,
    extractLightdashConfig,
    resolveActiveSpec,
    useViewportWidth,
    type ResponsivePreviewOverride,
} from './responsive';
import { prepareSpecForVega } from './rewriteVegaSpecFieldLabels';
import VisibleColorKeysRegistrar from './VisibleColorKeysRegistrar';
import { applyDashboardColorSync } from './vegaColorSync';
import {
    buildFormattedValueMap,
    createVegaColorResolver,
} from './vegaColorResolver';
import { useObservedContainerSize } from './useObservedContainerSize';
import {
    CHART_SIZE_CHANGE_EPSILON_PX,
    useStableChartSize,
} from './useStableChartSize';

const VegaLite = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaLite })),
);

/**
 * No vertical padding — LoadingChart's padding:50px is clipped to blank white
 * inside short/medium dashboard ChartContainers (overflow:hidden).
 */
const CompactChartLoading: FC = () => (
    <Center h="100%" w="100%" className="loading_chart">
        <Loader color="gray.6" size="sm" />
    </Center>
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
        itemsMap,
        colorSync,
    } = useVisualizationContext();
    const { t } = useTranslation();
    const viewportWidth = useViewportWidth();

    /** raw 值 → 展示值，用于颜色键兜底匹配（饼图等用的是展示值） */
    const formattedValueMap = useMemo(
        () => buildFormattedValueMap(resultsData?.rows),
        [resultsData],
    );

    // Own ResizeObserver in the callback ref so observe runs on mount
    // (Mantine useResizeObserver + manual ref.current never re-ran its effect).
    const { measureRef, size: observedSize } = useObservedContainerSize();
    const { width, height } = useStableChartSize(observedSize);
    const hasSize = width > 0 && height > 0;

    // Skip continuous Vega resize on all viewports. fit+resize shrinks layer
    // overlays (Boston Matrix) until the X axis collapses; window / tile
    // size changes remount via ResizeObserver + sizeKey instead.
    const isNarrowViewport = viewportWidth < DEFAULT_RESPONSIVE_BREAKPOINT;
    const useExplicitPixelSize = isNarrowViewport;

    useEffect(() => {
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    const isCustomViz = isCustomVisualizationConfig(visualizationConfig);

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    //
    // chartConfig 来自 useCustomVisualizationConfig（内部 useMemo）：
    // spec / series / fields 不变时引用稳定，因此可以直接作为 memo 依赖。
    const customChartConfig: CustomVisualizationConfigAndData | undefined =
        isCustomViz ? visualizationConfig.chartConfig : undefined;
    const spec = customChartConfig?.validConfig.spec;

    /**
     * spec 派生管线（响应式视图 → 尺寸归一化 → autosize）整体缓存。
     *
     * 之前这些派生值每次渲染都会重建（新对象引用），导致下面的
     * 颜色同步缓存永远无法命中；现在统一在 memo 里算，引用稳定。
     */
    const specPipeline = useMemo(() => {
        if (!customChartConfig || !spec) return null;

        const visProps = customChartConfig;
        const fieldIds =
            visProps.fields ??
            (visProps.series?.[0] ? Object.keys(visProps.series[0]) : []);
        const rawSpec = spec as Record<string, unknown>;
        const needsRewrite = rawSpec.rewrite === true;
        const canRewrite = needsRewrite && fieldIds.length > 0;
        // rewrite 模式下字段还没就绪，先不计算（渲染期会显示 loading）
        if (needsRewrite && !canRewrite) return null;

        const { desktopSpec, responsiveConfig } =
            extractLightdashConfig(rawSpec);

        const previewOverride: ResponsivePreviewOverride | undefined =
            !isDashboard ? visProps.editorResponsiveTab : undefined;

        const { spec: activeSpecRaw, variant: layoutVariant } =
            resolveActiveSpec(
                desktopSpec,
                responsiveConfig,
                viewportWidth,
                previewOverride,
            );
        const specForVega =
            prepareSpecForVega(
                needsRewrite ? { ...activeSpecRaw, rewrite: true } : activeSpecRaw,
                itemsMap,
                fieldIds,
            ) ?? activeSpecRaw;

        const layout = computeResponsiveLayout(
            layoutVariant,
            activeSpecRaw,
            width,
            height,
            visProps.series,
            { preferFitInTile: useExplicitPixelSize },
        );
        const sizedSpec = normalizeVegaSpecSizing(
            specForVega as Record<string, unknown>,
            layout.chartSize,
            visProps.series,
            layout,
            { useExplicitPixelSize },
        );
        const autosizeConfig = getVegaAutosizeConfig(
            specForVega as Record<string, unknown>,
            isDashboard,
            layout,
            { continuousResize: false, useExplicitPixelSize },
        );

        return { layout, sizedSpec, autosizeConfig };
    }, [
        customChartConfig,
        spec,
        itemsMap,
        isDashboard,
        viewportWidth,
        width,
        height,
        useExplicitPixelSize,
    ]);

    /**
     * 看板开启「同步图表颜色」时：按系列名把看板色表注入 spec 的 color scale，
     * 使自定义图表与笛卡尔/饼图同名系列同色（跨图稳定）。
     *
     * 这一步是全量 O(rows) 扫描 + 复制 spec，所以必须缓存。
     * 依赖的引用稳定性：
     * - sizedSpec / series：来自上面的 specPipeline memo，稳定；
     * - palette / hashAssignments / knownHashAssignments：来自
     *   DashboardChartColorSyncProvider 的 useMemo/useCallback，稳定；
     * - formattedValueMap：resultsData 变化时才重建。
     * 任何一个变化都会重新计算（并重新注册可见系列名）。
     */
    const colorSyncResult = useMemo(() => {
        if (!specPipeline || !colorSync.enabled) {
            return { spec: null, visibleKeys: [] as string[] };
        }
        return applyDashboardColorSync({
            spec: specPipeline.sizedSpec,
            series: customChartConfig?.series ?? [],
            resolveColor: createVegaColorResolver({
                palette: colorSync.palette,
                hashAssignments: colorSync.hashAssignments,
                knownHashAssignments: colorSync.knownHashAssignments,
                formattedValueMap,
            }),
        });
    }, [
        specPipeline,
        colorSync.enabled,
        colorSync.palette,
        colorSync.hashAssignments,
        colorSync.knownHashAssignments,
        customChartConfig,
        formattedValueMap,
    ]);

    if (!customChartConfig) return null;

    // Keep measure shell during loading so size is warm when data arrives
    // (avoids first-tile X collapse from mounting Vega on an unmeasured container).
    if (isLoading) {
        return (
            <div
                data-testid={props['data-testid']}
                className={props.className}
                style={{
                    minHeight: 'inherit',
                    height: '100%',
                    width: '100%',
                }}
                ref={measureRef}
            >
                <CompactChartLoading />
            </div>
        );
    }

    if (!spec) {
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

    const data = { values: customChartConfig.series };

    if (!specPipeline) {
        // rewrite 模式：字段还没就绪，无法重写 spec
        return (
            <div
                data-testid={props['data-testid']}
                className={props.className}
                style={{
                    minHeight: 'inherit',
                    height: '100%',
                    width: '100%',
                }}
                ref={measureRef}
            >
                <CompactChartLoading />
            </div>
        );
    }

    const { layout, sizedSpec, autosizeConfig } = specPipeline;
    const finalSpec = colorSyncResult.spec ?? sizedSpec;

    // Remount when stabilized size changes meaningfully (narrow path has no resize)
    const sizeKeyWidth = layout.useStepWidth
        ? 'step'
        : Math.round(width / CHART_SIZE_CHANGE_EPSILON_PX);
    const sizeKeyHeight = layout.useStepHeight
        ? 'step'
        : Math.round(
              (layout.chartSize.height || height) /
                  CHART_SIZE_CHANGE_EPSILON_PX,
          );

    return (
        <div
            data-testid={props['data-testid']}
            className={props.className}
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
                ...layout.containerStyle,
            }}
            ref={measureRef}
        >
            <VisibleColorKeysRegistrar
                enabled={colorSync.enabled}
                keys={colorSyncResult.visibleKeys}
                registerVisibleColorKeys={colorSync.registerVisibleColorKeys}
            />
            {hasSize ? (
                <Suspense fallback={<CompactChartLoading />}>
                    <VegaLite
                        key={`vega-${layout.layoutId}-${
                            customChartConfig.editorResponsiveTab
                        }-${customChartConfig.series?.length ?? 0}-${
                            resultsData?.hasFetchedAllRows ?? false
                        }-${sizeKeyWidth}-${sizeKeyHeight}`}
                        ref={chartRef}
                        style={layout.vegaStyle}
                        config={{
                            autosize: autosizeConfig,
                        }}
                        // TODO: We are ignoring some typescript errors here because the type
                        // that vegalite expects doesn't include a few of the properties
                        // that are required to make data and layout properties work. This
                        // might be a mismatch in which of the vega spec union types gets
                        // picked, or a bug in the vegalite typescript definitions.
                        // @ts-ignore
                        spec={{
                            ...finalSpec,
                            data: { name: 'values' },
                        }}
                        data={data}
                        actions={false}
                    />
                </Suspense>
            ) : (
                <CompactChartLoading />
            )}
        </div>
    );
};

export default CustomVisualization;
