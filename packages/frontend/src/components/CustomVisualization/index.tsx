import { Anchor, Text } from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';
import { IconChartBarOff } from '@tabler/icons-react';
import {
    Suspense,
    lazy,
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
} from 'react';
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
    const [earlyRect, setEarlyRect] = useState({ width: 0, height: 0 });
    const rafIdRef = useRef<number | null>(null);

    const measureRef = useCallback(
        (el: HTMLDivElement | null) => {
            (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
            if (!el) return;
            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null;
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    setEarlyRect({ width: r.width, height: r.height });
                }
            });
        },
        [ref],
    );

    useEffect(() => {
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    useEffect(() => {
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    if (!isCustomVisualizationConfig(visualizationConfig)) return null;
    const spec = visualizationConfig.chartConfig.validConfig.spec;

    if (isLoading) return <LoadingChart />;

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

    const data = { values: visProps.series };

    const rw = rect.width ?? 0;
    const rh = rect.height ?? 0;
    const width = rw > 0 ? rw : earlyRect.width;
    const height = rh > 0 ? rh : earlyRect.height;
    const hasSize = width > 0 && height > 0;

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
            ref={measureRef}
        >
            {hasSize ? (
                <Suspense fallback={<LoadingChart />}>
                    <VegaLite
                        key={`vega-${visProps.series?.length ?? 0}-${resultsData?.hasFetchedAllRows ?? false}`}
                        ref={chartRef}
                        style={{
                            width,
                            height,
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
            ) : (
                <LoadingChart />
            )}
        </div>
    );
};

export default CustomVisualization;
