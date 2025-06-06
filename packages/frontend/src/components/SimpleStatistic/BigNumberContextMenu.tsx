import { subject } from '@casl/ability';
import { hasCustomBinDimension, type ResultValue } from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import useToaster from '../../hooks/toaster/useToaster';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { isBigNumberVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

const BigNumberContextMenu: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const clipboard = useClipboard({ timeout: 200 });
    const { showToastSuccess } = useToaster();
    const { resultsData, visualizationConfig, itemsMap } =
        useVisualizationContext();
    const { openUnderlyingDataModal, openDrillDownModal, metricQuery } =
        useMetricQueryDataContext();
    const { t } = useTranslation();

    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const isBigNumber = isBigNumberVisualizationConfig(visualizationConfig);

    const fieldValues: Record<string, ResultValue> = useMemo(() => {
        return mapValues(resultsData?.rows?.[0], (col) => col.value) ?? {};
    }, [resultsData]);

    const item = useMemo(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        return chartConfig.getField(chartConfig.selectedField);
    }, [visualizationConfig, isBigNumber]);

    const value = useMemo(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        if (chartConfig.selectedField) {
            return fieldValues[chartConfig.selectedField];
        }
    }, [fieldValues, visualizationConfig, isBigNumber]);

    const handleCopyToClipboard = () => {
        if (!value) return;
        clipboard.copy(value.formatted);
        showToastSuccess({ title: t('components_simple_statistic.copied') });
    };

    const handleViewUnderlyingData = useCallback(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        if (!itemsMap || chartConfig.selectedField === undefined || !value) {
            return;
        }

        openUnderlyingDataModal({ item, value, fieldValues });
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    }, [
        projectUuid,
        itemsMap,
        value,
        item,
        fieldValues,
        track,
        openUnderlyingDataModal,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
        isBigNumber,
        visualizationConfig,
    ]);

    const handleOpenDrillIntoModal = useCallback(() => {
        if (!item) return;

        openDrillDownModal({ item, fieldValues });
        track({
            name: EventName.DRILL_BY_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    }, [
        item,
        fieldValues,
        openDrillDownModal,
        projectUuid,
        track,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
    ]);

    if (!item && !value) return <>{children}</>;

    return (
        <Menu
            withArrow
            withinPortal
            shadow="md"
            position="bottom"
            closeOnItemClick
            closeOnEscape
            radius={0}
            offset={-2}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                {value && (
                    <Menu.Item
                        icon={<MantineIcon icon={IconCopy} />}
                        onClick={handleCopyToClipboard}
                    >
                        {t('components_simple_statistic.menus.copy.title')}
                    </Menu.Item>
                )}

                {item && !hasCustomBinDimension(metricQuery) && (
                    <Can
                        I="view"
                        this={subject('UnderlyingData', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Menu.Item
                            icon={<MantineIcon icon={IconStack} />}
                            onClick={handleViewUnderlyingData}
                        >
                            {t('components_simple_statistic.menus.view.title')}
                        </Menu.Item>
                    </Can>
                )}

                {item && value && (
                    <Can
                        I="manage"
                        this={subject('Explore', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Menu.Item
                            icon={<MantineIcon icon={IconArrowBarToDown} />}
                            onClick={handleOpenDrillIntoModal}
                        >
                            {t('components_simple_statistic.menus.drill.title')}{' '}
                            <Text span fw={500}>
                                {value.formatted}
                            </Text>
                        </Menu.Item>
                    </Can>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default BigNumberContextMenu;
