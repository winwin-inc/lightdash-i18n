import {
    type AiArtifact,
    type Dashboard,
    type ToolDashboardArgs,
} from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine-8/core';
import {
    IconDeviceFloppy,
    IconDots,
    IconTableShortcut,
} from '@tabler/icons-react';
import { Fragment, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import MantineIcon from '../../../../../components/common/MantineIcon';
import { AiDashboardSaveModal } from './AiDashboardSaveModal';

type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardArgs;
};

export const AiDashboardQuickOptions: FC<Props> = ({
    artifactData,
    projectUuid,
    agentUuid,
    dashboardConfig,
}) => {
    const { t } = useTranslation();

    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSaveDashboard = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleSaveSuccess = (_dashboard: Dashboard) => {
        // TODO persist on artifact
        setIsModalOpen(false);
    };

    return (
        <Fragment>
            <Menu withArrow>
                <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="gray">
                        <MantineIcon icon={IconDots} size="lg" color="gray" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>
                        {t(
                            'ai_agent_form_setup_admin.ai_dashboard_quick_options.quick_actions',
                        )}
                    </Menu.Label>
                    {artifactData.savedDashboardUuid ? (
                        <Menu.Item
                            component={Link}
                            to={`/projects/${projectUuid}/dashboards/${artifactData.savedDashboardUuid}`}
                            target="_blank"
                            leftSection={
                                <MantineIcon icon={IconTableShortcut} />
                            }
                        >
                            {t(
                                'ai_agent_form_setup_admin.ai_dashboard_quick_options.view_saved_dashboard',
                            )}
                        </Menu.Item>
                    ) : (
                        <Menu.Item
                            onClick={handleSaveDashboard}
                            leftSection={
                                <MantineIcon icon={IconDeviceFloppy} />
                            }
                        >
                            {t(
                                'ai_agent_form_setup_admin.ai_dashboard_quick_options.save_dashboard',
                            )}
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>

            <AiDashboardSaveModal
                opened={isModalOpen}
                onClose={handleCloseModal}
                artifactData={artifactData}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
                dashboardConfig={dashboardConfig}
                onSuccess={handleSaveSuccess}
            />
        </Fragment>
    );
};
