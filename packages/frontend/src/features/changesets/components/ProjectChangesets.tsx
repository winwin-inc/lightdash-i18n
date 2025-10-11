import {
    assertUnreachable,
    type Change,
    type ChangesetWithChanges,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { modals } from '@mantine/modals';
import {
    IconAlertCircle,
    IconArrowBackUp,
    IconClock,
    IconTable,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { MRT_Localization_EN } from 'mantine-react-table/locales/en';
import { MRT_Localization_ZH_HANS } from 'mantine-react-table/locales/zh-Hans';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import {
    useActiveChangesets,
    useRevertAllChanges,
    useRevertChange,
} from '../hooks';

dayjs.extend(relativeTime);

type Props = {
    projectUuid: string;
};

const getChangeTypeBadgeProps = (
    type: 'create' | 'update' | 'delete',
): { color: string; variant: 'light' } => {
    switch (type) {
        case 'create':
            return { color: 'green', variant: 'light' as const };
        case 'update':
            return { color: 'blue', variant: 'light' as const };
        case 'delete':
            return { color: 'red', variant: 'light' as const };
        default:
            return assertUnreachable(type, `Unknown change type: ${type}`);
    }
};

const formatDateTime = (date: Date): string => {
    return dayjs(date).format('MMM D, YYYY HH:mm');
};

const getUserDisplayName = (
    userUuid: string,
    organizationUsers:
        | Array<{
              userUuid: string;
              firstName: string;
              lastName: string;
              email: string;
          }>
        | undefined,
): string => {
    const user = organizationUsers?.find((u) => u.userUuid === userUuid);
    if (!user) return userUuid.slice(0, 8);
    return user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.email;
};

export const ProjectChangesets: FC<Props> = ({ projectUuid }) => {
    const { t, i18n } = useTranslation();
    const isZh = i18n.language === 'zh';

    const theme = useMantineTheme();
    const { showToastSuccess, showToastApiError } = useToaster();

    const {
        data: changesets,
        isLoading,
        error,
    } = useActiveChangesets(projectUuid);

    const extractChangeValue = useCallback(
        (change: Change): string | { path: string; value: string }[] => {
            switch (change.type) {
                case 'create':
                    return t(
                        'features_changesets_project_changesets.create_new_item',
                    );
                case 'delete':
                    return t(
                        'features_changesets_project_changesets.delete_item',
                    );
                case 'update':
                    return change.payload.patches.map((patch) => ({
                        path: patch.path.replace('/', ''),
                        value: String(patch.value),
                    }));

                default:
                    return assertUnreachable(change, `Unknown change type`);
            }
        },
        [t],
    );

    const { data: organizationUsers } = useOrganizationUsers();

    const revertChangeMutation = useRevertChange(projectUuid);
    const revertAllChangesMutation = useRevertAllChanges(projectUuid);

    const allChanges = useMemo(() => {
        if (!changesets) return [];

        return changesets.changes.flatMap((change) => change);
    }, [changesets]);

    const handleRevertChange = (changeUuid: string, entityName: string) => {
        modals.openConfirmModal({
            title: t(
                'features_changesets_project_changesets.revert_change.title',
            ),
            children: (
                <Text>
                    {t(
                        'features_changesets_project_changesets.revert_change.content.part_1',
                    )}{' '}
                    <Text span fw={600}>
                        {entityName}
                    </Text>{' '}
                    {t(
                        'features_changesets_project_changesets.revert_change.content.part_2',
                    )}
                </Text>
            ),
            labels: {
                confirm: t(
                    'features_changesets_project_changesets.revert_change.revert',
                ),
                cancel: t(
                    'features_changesets_project_changesets.revert_change.cancel',
                ),
            },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                revertChangeMutation.mutate(
                    { changeUuid },
                    {
                        onSuccess: () => {
                            showToastSuccess({
                                title: t(
                                    'features_changesets_project_changesets.revert_change.success',
                                ),
                            });
                        },
                        onError: (e) => {
                            showToastApiError({
                                title: t(
                                    'features_changesets_project_changesets.revert_change.error',
                                ),
                                apiError: e.error,
                            });
                        },
                    },
                );
            },
        });
    };

    const handleRevertAllChanges = () => {
        modals.openConfirmModal({
            title: t(
                'features_changesets_project_changesets.revert_all_changes.title',
            ),
            children: (
                <Text>
                    {t(
                        'features_changesets_project_changesets.revert_all_changes.content.part_1',
                    )}{' '}
                    <Text span fw={600}>
                        {allChanges.length}{' '}
                        {t(
                            'features_changesets_project_changesets.revert_all_changes.content.part_2',
                            { suffix: allChanges.length !== 1 ? 's' : '' },
                        )}
                    </Text>
                    {t(
                        'features_changesets_project_changesets.revert_all_changes.content.part_3',
                    )}
                </Text>
            ),
            labels: {
                confirm: t(
                    'features_changesets_project_changesets.revert_all_changes.revert',
                ),
                cancel: t(
                    'features_changesets_project_changesets.revert_all_changes.cancel',
                ),
            },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                revertAllChangesMutation.mutate(undefined, {
                    onSuccess: () => {
                        showToastSuccess({
                            title: t(
                                'features_changesets_project_changesets.revert_all_changes.success',
                            ),
                        });
                    },
                    onError: (e) => {
                        showToastApiError({
                            title: t(
                                'features_changesets_project_changesets.revert_all_changes.error',
                            ),
                            apiError: e.error,
                        });
                    },
                });
            },
        });
    };

    const columns: MRT_ColumnDef<ChangesetWithChanges['changes'][0]>[] =
        useMemo(
            () => [
                {
                    accessorKey: 'entityName',
                    header: '',
                    enableSorting: false,
                    size: 150,
                    Cell: ({ row }) => {
                        const change = row.original;
                        return (
                            <Tooltip
                                withinPortal
                                label={
                                    <Group gap="xs">
                                        <MantineIcon
                                            icon={IconTable}
                                            size={16}
                                        />
                                        <Text size="sm">
                                            {change.entityTableName}
                                        </Text>
                                    </Group>
                                }
                            >
                                <Text
                                    fw={500}
                                    fz="sm"
                                    truncate
                                    style={{ cursor: 'help' }}
                                >
                                    {change.entityName}
                                </Text>
                            </Tooltip>
                        );
                    },
                },
                {
                    accessorKey: 'change',
                    header: t('features_changesets_project_changesets.change'),
                    enableSorting: false,
                    size: 200,

                    Cell: ({ row }) => {
                        const isTruncated = useIsTruncated<HTMLDivElement>();
                        const change = row.original;
                        const changeValue = extractChangeValue(change);

                        return (
                            <Group gap="xs" align="center">
                                <Badge
                                    {...getChangeTypeBadgeProps(change.type)}
                                    radius="sm"
                                    size="sm"
                                    fw={400}
                                    tt="capitalize"
                                >
                                    {change.type}
                                </Badge>
                                {typeof changeValue === 'string' ? (
                                    <Text fz="xs">{changeValue}</Text>
                                ) : (
                                    <>
                                        <Tooltip
                                            withinPortal
                                            label={changeValue.map((patch) => (
                                                <Text key={patch.path} fz="xs">
                                                    {patch.value}
                                                </Text>
                                            ))}
                                            disabled={!isTruncated.isTruncated}
                                        >
                                            <Box>
                                                {changeValue.map((patch) => (
                                                    <Text
                                                        key={patch.path}
                                                        fz="xs"
                                                        maw={280}
                                                        truncate
                                                        ref={isTruncated.ref}
                                                    >
                                                        <Text
                                                            fw={500}
                                                            fz="xs"
                                                            span
                                                        >
                                                            {patch.path}:{' '}
                                                        </Text>
                                                        {patch.value}
                                                    </Text>
                                                ))}
                                            </Box>
                                        </Tooltip>
                                    </>
                                )}
                            </Group>
                        );
                    },
                },
                {
                    accessorKey: 'createdByUserUuid',
                    header: t(
                        'features_changesets_project_changesets.created_by',
                    ),
                    enableSorting: false,
                    size: 200,
                    Cell: ({ row }) => {
                        const change = row.original;
                        const userName = getUserDisplayName(
                            change.createdByUserUuid,
                            organizationUsers,
                        );

                        return (
                            <Group gap="xs" align="center">
                                <Tooltip
                                    withinPortal
                                    label={formatDateTime(change.createdAt)}
                                >
                                    <Box style={{ cursor: 'help' }}>
                                        <MantineIcon
                                            icon={IconClock}
                                            size={16}
                                            color="gray.6"
                                        />
                                    </Box>
                                </Tooltip>
                                <Text fz="sm" truncate>
                                    {userName}
                                </Text>
                            </Group>
                        );
                    },
                },
            ],
            [organizationUsers, extractChangeValue, t],
        );

    const table = useMantineReactTable({
        columns,
        data: allChanges,
        enableStickyHeader: true,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enableRowVirtualization: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: false,
        enableTopToolbar: false,
        localization: isZh ? MRT_Localization_ZH_HANS : MRT_Localization_EN,
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.gray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            sx: {
                maxHeight: 500,
                minHeight: '300px',
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(allChanges.length),
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
                'th > div > div:last-child': {
                    top: -10,
                    right: -5,
                },
                'th > div > div:last-child > .mantine-Divider-root': {
                    border: 'none',
                },
            },
        },
        mantineTableHeadCellProps: (props) => {
            const isAnyColumnResizing = props.table
                .getAllColumns()
                .some((c) => c.getIsResizing());

            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            const canResize = props.column.getCanResize();

            return {
                bg: 'gray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.gray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
                sx: {
                    justifyContent: 'center',
                    '&:hover': canResize
                        ? {
                              borderRight: !isAnyColumnResizing
                                  ? `2px solid ${theme.colors.blue[3]} !important`
                                  : undefined,
                              transition: `border-right ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                          }
                        : {},
                },
            };
        },
        mantineTableBodyRowProps: () => {
            return {
                sx: {
                    cursor: 'pointer',
                    '&:hover': {
                        td: {
                            backgroundColor: theme.colors.gray[0],
                            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                        },
                    },
                },
            };
        },
        renderBottomToolbar: () => (
            <Box
                p="sm"
                fz="xs"
                fw={500}
                c="gray.8"
                style={{
                    borderTop: `1px solid ${theme.colors.gray[3]}`,
                }}
            >
                <Text fz="xs" c="gray.8">
                    {allChanges.length} change
                    {allChanges.length !== 1 ? 's' : ''} found
                </Text>
            </Box>
        ),
        enableRowActions: true,
        positionActionsColumn: 'last',
        renderRowActions: ({ row }) => {
            const isLastRow = row.index === allChanges.length - 1;
            const isReverting =
                revertChangeMutation.isLoading &&
                revertChangeMutation.variables?.changeUuid ===
                    row.original.changeUuid;

            if (!isLastRow) {
                return null;
            }

            return (
                <Box>
                    <Button
                        variant="default"
                        size="compact-xs"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleRevertChange(
                                row.original.changeUuid,
                                row.original.entityName,
                            );
                        }}
                        loading={isReverting}
                        leftSection={<MantineIcon icon={IconArrowBackUp} />}
                    >
                        {t('features_changesets_project_changesets.revert')}
                    </Button>
                </Box>
            );
        },
    });

    // Handle loading state
    if (isLoading) {
        return (
            <Box p="xl" style={{ textAlign: 'center' }}>
                <Loader size="lg" />
                <Text mt="md" c="gray.6">
                    {t('features_changesets_project_changesets.loading')}
                </Text>
            </Box>
        );
    }

    // Handle error state
    if (error) {
        return (
            <Alert
                icon={<MantineIcon icon={IconAlertCircle} />}
                title={t('features_changesets_project_changesets.error')}
                color="red"
                variant="light"
            >
                {t(
                    'features_changesets_project_changesets.failed_to_load_changesets',
                )}
            </Alert>
        );
    }

    // Handle empty state
    if (!changesets || changesets.changes.length === 0) {
        return (
            <Box p="xl" style={{ textAlign: 'center' }}>
                <Text c="gray.6">
                    {t(
                        'features_changesets_project_changesets.no_active_changesets',
                    )}
                </Text>
            </Box>
        );
    }

    // Handle no changes in changesets
    if (allChanges.length === 0) {
        return (
            <Box p="xl" style={{ textAlign: 'center' }}>
                <Text c="gray.6">
                    {t(
                        'features_changesets_project_changesets.no_changes_found_in_active_changesets',
                    )}
                </Text>
            </Box>
        );
    }

    return (
        <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
                <Stack gap="xs">
                    <Title order={5}>
                        {t('features_changesets_project_changesets.changesets')}
                    </Title>
                    <Text c="gray.6" fz="sm">
                        {t(
                            'features_changesets_project_changesets.changesets_description',
                        )}
                    </Text>
                </Stack>
                {allChanges.length > 0 && (
                    <Button
                        variant="default"
                        radius="md"
                        size="compact-sm"
                        onClick={handleRevertAllChanges}
                        loading={revertAllChangesMutation.isLoading}
                        leftSection={<MantineIcon icon={IconArrowBackUp} />}
                    >
                        {t('features_changesets_project_changesets.revert_all')}
                    </Button>
                )}
            </Group>
            <MantineReactTable table={table} />
        </Stack>
    );
};
