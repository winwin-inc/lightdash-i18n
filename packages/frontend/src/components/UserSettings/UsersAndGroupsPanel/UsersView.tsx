import {
    FeatureFlags,
    isOrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
    type OrganizationMemberProfile,
    type OrganizationMemberProfileWithGroups,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Flex,
    Group,
    HoverCard,
    List,
    LoadingOverlay,
    Modal,
    Pagination,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconHelp,
    IconPlus,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useUpsertOrganizationUserRoleAssignmentMutation } from '../../../hooks/useOrganizationRoles';
import {
    useDeleteOrganizationUserMutation,
    usePaginatedOrganizationUsers,
} from '../../../hooks/useOrganizationUsers';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { DEFAULT_PAGE_SIZE } from '../../common/Table/constants';
import InvitesModal from './InvitesModal';
import InviteSuccess from './InviteSuccess';

const UserNameDisplay: FC<{
    user: OrganizationMemberProfile;
    disabled?: boolean;
    showInviteLink?: boolean;
    hasEmail?: boolean;
    onGetLink?: () => void;
}> = ({ user, showInviteLink, hasEmail, onGetLink }) => {
    const { t } = useTranslation();

    return (
        <Flex justify="space-between" align="center">
            {!user.isActive ? (
                <Stack spacing="xxs" align="flex-start">
                    <Title order={6} color="gray.6">
                        {user.firstName
                            ? `${user.firstName} ${user.lastName}`
                            : user.email}
                    </Title>
                    <Badge
                        variant="filled"
                        color="red.4"
                        radius="xs"
                        sx={{ textTransform: 'none' }}
                        px="xxs"
                    >
                        <Text fz="xs" fw={400} color="gray.8">
                            {t(
                                'components_user_settings_groups_panel_users_view.inactive',
                            )}
                        </Text>
                    </Badge>
                </Stack>
            ) : user.isPending ? (
                <Stack spacing="xxs" align="flex-start">
                    {user.email && <Title order={6}>{user.email}</Title>}
                    <Group spacing="xs">
                        <Badge
                            variant="filled"
                            color="orange.3"
                            radius="xs"
                            sx={{ textTransform: 'none' }}
                            px="xxs"
                        >
                            <Text fz="xs" fw={400} color="gray.8">
                                {!user.isInviteExpired
                                    ? t(
                                          'components_user_settings_groups_panel_users_view.pending',
                                      )
                                    : t(
                                          'components_user_settings_groups_panel_users_view.link_expired',
                                      )}
                            </Text>
                        </Badge>
                        {showInviteLink && (
                            <Anchor
                                component="button"
                                onClick={onGetLink}
                                size="xs"
                                fw={500}
                            >
                                {hasEmail
                                    ? t(
                                          'components_user_settings_groups_panel_users_view.send_new_invite',
                                      )
                                    : t(
                                          'components_user_settings_groups_panel_users_view.get_new_link',
                                      )}
                            </Anchor>
                        )}
                    </Group>
                </Stack>
            ) : (
                <Stack spacing="xxs" align="flex-start">
                    <Group spacing="xs" align="center">
                        <Title order={6}>
                            {user.firstName} {user.lastName}
                        </Title>
                        {user.isTrialAccount && (
                            <Badge
                                variant="filled"
                                radius="xs"
                                sx={{ textTransform: 'none' }}
                                px="xxs"
                            >
                                <Text fz="xs" fw={400}>
                                    {t(
                                        'components_user_settings_groups_panel_users_view.trial_account',
                                    )}
                                </Text>
                            </Badge>
                        )}
                    </Group>

                    {user.email && (
                        <Badge
                            variant="filled"
                            color="gray.2"
                            radius="xs"
                            sx={{ textTransform: 'none' }}
                            px="xxs"
                        >
                            <Text fz="xs" fw={400} color="gray.8">
                                {user.email}
                            </Text>
                        </Badge>
                    )}
                </Stack>
            )}
        </Flex>
    );
};

const useRoleDescription = () => {
    const { t } = useTranslation();

    return (role: OrganizationMemberRole) => {
        switch (role) {
            case OrganizationMemberRole.MEMBER:
                return t(
                    'components_user_settings_groups_panel_users_view.roles_description.member',
                );
            case OrganizationMemberRole.VIEWER:
                return t(
                    'components_user_settings_groups_panel_users_view.roles_description.viewer',
                );
            case OrganizationMemberRole.INTERACTIVE_VIEWER:
                return t(
                    'components_user_settings_groups_panel_users_view.roles_description.interactive_viewer',
                );
            case OrganizationMemberRole.EDITOR:
                return t(
                    'components_user_settings_groups_panel_users_view.roles_description.editor',
                );
            case OrganizationMemberRole.DEVELOPER:
                return t(
                    'components_user_settings_groups_panel_users_view.roles_description.developer',
                );
            case OrganizationMemberRole.ADMIN:
                return t(
                    'components_user_settings_groups_panel_users_view.roles_description.admin',
                );
            default:
                return null;
        }
    };
};

const UserListItem: FC<{
    disabled: boolean;
    user: OrganizationMemberProfile | OrganizationMemberProfileWithGroups;
    isGroupManagementEnabled?: boolean;
}> = ({ disabled, user, isGroupManagementEnabled }) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [showInviteSuccess, setShowInviteSuccess] = useState(true);
    const { mutate, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();
    const inviteLink = useCreateInviteLinkMutation();
    const { track } = useTracking();
    const { user: activeUser, health } = useApp();
    const updateUserRole = useUpsertOrganizationUserRoleAssignmentMutation();
    const handleDelete = () => mutate(user.userUuid);

    const getRoleDescription = useRoleDescription();
    const { t } = useTranslation();

    const getNewLink = () => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        inviteLink.mutate({ email: user.email, role: user.role });
        setShowInviteSuccess(true);
    };

    const RoleLabels = {
        member: t(
            'components_user_settings_groups_panel_users_view.roles_labels.member',
        ),
        viewer: t(
            'components_user_settings_groups_panel_users_view.roles_labels.viewer',
        ),
        interactive_viewer: t(
            'components_user_settings_groups_panel_users_view.roles_labels.interactive_viewer',
        ),
        editor: t(
            'components_user_settings_groups_panel_users_view.roles_labels.editor',
        ),
        developer: t(
            'components_user_settings_groups_panel_users_view.roles_labels.developer',
        ),
        admin: t(
            'components_user_settings_groups_panel_users_view.roles_labels.admin',
        ),
    };

    return (
        <>
            <tr>
                <td width={300}>
                    <UserNameDisplay
                        disabled={disabled}
                        user={user}
                        showInviteLink={activeUser.data?.ability?.can(
                            'create',
                            'InviteLink',
                        )}
                        onGetLink={getNewLink}
                        hasEmail={health.data?.hasEmailClient}
                    />
                </td>
                {activeUser.data?.ability?.can(
                    'manage',
                    'OrganizationMemberProfile',
                ) && (
                    <>
                        <td>
                            <Select
                                data={Object.values(OrganizationMemberRole).map(
                                    (orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: RoleLabels[orgMemberRole],
                                        description:
                                            getRoleDescription(orgMemberRole),
                                    }),
                                )}
                                onChange={(newRole: string) => {
                                    updateUserRole.mutate({
                                        userId: user.userUuid,
                                        roleId: newRole,
                                    });
                                }}
                                value={user.role}
                                w={200}
                                itemComponent={({
                                    label,
                                    description,
                                    ...props
                                }) => (
                                    <Group {...props} spacing="two">
                                        <Text>{label}</Text>
                                        <Tooltip
                                            multiline
                                            label={description}
                                            sx={{
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconHelp}
                                                color="gray.6"
                                            />
                                        </Tooltip>
                                    </Group>
                                )}
                            />
                        </td>
                        {isGroupManagementEnabled && (
                            <td>
                                {isOrganizationMemberProfileWithGroups(
                                    user,
                                ) && (
                                    <HoverCard
                                        shadow="sm"
                                        disabled={user.groups.length < 1}
                                    >
                                        <HoverCard.Target>
                                            <Text color="gray">
                                                {user.groups.length
                                                    ? t(
                                                          'components_user_settings_groups_panel_users_view.groups.part_1',
                                                          {
                                                              length: user
                                                                  .groups
                                                                  .length,
                                                          },
                                                      )
                                                    : t(
                                                          'components_user_settings_groups_panel_users_view.groups.part_2',
                                                          {
                                                              length: user
                                                                  .groups
                                                                  .length,
                                                          },
                                                      )}
                                            </Text>
                                        </HoverCard.Target>
                                        <HoverCard.Dropdown p="sm">
                                            <Text
                                                fz="xs"
                                                fw={600}
                                                color="gray.6"
                                            >
                                                {t(
                                                    'components_user_settings_groups_panel_users_view.send_new_invite',
                                                )}
                                            </Text>
                                            <List
                                                size="xs"
                                                ml="xs"
                                                mt="xs"
                                                fz="xs"
                                            >
                                                {user.groups.map((group) => (
                                                    <List.Item key={group.name}>
                                                        {group.name}
                                                    </List.Item>
                                                ))}
                                            </List>
                                        </HoverCard.Dropdown>
                                    </HoverCard>
                                )}
                            </td>
                        )}
                        <td>
                            <Group position="right">
                                <Button
                                    px="xs"
                                    variant="outline"
                                    onClick={() => setIsDeleteDialogOpen(true)}
                                    disabled={disabled}
                                    color="red"
                                >
                                    <MantineIcon icon={IconTrash} />
                                </Button>
                            </Group>
                            <Modal
                                opened={isDeleteDialogOpen}
                                onClose={() =>
                                    !isDeleting
                                        ? setIsDeleteDialogOpen(false)
                                        : undefined
                                }
                                title={
                                    <Group spacing="xs">
                                        <MantineIcon
                                            size="lg"
                                            icon={IconAlertCircle}
                                            color="red"
                                        />
                                        <Title order={4}>
                                            {t(
                                                'components_user_settings_groups_panel_users_view.modal_delete.title',
                                            )}
                                        </Title>
                                    </Group>
                                }
                            >
                                <Text pb="md">
                                    {t(
                                        'components_user_settings_groups_panel_users_view.modal_delete.content',
                                    )}
                                </Text>
                                <Card withBorder>
                                    <UserNameDisplay user={user} />
                                </Card>
                                <Group spacing="xs" position="right" mt="md">
                                    <Button
                                        disabled={isDeleting}
                                        onClick={() =>
                                            setIsDeleteDialogOpen(false)
                                        }
                                        variant="outline"
                                        color="dark"
                                    >
                                        {t(
                                            'components_user_settings_groups_panel_users_view.modal_delete.cancel',
                                        )}
                                    </Button>
                                    <Button
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                        color="red"
                                    >
                                        {t(
                                            'components_user_settings_groups_panel_users_view.modal_delete.delete',
                                        )}
                                    </Button>
                                </Group>
                            </Modal>
                        </td>
                    </>
                )}
            </tr>

            {inviteLink.data && showInviteSuccess && (
                <tr>
                    <td
                        colSpan={3}
                        style={{ borderTop: 0, padding: '0px 12px 12px' }}
                    >
                        <InviteSuccess
                            invite={inviteLink.data}
                            onClose={() => setShowInviteSuccess(false)}
                        />
                    </td>
                </tr>
            )}
        </>
    );
};

const UsersView: FC = () => {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );
    const { classes } = useTableStyles();
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const debouncedValue = useMemo(() => {
        return { search, page };
    }, [search, page]);
    const [debouncedSearchQueryAndPage] = useDebouncedValue(
        debouncedValue,
        300,
    );

    // TODO: fix the hardcoded groups number. This should be paginated.
    const { data: paginatedUsers, isInitialLoading: isLoadingUsers } =
        usePaginatedOrganizationUsers({
            searchInput: debouncedSearchQueryAndPage.search,
            includeGroups: 10000,
            paginateArgs: {
                page: debouncedSearchQueryAndPage.page,
                pageSize: DEFAULT_PAGE_SIZE,
            },
        });

    useEffect(() => {
        setPage(1);
    }, [search]);

    const organizationUsers = useMemo(() => {
        return paginatedUsers?.data;
    }, [paginatedUsers]);

    const pagination = useMemo(() => {
        return paginatedUsers?.pagination;
    }, [paginatedUsers]);

    if (!user.data) return null;

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    return (
        <Stack spacing="xs">
            <SettingsCard shadow="none" p={0}>
                <Paper p="sm" radius={0}>
                    <Group align="center" position="apart">
                        <TextInput
                            size="xs"
                            placeholder={t(
                                'components_user_settings_groups_panel_users_view.paper.search_users',
                            )}
                            data-testid="org-users-search-input"
                            onChange={(e) => setSearch(e.target.value)}
                            value={search}
                            w={320}
                            rightSection={
                                search.length > 0 && (
                                    <ActionIcon onClick={() => setSearch('')}>
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                        />
                        {user.data?.ability?.can('create', 'InviteLink') && (
                            <Button
                                compact
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() => setShowInviteModal(true)}
                            >
                                {t(
                                    'components_user_settings_groups_panel_users_view.paper.add_user',
                                )}
                            </Button>
                        )}
                    </Group>
                </Paper>
                <Table className={classes.root}>
                    <thead>
                        <tr>
                            <th>
                                {t(
                                    'components_user_settings_groups_panel_users_view.paper.user',
                                )}
                            </th>
                            {user.data?.ability?.can(
                                'manage',
                                'OrganizationMemberProfile',
                            ) && (
                                <>
                                    <th>
                                        {t(
                                            'components_user_settings_groups_panel_users_view.paper.role',
                                        )}
                                    </th>
                                    {isGroupManagementEnabled && (
                                        <th>
                                            {t(
                                                'components_user_settings_groups_panel_users_view.paper.groups',
                                            )}
                                        </th>
                                    )}
                                    <th></th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody style={{ position: 'relative' }}>
                        {!isLoadingUsers &&
                        organizationUsers &&
                        organizationUsers.length ? (
                            organizationUsers.map((orgUser) => (
                                <UserListItem
                                    key={orgUser.email}
                                    user={orgUser}
                                    isGroupManagementEnabled={
                                        isGroupManagementEnabled
                                    }
                                    disabled={
                                        user.data?.userUuid ===
                                            orgUser.userUuid ||
                                        organizationUsers.length < 1
                                    }
                                />
                            ))
                        ) : isLoadingUsers ? (
                            <tr>
                                <td colSpan={3}>
                                    <Box py="lg">
                                        <LoadingOverlay
                                            visible={true}
                                            transitionDuration={200}
                                        />
                                    </Box>
                                </td>
                            </tr>
                        ) : (
                            <tr>
                                <td colSpan={3}>
                                    <Text c="gray.6" fs="italic" ta="center">
                                        {t(
                                            'components_user_settings_groups_panel_users_view.paper.no_users_found',
                                        )}
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
                {pagination?.totalPageCount && pagination.totalPageCount > 1 ? (
                    <Flex m="sm" align="center" justify="center">
                        <Pagination
                            size="sm"
                            value={page}
                            onChange={setPage}
                            total={pagination?.totalPageCount}
                            mt="sm"
                        />
                    </Flex>
                ) : null}
            </SettingsCard>
            <InvitesModal
                key={`invite-modal-${showInviteModal}`}
                opened={showInviteModal}
                onClose={() => setShowInviteModal(false)}
            />
        </Stack>
    );
};

export default UsersView;
