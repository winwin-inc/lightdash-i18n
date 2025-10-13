import {
    OrganizationMemberRole,
    type OrganizationMemberProfile,
    type Space,
} from '@lightdash/common';
import {
    Avatar,
    Badge,
    Button,
    Center,
    Group,
    Loader,
    MultiSelect,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    type ScrollAreaProps,
    type SelectItem,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconUsers } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import uniqBy from 'lodash/uniqBy';
import {
    forwardRef,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useInfiniteOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import {
    useAddGroupSpaceShareMutation,
    useAddSpaceShareMutation,
} from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';
import { DEFAULT_PAGE_SIZE } from '../Table/constants';
import { useUserAccessOptions } from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

interface ShareSpaceAddUserProps {
    space: Space;
    projectUuid: string;
    disabled?: boolean;
}

export const ShareSpaceAddUser: FC<ShareSpaceAddUserProps> = ({
    space,
    projectUuid,
    disabled = false,
}) => {
    const { t } = useTranslation();
    const UserAccessOptions = useUserAccessOptions();

    const [usersSelected, setUsersSelected] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const { data: projectAccess } = useProjectAccess(projectUuid);
    const selectScrollRef = useRef<HTMLDivElement>(null);
    const { mutateAsync: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const { mutateAsync: shareGroupSpaceMutation } =
        useAddGroupSpaceShareMutation(projectUuid, space.uuid);

    const {
        data: infiniteOrganizationGroups,
        fetchNextPage: fetchGroupsNextPage,
        hasNextPage: hasGroupsNextPage,
        isFetching: isGroupsFetching,
    } = useInfiniteOrganizationGroups(
        {
            searchInput: debouncedSearchQuery,
            includeMembers: 1,
            pageSize: DEFAULT_PAGE_SIZE,
        },
        { keepPreviousData: true },
    );

    const {
        data: infiniteOrganizationUsers,
        fetchNextPage: fetchUsersNextPage,
        hasNextPage: hasUsersNextPage,
        isFetching: isUsersFetching,
    } = useInfiniteOrganizationUsers(
        {
            searchInput: debouncedSearchQuery,
            pageSize: DEFAULT_PAGE_SIZE,
            projectUuid,
            includeGroups: 10,
        },
        { keepPreviousData: true },
    );

    // Aggregates all fetched users across pages and search queries into a unified list.
    // This ensures that previously fetched users are preserved even when the search query changes.
    // Uses 'userUuid' to remove duplicates and maintain a consistent set of unique users.
    const [allSearchedOrganizationUsers, setAllSearchedOrganizationUsers] =
        useState<OrganizationMemberProfile[]>([]);
    useEffect(() => {
        const allPages =
            infiniteOrganizationUsers?.pages.map((p) => p.data).flat() ?? [];

        setAllSearchedOrganizationUsers((previousState) =>
            uniqBy([...previousState, ...allPages], 'userUuid'),
        );
    }, [infiniteOrganizationUsers?.pages]);

    const groups = useMemo(
        () => infiniteOrganizationGroups?.pages.map((p) => p.data).flat(),
        [infiniteOrganizationGroups?.pages],
    );

    const organizationUsers = useMemo(
        () => infiniteOrganizationUsers?.pages.map((p) => p.data).flat(),
        [infiniteOrganizationUsers?.pages],
    );

    const userUuids: string[] = useMemo(() => {
        const projectUserUuids =
            projectAccess?.map((project) => project.userUuid) || [];

        const orgUserUuids =
            organizationUsers
                ?.filter((user) => user.role !== OrganizationMemberRole.MEMBER)
                .map((user) => user.userUuid) ?? [];

        return [...new Set([...projectUserUuids, ...orgUserUuids])];
    }, [organizationUsers, projectAccess]);

    const UserItemComponent = useMemo(() => {
        return forwardRef<HTMLDivElement, SelectItem>((props, ref) => {
            if (props.group === 'Groups') {
                return (
                    <Group ref={ref} {...props} position={'apart'}>
                        <Group>
                            <Avatar size="md" radius="xl" color="blue">
                                <MantineIcon icon={IconUsers} />
                            </Avatar>
                            <Stack spacing="two">
                                <Text fw={500}>{props.label}</Text>
                            </Stack>
                        </Group>
                    </Group>
                );
            }

            const user = allSearchedOrganizationUsers.find(
                (userAccess) => userAccess.userUuid === props.value,
            );

            if (!user) return null;

            const spaceAccess = space.access.find(
                (access) => access.userUuid === user.userUuid,
            );
            const currentSpaceRoleTitle = spaceAccess
                ? UserAccessOptions.find(
                      (option) => option.value === spaceAccess.role,
                  )?.title ?? t('components_common_share_space_modal.no_access')
                : t('components_common_share_space_modal.no_access');

            const spaceRoleInheritanceInfo = t(
                'components_common_share_space_modal.space_role_inheritance_info',
                {
                    inheritedFrom: spaceAccess?.inheritedFrom,
                },
            );

            return (
                <Group ref={ref} {...props} position={'apart'}>
                    <Tooltip
                        label={spaceRoleInheritanceInfo}
                        position="top"
                        disabled={spaceAccess === undefined}
                    >
                        <Group>
                            <Avatar size="md" radius="xl" color="blue">
                                {getInitials(
                                    user.userUuid,
                                    user.firstName,
                                    user.lastName,
                                    user.email,
                                )}
                            </Avatar>
                            <Stack spacing="two">
                                {user.firstName || user.lastName ? (
                                    <>
                                        <Text fw={500}>
                                            {user.firstName} {user.lastName}
                                        </Text>

                                        <Text size={'xs'} color="dimmed">
                                            {user.email}
                                        </Text>
                                    </>
                                ) : (
                                    <Text fw={500}>{user.email}</Text>
                                )}
                            </Stack>
                        </Group>
                    </Tooltip>

                    <Badge size="xs" color="gray.6" radius="xs">
                        {currentSpaceRoleTitle}
                    </Badge>
                </Group>
            );
        });
    }, [allSearchedOrganizationUsers, space.access, t, UserAccessOptions]);

    const data = useMemo(() => {
        const userUuidsAndSelected = uniq([...userUuids, ...usersSelected]);

        const usersSet = userUuidsAndSelected.map(
            (userUuid): SelectItem | null => {
                const user = allSearchedOrganizationUsers.find(
                    (a) => a.userUuid === userUuid,
                );

                if (!user) return null;

                const hasDirectAccess = !!(space.access || []).find(
                    (access) => access.userUuid === userUuid,
                )?.hasDirectAccess;

                if (hasDirectAccess) return null;

                return {
                    value: userUuid,
                    label: getUserNameOrEmail(
                        user.userUuid,
                        user.firstName,
                        user.lastName,
                        user.email,
                    ),
                    group: 'Users',
                    email: user.email,
                };
            },
        );

        const groupsSet = groups
            ?.filter(
                (group) =>
                    !space.groupsAccess.some(
                        (ga) => ga.groupUuid === group.uuid,
                    ),
            )
            .map((group): SelectItem | null => {
                return {
                    value: group.uuid,
                    label: group.name,
                    group: 'Groups',
                };
            });

        return [...usersSet, ...(groupsSet ?? [])].filter(
            (item): item is SelectItem => item !== null,
        );
    }, [
        userUuids,
        usersSelected,
        groups,
        allSearchedOrganizationUsers,
        space.access,
        space.groupsAccess,
    ]);

    useEffect(() => {
        selectScrollRef.current?.scrollTo({
            top: selectScrollRef.current?.scrollHeight,
        });
    }, [data]);

    return (
        <Group>
            <MultiSelect
                style={{ flex: 1 }}
                withinPortal
                searchable
                clearable
                clearSearchOnChange
                clearSearchOnBlur
                placeholder={t(
                    'components_common_share_space_modal.select_users.placeholder',
                )}
                nothingFound={t(
                    'components_common_share_space_modal.select_users.nothingFound',
                )}
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                value={usersSelected}
                onChange={setUsersSelected}
                data={data}
                itemComponent={UserItemComponent}
                maxDropdownHeight={300}
                disabled={disabled}
                dropdownComponent={({ children, ...rest }: ScrollAreaProps) => (
                    <ScrollArea {...rest} viewportRef={selectScrollRef}>
                        {isUsersFetching || isGroupsFetching ? (
                            <Center h={300}>
                                <Loader size="md" />
                            </Center>
                        ) : (
                            <>
                                {children}
                                {(hasUsersNextPage || hasGroupsNextPage) && (
                                    <Button
                                        size="xs"
                                        variant="white"
                                        onClick={async () => {
                                            await Promise.all([
                                                fetchGroupsNextPage(),
                                                fetchUsersNextPage(),
                                            ]);
                                        }}
                                        disabled={
                                            disabled ||
                                            isUsersFetching ||
                                            isGroupsFetching
                                        }
                                    >
                                        <Text>
                                            {t(
                                                'components_common_share_space_modal.select_users.load_more',
                                            )}
                                        </Text>
                                    </Button>
                                )}
                            </>
                        )}
                    </ScrollArea>
                )}
                filter={(searchString, selected, item) => {
                    return Boolean(
                        item.group === 'Users' ||
                            selected ||
                            item.label
                                ?.toLowerCase()
                                .includes(searchString.toLowerCase()),
                    );
                }}
            />

            <Button
                disabled={disabled || usersSelected.length === 0}
                onClick={async () => {
                    for (const uuid of usersSelected) {
                        const selectedValue = data.find(
                            (item) => item.value === uuid,
                        );
                        if (selectedValue?.group === 'Users') {
                            await shareSpaceMutation([uuid, 'viewer']);
                        } else {
                            await shareGroupSpaceMutation([uuid, 'viewer']);
                        }
                    }
                    setUsersSelected([]);
                }}
            >
                {t('components_common_share_space_modal.share')}
            </Button>
        </Group>
    );
};
