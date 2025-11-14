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

const downloadChartImage = async (
    chartType: ChartType,
    echartRef: RefObject<any | null> | undefined,
    chartName?: string,
) => {
    try {
        let base64Image = '';
        let relativeWidth = 0;

        if (chartType === ChartType.CUSTOM) {
            // vega lite
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

            const canvas = containeRef?.current?.querySelector('canvas');
            const canvasData = canvas?.toDataURL('image/png');
            const width = canvas?.width;

            if (!canvasData || !width) {
                console.error('Canvas data or width is not available');
                return;
            }

            base64Image = canvasData;
            relativeWidth = width;
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
