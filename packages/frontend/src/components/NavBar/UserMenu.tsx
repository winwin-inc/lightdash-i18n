import { Menu } from '@mantine/core';
import { IconLogout, IconUserCircle, IconUserPlus } from '@tabler/icons-react';
import posthog from 'posthog-js';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import useApp from '../../providers/App/useApp';
import { UserAvatar } from '../UserAvatar';
import MantineIcon from '../common/MantineIcon';

const UserMenu: FC = () => {
    const { user } = useApp();
    const { mutate: logout } = useLogoutMutation({
        onSuccess: () => {
            posthog.reset();
            window.location.href = '/login';
        },
    });
    const { t } = useTranslation();

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <UserAvatar />
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    role="menuitem"
                    component={Link}
                    to="/generalSettings"
                    icon={<MantineIcon icon={IconUserCircle} />}
                >
                    {t('components_navbar_user_menu.menus.user.title')}
                </Menu.Item>

                {user.data?.ability?.can('create', 'InviteLink') ? (
                    <Menu.Item
                        role="menuitem"
                        component={Link}
                        to="/generalSettings/userManagement?to=invite"
                        icon={<MantineIcon icon={IconUserPlus} />}
                    >
                        {t('components_navbar_user_menu.menus.invite.title')}
                    </Menu.Item>
                ) : null}

                <Menu.Item
                    role="menuitem"
                    onClick={() => logout()}
                    icon={<MantineIcon icon={IconLogout} />}
                >
                    {t('components_navbar_user_menu.menus.logout.title')}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

export default UserMenu;
