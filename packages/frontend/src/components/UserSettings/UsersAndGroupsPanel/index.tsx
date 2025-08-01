import { ActionIcon, Group, Stack, Tabs, Title, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import ForbiddenPanel from '../../ForbiddenPanel';

import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import GroupsView from './GroupsView';
import UsersView from './UsersView';

const UsersAndGroupsPanel: FC = () => {
    const { t } = useTranslation();
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    if (!user.data) return null;

    if (user.data.ability.cannot('view', 'OrganizationMemberProfile')) {
        return <ForbiddenPanel />;
    }

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    return (
        <Stack spacing="sm">
            <Group spacing="two">
                {isGroupManagementEnabled ? (
                    <Title order={5}>
                        {t(
                            'components_user_settings_groups_panel.users_and_groups',
                        )}
                    </Title>
                ) : (
                    <Title order={5}>
                        {t(
                            'components_user_settings_groups_panel.user_management_settings',
                        )}
                    </Title>
                )}
                <Tooltip
                    label={t(
                        'components_user_settings_groups_panel.tooltip.label',
                    )}
                >
                    <ActionIcon
                        component="a"
                        href="https://docs.lightdash.com/references/roles"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Tabs defaultValue={'users'}>
                {isGroupManagementEnabled && (
                    <Tabs.List mx="one">
                        <Tabs.Tab value="users">
                            {t('components_user_settings_groups_panel.users')}
                        </Tabs.Tab>
                        <Tabs.Tab value="groups">
                            {t('components_user_settings_groups_panel.groups')}
                        </Tabs.Tab>
                    </Tabs.List>
                )}
                <Tabs.Panel value="users">
                    <UsersView />
                </Tabs.Panel>
                <Tabs.Panel value="groups">
                    <GroupsView />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default UsersAndGroupsPanel;
