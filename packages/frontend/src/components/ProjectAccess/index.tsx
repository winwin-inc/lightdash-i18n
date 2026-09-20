import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Button, Stack, Tabs } from '@mantine/core';
import { IconPlus, IconUser, IconUsersGroup } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { ProjectGroupAccess } from '../../features/projectGroupAccess';
import { useFeatureFlag } from '../../hooks/useFeatureFlagEnabled';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import ProjectAccess from './ProjectAccess';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const ProjectUserAccess: FC<ProjectUserAccessProps> = ({ projectUuid }) => {
    const { t } = useTranslation();
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const [showProjectAccessAdd, setShowProjectAccessAdd] = useState(false);
    const [showProjectGroupAccessAdd, setShowProjectGroupAccessAdd] =
        useState(false);

    if (!user.data) return null;

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    return (
        <Stack>
            <Tabs defaultValue="users">
                <Stack>
                    {isGroupManagementEnabled && (
                        <Tabs.List>
                            <Tabs.Tab
                                icon={<MantineIcon icon={IconUser} size="sm" />}
                                value="users"
                            >
                                {t('components_project_access_user.tabs.users')}
                            </Tabs.Tab>
                            <Tabs.Tab
                                icon={
                                    <MantineIcon
                                        icon={IconUsersGroup}
                                        size="sm"
                                    />
                                }
                                value="groups"
                            >
                                {t(
                                    'components_project_access_user.tabs.groups',
                                )}
                            </Tabs.Tab>
                        </Tabs.List>
                    )}

                    <Tabs.Panel value="users">
                        <Stack>
                            <Can
                                I="manage"
                                this={subject('Project', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <Button
                                    style={{ alignSelf: 'flex-end' }}
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    onClick={() =>
                                        setShowProjectAccessAdd(true)
                                    }
                                    size="xs"
                                >
                                    {t(
                                        'components_project_access_user.tabs.add_user_access',
                                    )}
                                </Button>
                            </Can>

                            <ProjectAccess
                                projectUuid={projectUuid}
                                isAddingProjectAccess={showProjectAccessAdd}
                                onAddProjectAccessClose={() =>
                                    setShowProjectAccessAdd(false)
                                }
                            />
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="groups">
                        <Stack>
                            <Can
                                I="manage"
                                this={subject('Project', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <Button
                                    style={{ alignSelf: 'flex-end' }}
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    onClick={() =>
                                        setShowProjectGroupAccessAdd(true)
                                    }
                                    size="xs"
                                >
                                    {t(
                                        'components_project_access_user.tabs.add_group_access',
                                    )}
                                </Button>
                            </Can>

                            <ProjectGroupAccess
                                projectUuid={projectUuid}
                                isAddingProjectGroupAccess={
                                    showProjectGroupAccessAdd
                                }
                                onAddProjectGroupAccessClose={() =>
                                    setShowProjectGroupAccessAdd(false)
                                }
                            />
                        </Stack>
                    </Tabs.Panel>
                </Stack>
            </Tabs>
        </Stack>
    );
};

export default ProjectUserAccess;
