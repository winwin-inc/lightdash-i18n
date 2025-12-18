import { subject } from '@casl/ability';
import { ActionIcon, Box, Button, Group } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import Omnibar from '../../features/omnibar';
import Logo from '../../svgs/logo-icon.svg?react';
import useApp from '../../providers/App/useApp';
import { AiAgentsButton } from './AiAgentsButton';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import HelpMenu from './HelpMenu';
import { MetricsLink } from './MetricsLink';
import { NotificationsMenu } from './NotificationsMenu';
import ProjectSwitcher from './ProjectSwitcher';
import SettingsMenu from './SettingsMenu';
import SwitchLanguage from './SwitchLanguage';
import UserCredentialsSwitcher from './UserCredentialsSwitcher';
import UserMenu from './UserMenu';

type Props = {
    activeProjectUuid: string | undefined;
    isLoadingActiveProject: boolean;
    isCustomerUse: boolean;
};

export const MainNavBarContent: FC<Props> = ({
    activeProjectUuid,
    isLoadingActiveProject,
    isCustomerUse,
}) => {
    const { t } = useTranslation();
    const { user } = useApp();

    const homeUrl = activeProjectUuid
        ? `/projects/${activeProjectUuid}/home`
        : '/';
    const { data: hasMetrics } = useHasMetricsInCatalog({
        projectUuid: activeProjectUuid,
    });

    // 检查用户是否有管理员权限（manage Project）
    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: activeProjectUuid,
        }),
    );

    // 客户使用模式 + 查看者权限（不能 manage Project）时隐藏 Logo
    const shouldHideLogo = isCustomerUse && !userCanManageProject;

    return (
        <>
            <Group align="center" sx={{ flexShrink: 0 }}>
                {!shouldHideLogo && (
                    <ActionIcon
                        component={Link}
                        to={homeUrl}
                        title={t('components_navbar_main_navbar_content.home')}
                        size="lg"
                    >
                        <Logo />
                    </ActionIcon>
                )}

                {!isLoadingActiveProject && activeProjectUuid && (
                    <>
                        <Button.Group>
                            <ExploreMenu projectUuid={activeProjectUuid} />
                            <BrowseMenu
                                projectUuid={activeProjectUuid}
                                isCustomerUse={isCustomerUse}
                            />
                            {hasMetrics && !isCustomerUse && (
                                <MetricsLink projectUuid={activeProjectUuid} />
                            )}
                            <AiAgentsButton />
                        </Button.Group>
                        {!isCustomerUse && (
                            <Omnibar projectUuid={activeProjectUuid} />
                        )}
                    </>
                )}
            </Group>

            <Box sx={{ flexGrow: 1 }} />

            <Group sx={{ flexShrink: 0 }}>
                <Button.Group>
                    <SettingsMenu />

                    {!isLoadingActiveProject && activeProjectUuid && (
                        <NotificationsMenu projectUuid={activeProjectUuid} />
                    )}

                    <HelpMenu />

                    <ProjectSwitcher />
                </Button.Group>

                <SwitchLanguage />

                <UserCredentialsSwitcher />
                <UserMenu />
            </Group>
        </>
    );
};
