import {
    ProjectMemberRole,
    SpaceMemberRole,
    type LightdashUser,
    type Space,
    type SpaceGroup,
    type SpaceShare,
} from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Badge,
    Collapse,
    Group,
    Paper,
    Select,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconBuildingBank,
    IconChevronDown,
    IconChevronUp,
    IconDatabase,
    IconUsers,
    type Icon as TablerIconType,
} from '@tabler/icons-react';
import chunk from 'lodash/chunk';
import { forwardRef, useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useAddGroupSpaceShareMutation,
    useAddSpaceShareMutation,
    useDeleteSpaceGroupAccessMutation,
    useDeleteSpaceShareMutation,
} from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';
import PaginateControl from '../PaginateControl';
import { DEFAULT_PAGE_SIZE } from '../Table/constants';
import {
    UserAccessAction,
    useUserAccessOptions,
    type AccessOption,
} from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

export interface ShareSpaceUserListProps {
    space: Space;
    sessionUser: LightdashUser | undefined;
    projectUuid: string;
    disabled?: boolean;
}

const UserAccessSelectItem = forwardRef<HTMLDivElement, AccessOption>(
    (
        {
            title,
            selectDescription,
            ...others
        }: React.ComponentPropsWithoutRef<'div'> & AccessOption,
        ref,
    ) => (
        <Stack ref={ref} {...others} spacing={1}>
            <Text fz="sm">{title}</Text>
            <Text fz="xs" opacity={0.65}>
                {selectDescription}
            </Text>
        </Stack>
    ),
);

const sortByRole =
    (sessionUserUuid: string | undefined) => (a: SpaceShare, b: SpaceShare) => {
        const roleOrder = [
            SpaceMemberRole.VIEWER,
            SpaceMemberRole.EDITOR,
            SpaceMemberRole.ADMIN,
        ];
        const aRole = roleOrder.indexOf(a.role);
        const bRole = roleOrder.indexOf(b.role);
        // order by session user
        if (a.userUuid === sessionUserUuid) return -1;
        if (b.userUuid === sessionUserUuid) return 1;
        // order by role
        if (aRole > bRole) return -1;
        if (aRole < bRole) return 1;
        return 0;
    };

type ListCollapseProps = {
    icon: TablerIconType;
    label: string;
    accessCount: number;
};

const ListCollapse: FC<React.PropsWithChildren<ListCollapseProps>> = ({
    icon,
    label,
    accessCount,
    children,
}) => {
    const { hovered, ref } = useHover();
    const theme = useMantineTheme();
    const [isOpen, { toggle }] = useDisclosure(false);
    return (
        <Paper withBorder={isOpen}>
            <Group
                ref={ref}
                position="apart"
                spacing="sm"
                noWrap
                bg={hovered || isOpen ? theme.colors.gray[0] : undefined}
                sx={{ cursor: 'pointer' }}
                onClick={toggle}
            >
                <Group spacing="xs">
                    <Avatar size={'sm'} radius="xl" color="gray">
                        <MantineIcon icon={icon} size={'sm'} radius="xl" />
                    </Avatar>
                    <Text fw={600} fz="sm">
                        {label}{' '}
                        <Text fw={400} span c="gray.6">
                            ({accessCount})
                        </Text>
                    </Text>
                </Group>
                <ActionIcon variant="subtle">
                    <MantineIcon
                        icon={isOpen ? IconChevronUp : IconChevronDown}
                    />
                </ActionIcon>
            </Group>
            <Collapse in={isOpen} p={'xs'}>
                {children}
            </Collapse>
        </Paper>
    );
};

type UserAccessListProps = {
    isPrivate: boolean;
    accessList: SpaceShare[];
    sessionUser: LightdashUser | undefined;
    onAccessChange: (
        action: UserAccessAction,
        currentUserAccess: SpaceShare,
    ) => void;
    pageSize?: number;
    disabled?: boolean;
};
const UserAccessList: FC<UserAccessListProps> = ({
    isPrivate,
    accessList,
    sessionUser,
    onAccessChange,
    pageSize,
    disabled = false,
}) => {
    const { t } = useTranslation();
    const UserAccessOptions = useUserAccessOptions();

    const [page, setPage] = useState(1);

    // TODO: Paginate space access from backend
    const paginatedList: SpaceShare[][] = useMemo(() => {
        const sortedList = structuredClone(accessList).sort(
            sortByRole(sessionUser?.userUuid),
        );

        return chunk(sortedList, pageSize ?? DEFAULT_PAGE_SIZE);
    }, [accessList, pageSize, sessionUser?.userUuid]);

    const handleNextPage = useCallback(() => {
        if (page < paginatedList.length) {
            setPage((prev) => prev + 1);
        }
    }, [page, paginatedList.length]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) {
            setPage((prev) => prev - 1);
        }
    }, [page]);

    return (
        <Stack spacing="sm">
            {paginatedList[page - 1]?.map((sharedUser) => {
                const needsToBePromotedToInteractiveViewer =
                    sharedUser.projectRole === ProjectMemberRole.VIEWER &&
                    sharedUser.role !== SpaceMemberRole.VIEWER;
                const isSessionUser =
                    sharedUser.userUuid === sessionUser?.userUuid;

                const userAccessTypes = UserAccessOptions.filter(
                    (accessType) =>
                        accessType.value !== UserAccessAction.DELETE ||
                        sharedUser.hasDirectAccess,
                ).map((accessType) =>
                    accessType.value === UserAccessAction.DELETE && !isPrivate
                        ? {
                              ...accessType,
                              title: t(
                                  'components_common_share_space_modal.reset_access.title',
                              ),
                              selectDescription: t(
                                  'components_common_share_space_modal.reset_access.select_description',
                              ),
                          }
                        : accessType,
                );

                return (
                    <Group
                        key={sharedUser.userUuid}
                        spacing="sm"
                        position="apart"
                        noWrap
                    >
                        <Group>
                            <Avatar
                                size={'sm'}
                                radius="xl"
                                tt="uppercase"
                                color="blue"
                            >
                                {getInitials(
                                    sharedUser.userUuid,
                                    sharedUser.firstName,
                                    sharedUser.lastName,
                                    sharedUser.email,
                                )}
                            </Avatar>

                            <Text fw={600} fz="sm">
                                {getUserNameOrEmail(
                                    sharedUser.userUuid,
                                    sharedUser.firstName,
                                    sharedUser.lastName,
                                    sharedUser.email,
                                )}
                                {isSessionUser ? (
                                    <Text fw={400} span c="gray.6">
                                        {' '}
                                        (
                                        {t(
                                            'components_common_share_space_modal.you',
                                        )}
                                        )
                                    </Text>
                                ) : null}
                            </Text>
                        </Group>
                        {isSessionUser ||
                        (!sharedUser.hasDirectAccess &&
                            sharedUser.inheritedRole ===
                                ProjectMemberRole.ADMIN) ? (
                            <Badge
                                size="xs"
                                color="gray.6"
                                radius="xs"
                                mr={'xs'}
                            >
                                {UserAccessOptions.find(
                                    (option) =>
                                        option.value === sharedUser.role,
                                )?.title ?? sharedUser.role}
                            </Badge>
                        ) : (
                            <Tooltip
                                disabled={!needsToBePromotedToInteractiveViewer}
                                withinPortal
                                label={t(
                                    'components_common_share_space_modal.tooltip_user.label',
                                )}
                                maw={350}
                                multiline
                            >
                                <Select
                                    styles={{
                                        input: {
                                            fontWeight: 500,
                                            textAlign: 'right',
                                        },
                                        rightSection: {
                                            pointerEvents: 'none',
                                        },
                                    }}
                                    size="xs"
                                    variant="unstyled"
                                    withinPortal
                                    data={userAccessTypes.map((u) => ({
                                        label: u.title,
                                        ...u,
                                    }))}
                                    value={sharedUser.role}
                                    itemComponent={UserAccessSelectItem}
                                    onChange={(userAccessOption) => {
                                        if (userAccessOption) {
                                            onAccessChange(
                                                userAccessOption as UserAccessAction,
                                                sharedUser,
                                            );
                                        }
                                    }}
                                    error={needsToBePromotedToInteractiveViewer}
                                    rightSection={
                                        needsToBePromotedToInteractiveViewer ? (
                                            <MantineIcon
                                                icon={IconAlertCircle}
                                                size="sm"
                                                color="red.6"
                                            />
                                        ) : null
                                    }
                                    disabled={disabled}
                                />
                            </Tooltip>
                        )}
                    </Group>
                );
            })}
            {paginatedList.length > 1 && (
                <PaginateControl
                    currentPage={page}
                    totalPages={paginatedList.length}
                    hasNextPage={page < paginatedList.length}
                    hasPreviousPage={page > 1}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                    style={{ alignSelf: 'flex-end' }}
                />
            )}
        </Stack>
    );
};

type GroupAccessListProps = {
    disabled?: boolean;
    isPrivate: boolean;
    groupsAccess: SpaceGroup[];
    onAccessChange: (
        action: UserAccessAction,
        currentGroupAccess: SpaceGroup,
    ) => void;
    pageSize?: number;
};
const GroupsAccessList: FC<GroupAccessListProps> = ({
    disabled = false,
    isPrivate,
    onAccessChange,
    groupsAccess,
    pageSize,
}) => {
    const { t } = useTranslation();
    const UserAccessOptions = useUserAccessOptions();

    const [page, setPage] = useState(1);

    // TODO: Paginate group access from backend
    const paginatedList: SpaceGroup[][] = useMemo(() => {
        const sortedList = structuredClone(groupsAccess);

        return chunk(sortedList, pageSize ?? DEFAULT_PAGE_SIZE);
    }, [groupsAccess, pageSize]);

    const handleNextPage = useCallback(() => {
        if (page < paginatedList.length) {
            setPage((prev) => prev + 1);
        }
    }, [page, paginatedList.length]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) {
            setPage((prev) => prev - 1);
        }
    }, [page]);

    return (
        <Stack spacing="sm">
            {paginatedList[page - 1]?.map((group) => {
                const userAccessTypes = UserAccessOptions.map((accessType) =>
                    accessType.value === UserAccessAction.DELETE
                        ? {
                              ...accessType,
                              title: isPrivate
                                  ? t(
                                        'components_common_share_space_modal.access_delete.remove_access',
                                    )
                                  : t(
                                        'components_common_share_space_modal.access_delete.reset_access',
                                    ),
                              selectDescription: isPrivate
                                  ? t(
                                        'components_common_share_space_modal.access_delete.remove_group_access',
                                    )
                                  : t(
                                        'components_common_share_space_modal.access_delete.reset',
                                    ),
                          }
                        : accessType,
                );

                return (
                    <Group
                        key={group.groupUuid}
                        spacing="sm"
                        position="apart"
                        noWrap
                    >
                        <Group>
                            <Avatar size={'sm'} radius="xl" color="blue">
                                <MantineIcon
                                    icon={IconUsers}
                                    size={'sm'}
                                    radius="xl"
                                />
                            </Avatar>
                            <Text fw={600} fz="sm">
                                {group.groupName}
                            </Text>
                        </Group>

                        <Select
                            styles={{
                                input: {
                                    fontWeight: 500,
                                    textAlign: 'right',
                                },
                                rightSection: {
                                    pointerEvents: 'none',
                                },
                            }}
                            size="xs"
                            variant="unstyled"
                            withinPortal
                            data={userAccessTypes.map((u) => ({
                                label: u.title,
                                ...u,
                            }))}
                            value={group.spaceRole}
                            itemComponent={UserAccessSelectItem}
                            onChange={(userAccessOption) => {
                                if (userAccessOption) {
                                    onAccessChange(
                                        userAccessOption as UserAccessAction,
                                        group,
                                    );
                                }
                            }}
                            disabled={disabled}
                        />
                    </Group>
                );
            })}
            {paginatedList.length > 1 && (
                <PaginateControl
                    currentPage={page}
                    totalPages={paginatedList.length}
                    hasNextPage={page < paginatedList.length}
                    hasPreviousPage={page > 1}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                    style={{ alignSelf: 'flex-end' }}
                />
            )}
        </Stack>
    );
};

type SpaceAccessByType = {
    project: SpaceShare[];
    organisation: SpaceShare[];
    direct: SpaceShare[];
};

export const ShareSpaceUserList: FC<ShareSpaceUserListProps> = ({
    space,
    projectUuid,
    sessionUser,
    disabled = false,
}) => {
    const { showToastError } = useToaster();
    const { mutate: unshareSpaceMutation } = useDeleteSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const { t } = useTranslation();

    const { mutate: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const { mutate: unshareGroupSpaceAccessMutation } =
        useDeleteSpaceGroupAccessMutation(projectUuid, space.uuid);

    const { mutate: shareGroupSpaceMutation } = useAddGroupSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const handleAccessChange = useCallback(
        (userAccessOption: UserAccessAction, sharedUser: SpaceShare) => {
            if (userAccessOption === UserAccessAction.DELETE) {
                unshareSpaceMutation(sharedUser.userUuid);
            } else {
                if (
                    sharedUser.inheritedRole === ProjectMemberRole.ADMIN &&
                    userAccessOption !== UserAccessAction.ADMIN
                ) {
                    showToastError({
                        title: t(
                            'components_common_share_space_modal.toast_error_update_user.title',
                        ),
                        subtitle: t(
                            'components_common_share_space_modal.toast_error_update_user.subtitle',
                            { userAccessOption },
                        ),
                    });
                    return;
                }

                shareSpaceMutation([
                    sharedUser.userUuid,
                    userAccessOption
                        ? userAccessOption
                        : SpaceMemberRole.VIEWER, // default to viewer role for new private space member
                ]);
            }
        },
        [unshareSpaceMutation, shareSpaceMutation, showToastError, t],
    );

    const handleGroupAccessChange = useCallback(
        (userAccessOption: UserAccessAction, group: SpaceGroup) => {
            if (userAccessOption === UserAccessAction.DELETE) {
                unshareGroupSpaceAccessMutation(group.groupUuid);
            } else {
                if (
                    group.spaceRole === SpaceMemberRole.ADMIN &&
                    userAccessOption !== UserAccessAction.ADMIN
                ) {
                    showToastError({
                        title: t(
                            'components_common_share_space_modal.toast_error_update_user.title',
                        ),
                        subtitle: t(
                            'components_common_share_space_modal.toast_error_update_user.subtitle',
                            { userAccessOption },
                        ),
                    });
                    return;
                }

                shareGroupSpaceMutation([
                    group.groupUuid,
                    userAccessOption
                        ? userAccessOption
                        : SpaceMemberRole.VIEWER, // default to viewer role for new private space member
                ]);
            }
        },
        [
            unshareGroupSpaceAccessMutation,
            shareGroupSpaceMutation,
            showToastError,
            t,
        ],
    );

    const accessByType = useMemo<SpaceAccessByType>(() => {
        const getDirectOrHighestAccess = (
            existing: SpaceShare,
            current: SpaceShare,
        ) => {
            const roleOrder = {
                // higher roles have higher numbers
                [SpaceMemberRole.VIEWER]: 1,
                [SpaceMemberRole.EDITOR]: 2,
                [SpaceMemberRole.ADMIN]: 3,
            };

            // if one has direct access, return it
            if (existing.hasDirectAccess !== current.hasDirectAccess) {
                if (existing.hasDirectAccess) {
                    return existing;
                } else {
                    return current;
                }
            }
            // otherwise, return the one with the highest role
            const existingRoleNumber = roleOrder[existing.role];
            const currentRoleNumber = roleOrder[current.role];
            return currentRoleNumber > existingRoleNumber ? current : existing;
        };

        const userAccessMap = space.access.reduce<Map<string, SpaceShare>>(
            (acc, spaceShare) => {
                const existing = acc.get(spaceShare.userUuid);
                acc.set(
                    spaceShare.userUuid,
                    existing
                        ? getDirectOrHighestAccess(existing, spaceShare)
                        : spaceShare,
                );
                return acc;
            },
            new Map<string, SpaceShare>(),
        );

        const result = Array.from(userAccessMap.values()).reduce<{
            project: SpaceShare[];
            organisation: SpaceShare[];
            direct: SpaceShare[];
        }>(
            (acc, spaceShare) => {
                if (spaceShare.hasDirectAccess) {
                    acc.direct.push(spaceShare);
                } else if (
                    spaceShare.inheritedFrom === 'project' ||
                    spaceShare.inheritedFrom === 'group'
                ) {
                    acc.project.push(spaceShare);
                } else if (spaceShare.inheritedFrom === 'organization') {
                    acc.organisation.push(spaceShare);
                }
                return acc;
            },
            {
                project: [],
                organisation: [],
                direct: [],
            },
        );

        return {
            project: result.project,
            organisation: result.organisation,
            direct: result.direct,
        };
    }, [space]);

    return (
        <Stack spacing={'xs'}>
            {(accessByType.organisation.length > 0 ||
                accessByType.project.length > 0) && (
                <Text fw={400} span c="gray.6">
                    {t('components_common_share_space_modal.inherited_access')}
                </Text>
            )}
            {accessByType.organisation.length > 0 && (
                <ListCollapse
                    icon={IconBuildingBank}
                    label={t(
                        'components_common_share_space_modal.from_organisation',
                    )}
                    accessCount={accessByType.organisation.length}
                >
                    <UserAccessList
                        isPrivate={space.isPrivate}
                        accessList={accessByType.organisation}
                        sessionUser={sessionUser}
                        onAccessChange={handleAccessChange}
                        disabled={disabled}
                    />
                </ListCollapse>
            )}
            {accessByType.project.length > 0 && (
                <ListCollapse
                    icon={IconDatabase}
                    label={t(
                        'components_common_share_space_modal.from_project',
                    )}
                    accessCount={accessByType.project.length}
                >
                    <UserAccessList
                        isPrivate={space.isPrivate}
                        accessList={accessByType.project}
                        sessionUser={sessionUser}
                        onAccessChange={handleAccessChange}
                        disabled={disabled}
                    />
                </ListCollapse>
            )}
            {space.access.length > 0 && (
                <>
                    <Text fw={400} span c="gray.6">
                        {t('components_common_share_space_modal.group_access')}
                    </Text>
                    <GroupsAccessList
                        disabled={disabled}
                        isPrivate={space.isPrivate}
                        groupsAccess={space.groupsAccess}
                        onAccessChange={handleGroupAccessChange}
                        pageSize={5}
                    />
                </>
            )}
            {accessByType.direct.length > 0 && (
                <>
                    <Text fw={400} span c="gray.6">
                        {t('components_common_share_space_modal.user_access')}
                    </Text>
                    <UserAccessList
                        isPrivate={space.isPrivate}
                        accessList={accessByType.direct}
                        sessionUser={sessionUser}
                        onAccessChange={handleAccessChange}
                        pageSize={5}
                        disabled={disabled}
                    />
                </>
            )}
        </Stack>
    );
};
