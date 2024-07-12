import {
    getHighestProjectRole,
    ProjectMemberRole,
    type InheritedRoles,
    type OrganizationMemberProfile,
    type ProjectRole,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    useCreateProjectAccessMutation,
    useRevokeProjectAccessMutation,
    useUpdateProjectAccessMutation,
} from '../../hooks/useProjectAccess';
import MantineIcon from '../common/MantineIcon';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

type Props = {
    projectUuid: string;
    canManageProjectAccess: boolean;
    user: OrganizationMemberProfile;
    inheritedRoles: InheritedRoles;
};

const ProjectAccessRow: FC<Props> = ({
    projectUuid,
    canManageProjectAccess,
    user,
    inheritedRoles,
}) => {
    const { t } = useTranslation();

    const RoleTypeLabels = {
        organization: t(
            'components_project_access_row.roles_types.organization',
        ),
        project: t('components_project_access_row.roles_types.project'),
        group: t('components_project_access_row.roles_types.group'),
        space_group: t('components_project_access_row.roles_types.space_group'),
    };

    const ProjectMemberRoleLabels = {
        [ProjectMemberRole.VIEWER]: t(
            'components_project_access_row.roles.viewer',
        ),
        [ProjectMemberRole.INTERACTIVE_VIEWER]: t(
            'components_project_access_row.roles.interactive_viewer',
        ),
        [ProjectMemberRole.EDITOR]: t(
            'components_project_access_row.roles.editor',
        ),
        [ProjectMemberRole.DEVELOPER]: t(
            'components_project_access_row.roles.developer',
        ),
        [ProjectMemberRole.ADMIN]: t(
            'components_project_access_row.roles.admin',
        ),
    } as Record<ProjectMemberRole, string>;

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const { mutate: createAccess, isLoading: isCreatingAccess } =
        useCreateProjectAccessMutation(projectUuid);

    const { mutate: updateAccess, isLoading: isUpdatingAccess } =
        useUpdateProjectAccessMutation(projectUuid);

    const { mutate: revokeAccess, isLoading: isRevokingAccess } =
        useRevokeProjectAccessMutation(projectUuid);

    const handleCreate = useCallback(
        (role: ProjectMemberRole) => {
            if (!canManageProjectAccess) return;

            createAccess({
                email: user.email,
                role: role,
                sendEmail: false,
            });
        },
        [canManageProjectAccess, createAccess, user.email],
    );

    const handleUpdate = useCallback(
        (newRole: ProjectMemberRole) => {
            if (!canManageProjectAccess) return;

            updateAccess({
                userUuid: user.userUuid,
                role: newRole,
            });
        },
        [canManageProjectAccess, updateAccess, user.userUuid],
    );

    const handleDelete = useCallback(() => {
        if (!canManageProjectAccess) return;

        revokeAccess(user.userUuid);
    }, [canManageProjectAccess, revokeAccess, user.userUuid]);

    const highestRole = useMemo(() => {
        return getHighestProjectRole(inheritedRoles);
    }, [inheritedRoles]);

    const projectRole = useMemo(() => {
        return inheritedRoles.find(
            (role): role is ProjectRole => role.type === 'project',
        );
    }, [inheritedRoles]);

    if (!highestRole) return null;

    const hasProjectRole = !!projectRole?.role;
    const hasInheritedHigherRole =
        hasProjectRole && highestRole.type !== 'project' && !!highestRole.role;

    return (
        <>
            <tr>
                <td width="30%">
                    <Stack spacing="xs" align={'flex-start'}>
                        {user.firstName && (
                            <Text fw={700}>
                                {user.firstName} {user.lastName}
                            </Text>
                        )}
                        {user.email && (
                            <Badge color="gray" size="xs" radius="xs">
                                {user.email}
                            </Badge>
                        )}
                    </Stack>
                </td>

                <td width="70%">
                    <Stack spacing="xs">
                        <Tooltip
                            disabled={hasProjectRole}
                            label={
                                <Text>
                                    {t(
                                        'components_project_access_row.tooltip_user.part_1',
                                    )}{' '}
                                    <Text span fw={600}>
                                        {t(
                                            'components_project_access_row.tooltip_user.part_2',
                                            {
                                                roleType:
                                                    RoleTypeLabels[
                                                        highestRole.type
                                                    ],
                                            },
                                        )}{' '}
                                    </Text>
                                    {t(
                                        'components_project_access_row.tooltip_user.part_3',
                                    )}
                                </Text>
                            }
                        >
                            <Select
                                id="user-role"
                                w="180px"
                                size="xs"
                                disabled={isUpdatingAccess || isCreatingAccess}
                                data={Object.values(ProjectMemberRole).map(
                                    (role) => ({
                                        value: role,
                                        label: ProjectMemberRoleLabels[role],
                                    }),
                                )}
                                value={
                                    hasProjectRole
                                        ? projectRole.role
                                        : highestRole.role
                                }
                                onChange={(newRole: ProjectMemberRole) => {
                                    if (projectRole && projectRole.role) {
                                        handleUpdate(newRole);
                                    } else {
                                        handleCreate(newRole);
                                    }
                                }}
                            />
                        </Tooltip>

                        {hasInheritedHigherRole && (
                            <Group spacing="xxs">
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="orange"
                                />
                                <Text color="orange" size="xs">
                                    {t(
                                        'components_project_access_row.higher_role.part_1',
                                    )}{' '}
                                    <Text span fw={600}>
                                        {t(
                                            'components_project_access_row.higher_role.part_2',
                                            {
                                                roleLabel:
                                                    ProjectMemberRoleLabels[
                                                        highestRole.role
                                                    ],
                                            },
                                        )}
                                    </Text>{' '}
                                    <Text span fw={600}>
                                        {t(
                                            'components_project_access_row.higher_role.part_3',
                                            {
                                                roleType:
                                                    RoleTypeLabels[
                                                        highestRole.type
                                                    ],
                                            },
                                        )}{' '}
                                    </Text>
                                    {t(
                                        'components_project_access_row.higher_role.part_4',
                                    )}{' '}
                                </Text>
                            </Group>
                        )}
                    </Stack>
                </td>

                <td width="1%">
                    <Tooltip
                        position="top"
                        label={
                            hasProjectRole
                                ? t(
                                      'components_project_access_row.tooltip_project_role.revoke',
                                  )
                                : t(
                                      'components_project_access_row.tooltip_project_role.cannot',
                                      {
                                          roleType:
                                              RoleTypeLabels[highestRole.type],
                                      },
                                  )
                        }
                    >
                        <div>
                            <ActionIcon
                                disabled={!hasProjectRole || isRevokingAccess}
                                variant="outline"
                                color="red"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </div>
                    </Tooltip>
                </td>
            </tr>

            {isDeleteDialogOpen && (
                <RemoveProjectAccessModal
                    user={user}
                    onDelete={() => {
                        setIsDeleteDialogOpen(false);
                        handleDelete();
                    }}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectAccessRow;
