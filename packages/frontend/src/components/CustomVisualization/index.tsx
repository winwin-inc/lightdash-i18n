import { Anchor, Center, Loader, Text } from '@mantine/core';
import { IconChartBarOff } from '@tabler/icons-react';
import { Suspense, lazy, useEffect, useMemo, useRef, type FC } from 'react';
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

/**
 * 把当前图可见系列名注册到看板色表。
 * 可见系列名要等 spec 处理完才知道，这里用 ref 承接，effect 里按内容去重后再注册。
 * palette 变化时看板色表会重置，需要重新注册一次。
 */
const useVisibleColorKeysRegistration = (
    enabled: boolean,
    registerVisibleColorKeys: (keys: string[]) => void,
    paletteKey: string,
) => {
    const keysRef = useRef<string[]>([]);
    const registeredKeyRef = useRef('');

    useEffect(() => {
        if (!enabled) return;
        const keys = keysRef.current;
        if (keys.length === 0) return;
        const key = `${paletteKey}\u0000${keys.join('\u0001')}`;
        if (key === registeredKeyRef.current) return;
        registeredKeyRef.current = key;
        registerVisibleColorKeys(keys);
    });

    return (keys: string[]) => {
        keysRef.current = keys;
    };
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

    const setVisibleColorKeys = useVisibleColorKeysRegistration(
        colorSync.enabled,
        colorSync.registerVisibleColorKeys,
        colorSync.palette.join(','),
    );

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

    if (!isCustomVisualizationConfig(visualizationConfig)) return null;
    const spec = visualizationConfig.chartConfig.validConfig.spec;

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

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    const visProps =
        visualizationConfig.chartConfig as CustomVisualizationConfigAndData;

    const fieldIds =
        visProps.fields ??
        (visProps.series?.[0] ? Object.keys(visProps.series[0]) : []);
    const rawSpec = spec as Record<string, unknown>;
    const needsRewrite = rawSpec.rewrite === true;
    const canRewrite = needsRewrite && fieldIds.length > 0;

    const data = { values: visProps.series };

    if (needsRewrite && !canRewrite) {
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

    const { desktopSpec, responsiveConfig } = extractLightdashConfig(rawSpec);

    const previewOverride: ResponsivePreviewOverride | undefined = !isDashboard
        ? visProps.editorResponsiveTab
        : undefined;

    const { spec: activeSpecRaw, variant: layoutVariant } = resolveActiveSpec(
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

    /**
     * 看板开启「同步图表颜色」时：按系列名把看板色表注入 spec 的 color scale，
     * 使自定义图表与笛卡尔/饼图同名系列同色（跨图稳定）。
     */
    const colorSyncResult = colorSync.enabled
        ? applyDashboardColorSync({
              spec: sizedSpec as Record<string, unknown>,
              series: visProps.series,
              resolveColor: createVegaColorResolver({
                  palette: colorSync.palette,
                  hashAssignments: colorSync.hashAssignments,
                  formattedValueMap,
              }),
          })
        : { spec: null, visibleKeys: [] as string[] };

    setVisibleColorKeys(colorSyncResult.visibleKeys);

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
            {hasSize ? (
                <Suspense fallback={<CompactChartLoading />}>
                    <VegaLite
                        key={`vega-${layout.layoutId}-${
                            visProps.editorResponsiveTab
                        }-${visProps.series?.length ?? 0}-${
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
