import { type ItemsMap } from '@lightdash/common';
import { Box, Loader, Text } from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';
import { IconChartBarOff } from '@tabler/icons-react';
import {
    Suspense,
    lazy,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import SuboptimalState from '../../../../common/SuboptimalState/SuboptimalState';
import { prepareSpecForVega } from '../../../../CustomVisualization/rewriteVegaSpecFieldLabels';
import { useVisualizationContext } from '../../../../LightdashVisualization/useVisualizationContext';
import { LoadingChart } from '../../../../SimpleChart';
import { convertRowsToSeries } from './convertRowsToSeries';

const VegaLite = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaLite })),
);

const PREVIEW_HEIGHT_PX = 280;

export type CandidateVegaPreviewProps = {
    spec: Record<string, unknown> | null;
    fieldIds: string[];
    isLoading?: boolean;
    previewKey?: string;
};

export const CandidateVegaPreview: FC<CandidateVegaPreviewProps> = ({
    spec,
    fieldIds,
    isLoading = false,
    previewKey = 'empty',
}) => {
    const { t } = useTranslation();
    const { resultsData, itemsMap } = useVisualizationContext();

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

    const series = useMemo(() => {
        if (!resultsData?.rows?.length) return [];
        return convertRowsToSeries(resultsData.rows);
    }, [resultsData?.rows]);

    const resolvedFieldIds = useMemo(() => {
        if (fieldIds.length > 0) return fieldIds;
        if (series.length > 0) return Object.keys(series[0]);
        return [];
    }, [fieldIds, series]);

    const needsRewrite = spec?.rewrite === true;
    const canRewrite = needsRewrite && resolvedFieldIds.length > 0;

    const specForVega = useMemo(() => {
        if (!spec) return null;
        return (
            prepareSpecForVega(
                spec,
                (itemsMap ?? {}) as ItemsMap,
                resolvedFieldIds,
            ) ?? spec
        );
    }, [spec, itemsMap, resolvedFieldIds]);

    const rw = rect.width ?? 0;
    const rh = rect.height ?? 0;
    const width = rw > 0 ? rw : earlyRect.width;
    const height = rh > 0 ? rh : earlyRect.height;
    const hasSize = width > 0 && height > 0;

    const renderPreviewBody = () => {
        if (!spec || !specForVega) {
            return (
                <SuboptimalState
                    title={t(
                        'components_visualization_configs_custom_vis_template.ai_candidate_preview_empty',
                    )}
                    icon={IconChartBarOff}
                />
            );
        }

        if (needsRewrite && !canRewrite) {
            return <LoadingChart />;
        }

        if (series.length === 0) {
            return (
                <SuboptimalState
                    title={t(
                        'components_visualization_configs_custom_vis_template.ai_candidate_preview_empty',
                    )}
                    description={t(
                        'components_visualization_configs_custom_vis_template.ai_no_candidates',
                    )}
                    icon={IconChartBarOff}
                />
            );
        }

        if (!hasSize) {
            return <LoadingChart />;
        }

        const data = { values: series };

        return (
            <Suspense fallback={<LoadingChart />}>
                <VegaLite
                    key={`candidate-preview-${previewKey}-${series.length}`}
                    style={{ width, height }}
                    config={{
                        autosize: { type: 'fit' },
                    }}
                    // @ts-ignore — vega-lite typings omit container sizing
                    spec={{
                        ...specForVega,
                        // @ts-ignore
                        width: 'container',
                        // @ts-ignore
                        height: 'container',
                        data: { name: 'values' },
                    }}
                    data={data}
                    actions={false}
                />
            </Suspense>
        );
    };

    return (
        <Box>
            <Text size="xs" fw={600} mb={6}>
                {t(
                    'components_visualization_configs_custom_vis_template.ai_candidate_preview_title',
                )}
            </Text>
            <Box
                pos="relative"
                sx={(theme) => ({
                    height: PREVIEW_HEIGHT_PX,
                    width: '100%',
                    border: `1px solid ${theme.colors.gray[3]}`,
                    borderRadius: theme.radius.sm,
                    overflow: 'hidden',
                    backgroundColor: theme.white,
                })}
                ref={measureRef}
            >
                {renderPreviewBody()}
                {isLoading ? (
                    <Box
                        pos="absolute"
                        top={0}
                        left={0}
                        right={0}
                        bottom={0}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(255, 255, 255, 0.72)',
                            zIndex: 2,
                        }}
                    >
                        <Loader size="sm" color="blue" />
                    </Box>
                ) : null}
            </Box>
        </Box>
    );
};
