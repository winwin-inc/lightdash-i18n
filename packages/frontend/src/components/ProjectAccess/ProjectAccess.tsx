import { subject } from '@casl/ability';
import { type Role } from '@lightdash/common';
import {
    ActionIcon,
    Flex,
    Pagination,
    Paper,
    Table,
    TextInput,
} from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import {
    useOrganizationRoleAssignments,
    useOrganizationRoles,
} from '../../hooks/useOrganizationRoles';
import { useProjectUsersWithRoles } from '../../hooks/useProjectUsersWithRolesV2';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { DEFAULT_PAGE_SIZE } from '../common/Table/constants';
import CreateProjectAccessModal from './CreateProjectAccessModal';
import ProjectAccessRowV2 from './ProjectAccessRowV2';

interface ProjectAccessProps {
    projectUuid: string;
    isAddingProjectAccess: boolean;
    onAddProjectAccessClose: () => void;
}

const ProjectAccess: FC<ProjectAccessProps> = ({
    projectUuid,
    isAddingProjectAccess,
    onAddProjectAccessClose,
}) => {
    const { user } = useApp();
    const { t } = useTranslation();

    const ability = useAbilityContext();

    const { cx, classes } = useTableStyles();

    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const { usersWithProjectRole, groupRoles, isLoading } =
        useProjectUsersWithRoles(projectUuid);

    const { data: organizationRoles, isLoading: isLoadingOrganizationRoles } =
        useOrganizationRoles();
    const {
        data: organizationRoleAssignments,
        isLoading: isLoadingOrganizationRoleAssignments,
    } = useOrganizationRoleAssignments();

    // Fetch organization groups to check for inherited group access
    const { data: organizationGroups } = useOrganizationGroups({
        includeMembers: 2000,
    });

    console.log('organizationRoles', organizationRoles);

    const roleAliases = useMemo(
        () => ({
            viewer: t('components_project_access.roles.viewer'),
            interactive_viewer: t(
                'components_project_access.roles.interactive_viewer',
            ),
            editor: t('components_project_access.roles.editor'),
            developer: t('components_project_access.roles.developer'),
            admin: t('components_project_access.roles.admin'),
        }),
        [t],
    );

    const rolesData = useMemo(() => {
        return organizationRoles?.map(
            (role: Pick<Role, 'roleUuid' | 'name' | 'ownerType'>) => ({
                value: role.roleUuid,
                label:
                    roleAliases[role.name as keyof typeof roleAliases] ||
                    role.name,
                group:
                    role.ownerType === 'system'
                        ? t('components_project_access.system_role')
                        : t('components_project_access.custom_role'),
            }),
        );
    }, [organizationRoles, t]);

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    // Reset page when search changes
    useEffect(() => {
        setPage(1);
    }, [search]);

    const filteredUsers = useMemo(() => {
        if (search && usersWithProjectRole) {
            return new Fuse(usersWithProjectRole, {
                keys: ['firstName', 'lastName', 'email', 'role', 'projectRole'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .map((result) => result.item);
        }
        return usersWithProjectRole;
    }, [usersWithProjectRole, search]);

    // Pagination logic
    const paginatedUsers = !filteredUsers
        ? []
        : (() => {
              const startIndex = (page - 1) * DEFAULT_PAGE_SIZE;
              const endIndex = startIndex + DEFAULT_PAGE_SIZE;
              return filteredUsers.slice(startIndex, endIndex);
          })();

    const totalPages = !filteredUsers
        ? 1
        : Math.ceil(filteredUsers.length / DEFAULT_PAGE_SIZE);

    if (
        isLoading ||
        isLoadingOrganizationRoles ||
        isLoadingOrganizationRoleAssignments
    ) {
        return (
            <LoadingState
                title={t('components_project_access.loading_user_access')}
            />
        );
    }

    return (
        <>
            <SettingsCard shadow="none" p={0}>
                <Paper p="sm">
                    <TextInput
                        size="xs"
                        placeholder={t(
                            'components_project_access.search_users',
                        )}
                        onChange={(e) => setSearch(e.target.value)}
                        value={search}
                        w={320}
                        icon={<MantineIcon icon={IconSearch} />}
                        sx={(theme) => ({
                            input: {
                                boxShadow: theme.shadows.subtle,
                            },
                        })}
                        rightSection={
                            search.length > 0 && (
                                <ActionIcon onClick={() => setSearch('')}>
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            )
                        }
                    />
                </Paper>

                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th>{t('components_project_access.table.name')}</th>
                            <th>{t('components_project_access.table.role')}</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedUsers?.map((orgUser) => (
                            <ProjectAccessRowV2
                                key={orgUser.userUuid}
                                projectUuid={projectUuid}
                                canManageProjectAccess={canManageProjectAccess}
                                user={orgUser}
                                organizationRoles={rolesData || []}
                                organizationRoleAssignments={
                                    organizationRoleAssignments || []
                                }
                                organizationGroups={organizationGroups || []}
                                groupRoles={groupRoles || []}
                            />
                        ))}
                    </tbody>
                </Table>
                {totalPages > 1 && (
                    <Flex m="sm" align="center" justify="center">
                        <Pagination
                            size="sm"
                            value={page}
                            onChange={setPage}
                            total={totalPages}
                            mt="sm"
                        />
                    </Flex>
                )}
            </SettingsCard>

            {isAddingProjectAccess && (
                <CreateProjectAccessModal
                    projectUuid={projectUuid}
                    roles={rolesData || []}
                    onClose={() => onAddProjectAccessClose()}
                />
            )}
        </>
    );
};

export default ProjectAccess;
