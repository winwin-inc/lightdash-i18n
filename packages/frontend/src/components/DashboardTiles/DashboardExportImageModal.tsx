import { ChartType } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    NumberInput,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconPhoto } from '@tabler/icons-react';
import { type RefObject, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
    computeExportDimensions,
    downloadImage,
    ExportAspectRatio,
    ExportPixelRatio,
    getExportFileBaseName,
    letterboxImageToCanvas,
} from '../common/ChartDownload/chartDownloadUtils';
import MantineIcon from '../common/MantineIcon';

const svgElementToBase64 = (svg: SVGSVGElement): string => {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    return `data:image/svg+xml;base64,${window.btoa(
        unescape(encodeURIComponent(svgString)),
    )}`;
};

const getSvgWidth = (svg: SVGSVGElement): number => {
    if (svg.clientWidth > 0) {
        return svg.clientWidth;
    }
    if (svg.width.baseVal.value > 0) {
        return svg.width.baseVal.value;
    }
    const attrWidth = Number.parseFloat(svg.getAttribute('width') || '');
    if (Number.isFinite(attrWidth) && attrWidth > 0) {
        return attrWidth;
    }
    if (svg.viewBox.baseVal.width > 0) {
        return svg.viewBox.baseVal.width;
    }
    return 0;
};

const getSvgHeight = (svg: SVGSVGElement, fallbackWidth: number): number => {
    if (svg.clientHeight > 0) return svg.clientHeight;
    if (svg.height.baseVal.value > 0) return svg.height.baseVal.value;
    const attrHeight = Number.parseFloat(svg.getAttribute('height') || '');
    if (Number.isFinite(attrHeight) && attrHeight > 0) return attrHeight;
    if (svg.viewBox.baseVal.height > 0) return svg.viewBox.baseVal.height;
    return Math.round(fallbackWidth * 0.75);
};

type ChartExportOptions = {
    aspectRatio: ExportAspectRatio;
    isBackgroundTransparent: boolean;
    customWidth: number;
    customHeight: number;
    pixelRatio: ExportPixelRatio;
};

const DEFAULT_OPTIONS: ChartExportOptions = {
    aspectRatio: ExportAspectRatio.A16x9,
    isBackgroundTransparent: false,
    customWidth: 1920,
    customHeight: 1080,
    pixelRatio: ExportPixelRatio.X1,
};

const PREFERENCES_KEY = 'lightdash-dashboard-chart-export-preferences';

const downloadChartImage = async (
    chartType: ChartType,
    echartRef: RefObject<any | null> | undefined,
    chartName: string,
    aspectRatio: ExportAspectRatio,
    isBackgroundTransparent: boolean,
    pixelRatio: ExportPixelRatio,
    customWidth: number,
    customHeight: number,
) => {
    try {
        let base64Image = '';
        let relativeWidth = 0;
        let relativeHeight = 0;

        if (chartType === ChartType.CUSTOM) {
            // vega lite (vega-embed 7 defaults to SVG renderer)
            const vegaEmbed = echartRef?.current?.vegaEmbed;
            if (!vegaEmbed) {
                console.error('View is not available');
                return;
            }

            const containeRef = vegaEmbed?.current?.containerRef;
            if (!containeRef) {
                console.error('Container ref is not available');
                return;
            }

            const container = containeRef.current as HTMLElement | null;
            const canvas = container?.querySelector('canvas');
            if (canvas) {
                base64Image = canvas.toDataURL('image/png');
                relativeWidth = canvas.width;
                relativeHeight = canvas.height;
            } else {
                const svg = container?.querySelector('svg');
                if (!(svg instanceof SVGSVGElement)) {
                    console.error('Canvas or SVG is not available');
                    return;
                }
                base64Image = svgElementToBase64(svg);
                relativeWidth = getSvgWidth(svg);
                relativeHeight = getSvgHeight(svg, relativeWidth);
            }

            if (!base64Image || !relativeWidth) {
                console.error('Canvas data or width is not available');
                return;
            }
        } else {
            // echarts
            const chartInstance = echartRef?.current?.getEchartsInstance();
            if (!chartInstance) {
                console.error('Chart instance is not available');
                return;
            }

            base64Image = chartInstance.getDataURL();
            relativeWidth = chartInstance.getWidth();
            relativeHeight = chartInstance.getHeight();
        }

        const finalBase64 = await letterboxImageToCanvas(
            base64Image,
            relativeWidth,
            relativeHeight,
            aspectRatio,
            isBackgroundTransparent,
            'png',
            pixelRatio,
            customWidth,
            customHeight,
        );

        const fileName = `${getExportFileBaseName(
            aspectRatio,
            chartName,
            isBackgroundTransparent,
            pixelRatio,
        )}.png`;
        downloadImage(finalBase64, fileName);
    } catch (error) {
        console.error('Error downloading image', error);
    }
};

const readSourceDimensions = (
    chartType: ChartType,
    echartRef: RefObject<any | null> | undefined,
): { srcW: number; srcH: number } => {
    const ref = echartRef?.current;
    if (chartType === ChartType.CUSTOM) {
        const container = ref?.vegaEmbed?.current?.containerRef?.current as
            | HTMLElement
            | null
            | undefined;
        const canvas = container?.querySelector('canvas');
        if (canvas) {
            return { srcW: canvas.width, srcH: canvas.height };
        }
        const svg = container?.querySelector('svg');
        if (svg instanceof SVGSVGElement) {
            const w = getSvgWidth(svg);
            return { srcW: w, srcH: getSvgHeight(svg, w) };
        }
        return { srcW: 0, srcH: 0 };
    }
    const chartInstance = ref?.getEchartsInstance?.();
    if (chartInstance) {
        return {
            srcW: chartInstance.getWidth(),
            srcH: chartInstance.getHeight(),
        };
    }
    return { srcW: 0, srcH: 0 };
};

type DashboardExportImageModalProps = {
    isOpen: boolean;
    onClose: () => void;
    chartType: ChartType;
    echartRef: RefObject<any | null> | undefined;
    chartName: string;
};

function DashboardExportImageModalBody({
    onClose,
    chartType,
    echartRef,
    chartName,
}: Omit<DashboardExportImageModalProps, 'isOpen'>) {
    const { t } = useTranslation();
    const [options, setOptions] = useLocalStorage<ChartExportOptions>({
        key: PREFERENCES_KEY,
        defaultValue: DEFAULT_OPTIONS,
    });
    const {
        aspectRatio,
        isBackgroundTransparent,
        customWidth,
        customHeight,
        pixelRatio,
    } = options;

    const setAspectRatio = useCallback(
        (next: ExportAspectRatio) =>
            setOptions((prev) => ({ ...prev, aspectRatio: next })),
        [setOptions],
    );
    const setBackgroundTransparent = useCallback(
        (next: boolean) =>
            setOptions((prev) => ({
                ...prev,
                isBackgroundTransparent: next,
            })),
        [setOptions],
    );
    const setCustomWidth = useCallback(
        (next: number) =>
            setOptions((prev) => ({ ...prev, customWidth: next })),
        [setOptions],
    );
    const setCustomHeight = useCallback(
        (next: number) =>
            setOptions((prev) => ({ ...prev, customHeight: next })),
        [setOptions],
    );
    const setPixelRatio = useCallback(
        (next: ExportPixelRatio) =>
            setOptions((prev) => ({ ...prev, pixelRatio: next })),
        [setOptions],
    );

    const outputDimensions = useMemo(() => {
        const { srcW, srcH } = readSourceDimensions(chartType, echartRef);
        const dims = computeExportDimensions(
            srcW || 800,
            srcH || 600,
            aspectRatio,
            customWidth,
            customHeight,
        );
        const scale = pixelRatio === ExportPixelRatio.X2 ? 2 : 1;
        return { w: dims.targetW * scale, h: dims.targetH * scale };
    }, [
        aspectRatio,
        chartType,
        customHeight,
        customWidth,
        echartRef,
        pixelRatio,
    ]);

    const onDownload = useCallback(() => {
        void downloadChartImage(
            chartType,
            echartRef,
            chartName,
            aspectRatio,
            isBackgroundTransparent,
            pixelRatio,
            customWidth,
            customHeight,
        );
        onClose();
    }, [
        aspectRatio,
        chartName,
        chartType,
        customHeight,
        customWidth,
        echartRef,
        isBackgroundTransparent,
        onClose,
        pixelRatio,
    ]);

    return (
        <Modal
            opened
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconPhoto} color="gray.7" />
                    <Text fw={600}>
                        {t(
                            'components_dashboard_tiles_dashboard_export_image.export_image',
                        )}
                    </Text>
                </Group>
            }
            size="sm"
            withinPortal
        >
            <Stack>
                <Text fw={500}>
                    {t(
                        'components_dashboard_tiles_dashboard_export_image.options',
                    )}
                </Text>
                <Stack spacing="xs">
                    <Text fz="xs" c="dimmed">
                        {t(
                            'components_dashboard_tiles_dashboard_export_image.aspect_ratio',
                        )}
                    </Text>
                    <SegmentedControl
                        size="xs"
                        value={aspectRatio}
                        onChange={(value) =>
                            setAspectRatio(value as ExportAspectRatio)
                        }
                        data={[
                            {
                                value: ExportAspectRatio.ORIGINAL,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.aspect_ratio.original',
                                ),
                            },
                            {
                                value: ExportAspectRatio.A16x9,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.aspect_ratio.16x9',
                                ),
                            },
                            {
                                value: ExportAspectRatio.A9x16,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.aspect_ratio.9x16',
                                ),
                            },
                            {
                                value: ExportAspectRatio.A4x3,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.aspect_ratio.4x3',
                                ),
                            },
                            {
                                value: ExportAspectRatio.A3x4,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.aspect_ratio.3x4',
                                ),
                            },
                            {
                                value: ExportAspectRatio.CUSTOM,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.aspect_ratio.custom',
                                ),
                            },
                        ]}
                    />
                    {aspectRatio === ExportAspectRatio.CUSTOM && (
                        <Group spacing="xs" grow>
                            <NumberInput
                                size="xs"
                                label={t(
                                    'components_dashboard_tiles_dashboard_export_image.custom_width',
                                )}
                                value={customWidth}
                                onChange={(value) =>
                                    setCustomWidth(
                                        typeof value === 'number'
                                            ? value
                                            : Number(value) || 0,
                                    )
                                }
                                min={1}
                                max={20000}
                                step={10}
                            />
                            <NumberInput
                                size="xs"
                                label={t(
                                    'components_dashboard_tiles_dashboard_export_image.custom_height',
                                )}
                                value={customHeight}
                                onChange={(value) =>
                                    setCustomHeight(
                                        typeof value === 'number'
                                            ? value
                                            : Number(value) || 0,
                                    )
                                }
                                min={1}
                                max={20000}
                                step={10}
                            />
                        </Group>
                    )}
                </Stack>
                <Stack spacing="xs">
                    <Text fz="xs" c="dimmed">
                        {t(
                            'components_dashboard_tiles_dashboard_export_image.pixel_ratio',
                        )}
                    </Text>
                    <SegmentedControl
                        size="xs"
                        value={pixelRatio}
                        onChange={(value) =>
                            setPixelRatio(value as ExportPixelRatio)
                        }
                        data={[
                            {
                                value: ExportPixelRatio.X1,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.pixel_ratio.1x',
                                ),
                            },
                            {
                                value: ExportPixelRatio.X2,
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.pixel_ratio.2x',
                                ),
                            },
                        ]}
                    />
                </Stack>
                <Stack spacing="xs">
                    <Text fz="xs" c="dimmed">
                        {t(
                            'components_dashboard_tiles_dashboard_export_image.background',
                        )}
                    </Text>
                    <SegmentedControl
                        size="xs"
                        value={
                            isBackgroundTransparent ? 'Transparent' : 'White'
                        }
                        onChange={(value) =>
                            setBackgroundTransparent(value === 'Transparent')
                        }
                        data={[
                            {
                                value: 'White',
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.background.white',
                                ),
                            },
                            {
                                value: 'Transparent',
                                label: t(
                                    'components_dashboard_tiles_dashboard_export_image.background.transparent',
                                ),
                            },
                        ]}
                    />
                </Stack>
                <Text c="dimmed" fw={400} size="xs">
                    {t(
                        'components_dashboard_tiles_dashboard_export_image.output_dimensions',
                        {
                            w: outputDimensions.w,
                            h: outputDimensions.h,
                        },
                    )}
                </Text>
                <Group spacing="xs" position="right">
                    <Button size="xs" variant="default" onClick={onClose}>
                        {t(
                            'components_dashboard_tiles_dashboard_export_image.cancel',
                        )}
                    </Button>
                    <Button size="xs" onClick={onDownload}>
                        {t(
                            'components_dashboard_tiles_dashboard_export_image.download',
                        )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

function DashboardExportImageModal({
    isOpen,
    onClose,
    chartType,
    echartRef,
    chartName,
}: DashboardExportImageModalProps) {
    // Mirror the ExportDataModal pattern: only mount the Modal when open.
    // Without this early return, the Modal is created on first render and
    // its internal state can flash open/close when other modals in the same
    // tree change.
    if (!isOpen) return null;

    return (
        <DashboardExportImageModalBody
            onClose={onClose}
            chartType={chartType}
            echartRef={echartRef}
            chartName={chartName}
        />
    );
}

export default DashboardExportImageModal;
