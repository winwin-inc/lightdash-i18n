import {
    type OrganizationMemberProfile,
    type OrganizationMemberProfileWithGroups,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Card,
    Collapse,
    Group,
    Modal,
    Radio,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconChevronDown,
    IconChevronUp,
    IconLayoutDashboard,
    IconTrash,
} from '@tabler/icons-react';
import React, { useCallback, useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useDeleteOrganizationUserMutation,
    useReassignUserDashboardsMutation,
    useUserDashboardsSummary,
} from '../../../hooks/useOrganizationUsers';
import MantineIcon from '../../common/MantineIcon';
import { UserSelect } from '../../common/UserSelect';

interface UsersActionMenuProps {
    user: OrganizationMemberProfile | OrganizationMemberProfileWithGroups;
    disabled: boolean;
    userDisplay?: React.ReactNode;
}

enum DashboardOwnerAction {
    LEAVE_UNOWNED = 'leave_unowned',
    REASSIGN = 'reassign',
}

const UserNameDisplay: FC<{
    user: OrganizationMemberProfile;
}> = ({ user }) => {
    return (
        <Stack spacing={2} align="flex-start">
            <Title order={6}>
                {user.firstName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
            </Title>
            {user.email && user.firstName && (
                <Text fz="xs" color="dimmed">
                    {user.email}
                </Text>
            )}
        </Stack>
    );
};

/**
 * Delete-user action with dashboard ownership transfer (offboarding).
 * Kept as a dedicated component so UsersView can keep its existing table layout.
 */
const UsersActionMenu: FC<UsersActionMenuProps> = ({
    user,
    disabled,
    userDisplay,
}) => {
    const { t } = useTranslation();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [dashboardOwnerAction, setDashboardOwnerAction] =
        React.useState<DashboardOwnerAction>(DashboardOwnerAction.REASSIGN);
    const [selectedDashboardOwner, setSelectedDashboardOwner] = React.useState<
        string | null
    >(null);
    const [isDashboardBreakdownOpen, setIsDashboardBreakdownOpen] =
        React.useState(false);

    const { mutateAsync: deleteUser, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();
    const {
        mutateAsync: reassignDashboards,
        isLoading: isReassigningDashboards,
    } = useReassignUserDashboardsMutation();
    const { data: dashboardsSummary, isLoading: isLoadingDashboards } =
        useUserDashboardsSummary(user.userUuid, isDeleteDialogOpen);

    const hasOwnedDashboards =
        dashboardsSummary && dashboardsSummary.totalCount > 0;
    const isProcessing = isDeleting || isReassigningDashboards;

    useEffect(() => {
        if (isDeleteDialogOpen) {
            setDashboardOwnerAction(DashboardOwnerAction.REASSIGN);
            setSelectedDashboardOwner(null);
            setIsDashboardBreakdownOpen(false);
        }
    }, [isDeleteDialogOpen]);

    const handleDelete = useCallback(async () => {
        if (
            hasOwnedDashboards &&
            dashboardOwnerAction === DashboardOwnerAction.REASSIGN
        ) {
            if (!selectedDashboardOwner) return;
            await reassignDashboards({
                userUuid: user.userUuid,
                newOwnerUserUuid: selectedDashboardOwner,
            });
        }
        await deleteUser(user.userUuid);
        setIsDeleteDialogOpen(false);
    }, [
        hasOwnedDashboards,
        dashboardOwnerAction,
        selectedDashboardOwner,
        reassignDashboards,
        deleteUser,
        user.userUuid,
    ]);

    const canConfirmDashboards =
        !hasOwnedDashboards ||
        dashboardOwnerAction === DashboardOwnerAction.LEAVE_UNOWNED ||
        (dashboardOwnerAction === DashboardOwnerAction.REASSIGN &&
            selectedDashboardOwner);

    const dashboardText =
        dashboardsSummary?.totalCount === 1
            ? t(
                  'components_user_settings_users_action_menu.dashboard_count_one',
              )
            : t(
                  'components_user_settings_users_action_menu.dashboard_count_other',
                  { count: dashboardsSummary?.totalCount },
              );

    const dashboardProjectCount = dashboardsSummary?.byProject.length ?? 0;
    const dashboardProjectText =
        dashboardProjectCount === 1
            ? t(
                  'components_user_settings_users_action_menu.project_count_one',
              )
            : t(
                  'components_user_settings_users_action_menu.project_count_other',
                  { count: dashboardProjectCount },
              );

    const handleDashboardOwnerActionChange = useCallback((value: string) => {
        if (
            value !== DashboardOwnerAction.LEAVE_UNOWNED &&
            value !== DashboardOwnerAction.REASSIGN
        )
            return;
        setDashboardOwnerAction(value);
    }, []);

    return (
        <>
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
                    !isProcessing ? setIsDeleteDialogOpen(false) : undefined
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
                <Stack spacing="md">
                    <Text>
                        {t(
                            'components_user_settings_groups_panel_users_view.modal_delete.content',
                        )}
                    </Text>

                    <Card withBorder>
                        {userDisplay ?? <UserNameDisplay user={user} />}
                    </Card>

                    {isLoadingDashboards ? (
                        <Text fz="sm" color="dimmed">
                            {t(
                                'components_user_settings_users_action_menu.checking_owned_content',
                            )}
                        </Text>
                    ) : hasOwnedDashboards ? (
                        <>
                            <Alert
                                color="orange"
                                icon={
                                    <MantineIcon icon={IconLayoutDashboard} />
                                }
                            >
                                <Stack spacing="xs">
                                    <Text fz="sm">
                                        {t(
                                            'components_user_settings_users_action_menu.owns_dashboards',
                                            {
                                                dashboardText,
                                                projectText:
                                                    dashboardProjectText,
                                            },
                                        )}
                                    </Text>
                                    <Group
                                        spacing={4}
                                        sx={{ cursor: 'pointer' }}
                                        onClick={() =>
                                            setIsDashboardBreakdownOpen(
                                                (prev) => !prev,
                                            )
                                        }
                                    >
                                        <Text fz="xs" color="orange.7" fw={500}>
                                            {isDashboardBreakdownOpen
                                                ? t(
                                                      'components_user_settings_users_action_menu.hide_details',
                                                  )
                                                : t(
                                                      'components_user_settings_users_action_menu.show_details',
                                                  )}
                                        </Text>
                                        <MantineIcon
                                            icon={
                                                isDashboardBreakdownOpen
                                                    ? IconChevronUp
                                                    : IconChevronDown
                                            }
                                            color="orange.7"
                                            size={14}
                                        />
                                    </Group>
                                    <Collapse in={isDashboardBreakdownOpen}>
                                        <Stack spacing={4}>
                                            {dashboardsSummary?.byProject.map(
                                                (project) => (
                                                    <Text
                                                        key={project.projectUuid}
                                                        fz="xs"
                                                    >
                                                        • {project.projectName}
                                                        : {project.count}{' '}
                                                        {project.count === 1
                                                            ? t(
                                                                  'components_user_settings_users_action_menu.dashboard_singular',
                                                              )
                                                            : t(
                                                                  'components_user_settings_users_action_menu.dashboard_plural',
                                                              )}
                                                    </Text>
                                                ),
                                            )}
                                        </Stack>
                                    </Collapse>
                                </Stack>
                            </Alert>

                            <Radio.Group
                                key={dashboardOwnerAction}
                                name="dashboardOwnerAction"
                                value={dashboardOwnerAction}
                                onChange={handleDashboardOwnerActionChange}
                            >
                                <Stack spacing="sm">
                                    <Radio
                                        value={
                                            DashboardOwnerAction.LEAVE_UNOWNED
                                        }
                                        label={t(
                                            'components_user_settings_users_action_menu.leave_unowned',
                                        )}
                                    />
                                    <Radio
                                        value={DashboardOwnerAction.REASSIGN}
                                        label={t(
                                            'components_user_settings_users_action_menu.reassign_owner',
                                        )}
                                    />
                                </Stack>
                            </Radio.Group>

                            {dashboardOwnerAction ===
                                DashboardOwnerAction.REASSIGN && (
                                <UserSelect
                                    label={t(
                                        'components_user_settings_users_action_menu.new_owner_label',
                                    )}
                                    value={selectedDashboardOwner}
                                    onChange={setSelectedDashboardOwner}
                                    excludedUserUuid={user.userUuid}
                                />
                            )}
                        </>
                    ) : (
                        <Group spacing="xs">
                            <MantineIcon
                                icon={IconAlertCircle}
                                color="gray.6"
                            />
                            <Text fz="xs" color="dimmed">
                                {t(
                                    'components_user_settings_users_action_menu.no_owned_dashboards',
                                )}
                            </Text>
                        </Group>
                    )}

                    <Group spacing="xs" position="right">
                        <Button
                            disabled={isProcessing}
                            onClick={() => setIsDeleteDialogOpen(false)}
                            variant="outline"
                            color="dark"
                        >
                            {t(
                                'components_user_settings_groups_panel_users_view.modal_delete.cancel',
                            )}
                        </Button>
                        <Button
                            onClick={() => void handleDelete()}
                            loading={isProcessing}
                            disabled={!canConfirmDashboards}
                            color="red"
                        >
                            {t(
                                'components_user_settings_groups_panel_users_view.modal_delete.delete',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};

export default UsersActionMenu;
