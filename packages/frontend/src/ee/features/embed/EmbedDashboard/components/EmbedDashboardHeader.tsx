import {
    isFilterInteractivityEnabled,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { type FC } from 'react';
import EmbedDashboardExportPdf from './EmbedDashboardExportPdf';
import EmbedDashboardFilters from './EmbedDashboardFilters';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    projectUuid: string;
};

const EmbedDashboardHeader: FC<Props> = ({ dashboard, projectUuid }) => {
    // 日期缩放（DateZoom）功能暂时下线：入口已隐藏且不占空间，
    // 所以 canDateZoom 不再决定是否需要渲染头部。
    const hasHeader =
        isFilterInteractivityEnabled(dashboard.dashboardFiltersInteractivity);

    // If no header, and exportPagePdf is enabled, show the Export button on the top right corner
    if (!hasHeader && dashboard.canExportPagePdf) {
        return (
            <EmbedDashboardExportPdf
                dashboard={dashboard}
                projectUuid={projectUuid}
                inHeader={false}
            />
        );
    }

    const isFilteringEnabled =
        dashboard.dashboardFiltersInteractivity &&
        isFilterInteractivityEnabled(dashboard.dashboardFiltersInteractivity);
    return (
        <Flex
            justify="flex-end"
            align="center"
            pos="relative"
            m="sm"
            mb="0"
            gap="sm"
            style={{ flexGrow: 1 }}
        >
            {isFilteringEnabled && <EmbedDashboardFilters />}

            {dashboard.canExportPagePdf && (
                <EmbedDashboardExportPdf
                    dashboard={dashboard}
                    projectUuid={projectUuid}
                    inHeader={true}
                />
            )}
        </Flex>
    );
};

export default EmbedDashboardHeader;
