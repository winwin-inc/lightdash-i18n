import { assertUnreachable } from '@lightdash/common';
import { Button, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import MantineIcon from '../common/MantineIcon';

type Props = {
    projectUuid: string | undefined;
};

export const DashboardExplorerBanner: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: 'edit' | 'view';
    }>();
    const [isCancelling, setIsCancelling] = useState(false);

    const { getEditingDashboardInfo } = useDashboardStorage();
    const {
        name: dashboardName,
        dashboardUuid,
        activeTabUuid,
    } = getEditingDashboardInfo();

    const action = useMemo(() => {
        if (!savedQueryUuid) {
            return 'creating';
        }
        switch (mode) {
            case 'edit':
                return 'editing';
            case 'view':
            default:
                return 'viewing';
        }
    }, [savedQueryUuid, mode]);

    const actionName = useMemo(() => {
        switch (action) {
            case 'viewing':
                return t('components_navbar_explorer_banner.viewing');
            case 'creating':
            case 'editing':
                return t('components_navbar_explorer_banner.editing');
        }
    }, [action, t]);

    const cancelButtonText = useMemo(() => {
        switch (action) {
            case 'viewing':
                return t(
                    'components_navbar_explorer_banner.cancel_button_text.return_to_dashboard',
                );
            case 'creating':
            case 'editing':
                return t(
                    'components_navbar_explorer_banner.cancel_button_text.cancel',
                );
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action, t]);

    const cancelButtonTooltipText = useMemo(() => {
        switch (action) {
            case 'creating':
                return t(
                    'components_navbar_explorer_banner.cancel_button_tooltip_text.creating',
                );
            case 'editing':
                return t(
                    'components_navbar_explorer_banner.cancel_button_tooltip_text.editing',
                );
            case 'viewing':
                return '';
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action, t]);

    const handleOnCancel = useCallback(() => {
        if (!projectUuid) {
            return;
        }
        // Cancel the action and navigate back to the dashboard, restoring the existing state (in case there were some unsaved changes)
        // Similar to the behaviour from `SaveToDashboard`
        // so do not clear the storage here
        setIsCancelling(true);

        let returnUrl = `/projects/${projectUuid}/dashboards/${dashboardUuid}/${
            savedQueryUuid ? 'view' : 'edit'
        }`;

        if (activeTabUuid) {
            returnUrl += `/tabs/${activeTabUuid}`;
        }

        void navigate(returnUrl);

        setTimeout(() => {
            // Clear the banner after navigating back to dashboard, but only after a delay so that the user can see the banner change
            setIsCancelling(false);
        }, 1000);
    }, [dashboardUuid, activeTabUuid, navigate, projectUuid, savedQueryUuid]);

    return (
        <>
            <MantineIcon icon={IconInfoCircle} color="white" size="sm" />

            <Text color="white" fw={500} fz="xs" mx="xxs">
                {isCancelling
                    ? t('components_navbar_explorer_banner.contet.part_1')
                    : `${t(
                          'components_navbar_explorer_banner.contet.part_2',
                      )} ${actionName} ${t(
                          'components_navbar_explorer_banner.contet.part_3',
                      )} ${
                          dashboardName
                              ? `"${dashboardName}"`
                              : t(
                                    'components_navbar_explorer_banner.contet.part_4',
                                )
                      }`}
            </Text>

            <Tooltip
                withinPortal
                // Hide tooltip when viewing the chart because the button copy is sufficient
                disabled={action === 'viewing'}
                label={cancelButtonTooltipText}
                position="bottom"
                maw={350}
            >
                <Button
                    onClick={handleOnCancel}
                    size="xs"
                    ml="md"
                    variant="white"
                    compact
                >
                    {cancelButtonText}
                </Button>
            </Tooltip>
        </>
    );
};
