import { subject } from '@casl/ability';
import {
    IconBuildingBank,
    IconDatabase,
    IconSettings,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Menu } from '@mantine/core';
import { Link } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';

const SettingsMenu: FC = () => {
    const {
        user: { data: user },
    } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { t } = useTranslation();

    if (!user || !activeProjectUuid) return null;

    const userCanViewOrganization = user.ability.can(
        'update',
        subject('Organization', {
            organizationUuid: user.organizationUuid,
        }),
    );

    const userCanCreateProject = user.ability.can(
        'update',
        subject('Project', {
            organizationUuid: user.organizationUuid,
            projectUuid: activeProjectUuid,
        }),
    );

    if (!userCanViewOrganization && !userCanCreateProject) {
        return null;
    }

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <Button
                    aria-label="Settings"
                    variant="default"
                    size="xs"
                    data-testid="settings-menu"
                >
                    <MantineIcon icon={IconSettings} />
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {activeProjectUuid && userCanCreateProject && (
                    <Menu.Item
                        component={Link}
                        icon={<MantineIcon icon={IconDatabase} />}
                        to={`/generalSettings/projectManagement/${activeProjectUuid}/settings`}
                    >
                        {t(
                            'components_navbar_settings_menu.menus.project.title',
                        )}
                    </Menu.Item>
                )}

                {userCanViewOrganization && (
                    <Menu.Item
                        component={Link}
                        icon={<MantineIcon icon={IconBuildingBank} />}
                        to={`/generalSettings/organization`}
                    >
                        {t(
                            'components_navbar_settings_menu.menus.organization.title',
                        )}
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default SettingsMenu;
