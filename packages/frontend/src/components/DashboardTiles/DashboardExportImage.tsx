import { Menu } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

import { ChartType } from '@lightdash/common';
import {
    base64SvgToBase64Image,
    downloadImage,
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

const downloadChartImage = async (
    chartType: ChartType,
    echartRef: RefObject<any | null> | undefined,
    chartName?: string,
) => {
    try {
        let base64Image = '';
        let relativeWidth = 0;

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
            } else {
                const svg = container?.querySelector('svg');
                if (!(svg instanceof SVGSVGElement)) {
                    console.error('Canvas or SVG is not available');
                    return;
                }
                base64Image = svgElementToBase64(svg);
                relativeWidth = getSvgWidth(svg);
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
        }

        base64SvgToBase64Image(
            base64Image,
            relativeWidth,
            'png',
            false, //isBackgroundTransparent,
        )
            .then((base64ImageData) => {
                downloadImage(base64ImageData, chartName);
            })
            .catch((e) => {
                console.error('Error downloading image', e);
            });
    } catch (error) {
        console.error('Error downloading image', error);
    }
};

export const DashboardExportImage: FC<{
    chartType: ChartType;
    echartRef: RefObject<any | null> | undefined;
    chartName: string;
    isMinimal: boolean;
}> = ({ chartType, echartRef, chartName, isMinimal }) => {
    const { t } = useTranslation();
    const { track } = useTracking();

    return (
        <Menu.Item
            icon={<MantineIcon icon={IconPhoto} />}
            onClick={async () => {
                if (isMinimal)
                    track({ name: EventName.EMBED_DOWNLOAD_IMAGE_CLICKED });
                else track({ name: EventName.DOWNLOAD_IMAGE_CLICKED });
                await downloadChartImage(chartType, echartRef, chartName);
            }}
        >
            {t(
                'components_dashboard_tiles_dashboard_export_image.export_image',
            )}
        </Menu.Item>
    );
};
