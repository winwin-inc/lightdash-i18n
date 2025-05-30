import { subject } from '@casl/ability';
import {
    hasCustomBinDimension,
    isCustomDimension,
    isDimension,
    isField,
    type ResultValue,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconStack } from '@tabler/icons-react';
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
import { type CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

const CellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({ cell }) => {
    const { openUnderlyingDataModal, metricQuery } =
        useMetricQueryDataContext();
    const { showToastSuccess } = useToaster();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );
    const fieldValues = useMemo(
        () => mapValues(cell.row.original, (v) => v?.value) || {},
        [cell],
    );

    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const clipboard = useClipboard({ timeout: 200 });
    const { t } = useTranslation();

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({ title: t('components_simple_table.copy') });
    }, [clipboard, showToastSuccess, value.formatted, t]);

    const handleViewUnderlyingData = useCallback(() => {
        openUnderlyingDataModal({
            item,
            value,
            fieldValues,
        });
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    }, [
        fieldValues,
        item,
        openUnderlyingDataModal,
        projectUuid,
        track,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
        value,
    ]);

    return (
        <>
            {item && value.raw && isField(item) ? (
                <UrlMenuItems urls={item.urls} cell={cell} />
            ) : null}

            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}

            <Menu.Item
                icon={<MantineIcon icon={IconCopy} size="md" fillOpacity={0} />}
                onClick={handleCopyToClipboard}
            >
                {t('components_simple_table.menus.copy.title')}
            </Menu.Item>

            {item &&
                !isDimension(item) &&
                !isCustomDimension(item) &&
                !hasCustomBinDimension(metricQuery) && (
                    <Can
                        I="view"
                        this={subject('UnderlyingData', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Menu.Item
                            icon={<MantineIcon icon={IconStack} size="md" />}
                            onClick={handleViewUnderlyingData}
                        >
                            {t('components_simple_table.menus.view.title')}
                        </Menu.Item>
                    </Can>
                )}

            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                <DrillDownMenuItem
                    item={item}
                    fieldValues={fieldValues}
                    pivotReference={meta?.pivotReference}
                    trackingData={{
                        organizationId: user?.data?.organizationUuid,
                        userId: user?.data?.userUuid,
                        projectId: projectUuid,
                    }}
                />
            </Can>
        </>
    );
};

export default CellContextMenu;
