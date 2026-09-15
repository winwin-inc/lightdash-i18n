import { PROJECT_OPERATION_LOG_ACTIONS } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    CopyButton,
    Divider,
    Drawer,
    Group,
    Modal,
    NumberInput,
    Paper,
    Select,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import PaginateControl from '../common/PaginateControl';
import { TABLE_PAGINATION_PAGE_SIZES } from '../common/Table/constants';
import { compactSelectStyles } from '../common/Table/paginationCompactStyles';
import { ResultCount } from '../common/Table/TablePagination';
import {
    useProjectOperationLog,
    useProjectOperationLogs,
    usePurgeProjectOperationLogs,
} from '../../hooks/useProjectOperationLogs';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

type Props = {
    projectUuid: string;
};

const ACTION_OPTIONS = Object.values(PROJECT_OPERATION_LOG_ACTIONS);

const RESOURCE_TYPE_OPTIONS = [
    'dashboard',
    'dashboard_filter',
    'chart',
    'project',
    'operation_log',
] as const;


const actionLabelKey = (action: string) =>
    `components_settings_operation_logs.actions.${action.replace(/\./g, '_')}`;

const resourceTypeLabelKey = (resourceType: string) =>
    `components_settings_operation_logs.resource_types.${resourceType}`;

const statusLabelKey = (status: string) =>
    `components_settings_operation_logs.statuses.${status}`;

const isEmptyValue = (value: unknown): boolean =>
    value === null ||
    value === undefined ||
    value === '' ||
    value === 'null' ||
    value === 'undefined';

const cleanSummary = (value: unknown): unknown => {
    if (isEmptyValue(value)) return undefined;
    if (Array.isArray(value)) {
        const next = value
            .map((item) => cleanSummary(item))
            .filter((item) => item !== undefined);
        return next.length > 0 ? next : undefined;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => [key, cleanSummary(item)] as const)
            .filter(([, item]) => item !== undefined);
        if (entries.length === 0) return undefined;
        return Object.fromEntries(entries);
    }
    return value;
};

const formatSummaryValue = (value: unknown): string => {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const translateSummaryValue = (
    key: string,
    value: unknown,
    t: TFunction,
): string => {
    if (typeof value === 'string') {
        if (
            key === 'scope' ||
            key === 'source' ||
            key === 'kind' ||
            key === 'changeKind'
        ) {
            return t(
                `components_settings_operation_logs.summary_values.${value}`,
                { defaultValue: value },
            );
        }
    }
    return formatSummaryValue(value);
};

const SummaryView: FC<{ summary: unknown }> = ({ summary }) => {
    const { t } = useTranslation();
    const cleaned = cleanSummary(summary);
    if (cleaned === undefined) {
        return (
            <Text size="xs" color="dimmed">
                {t('components_settings_operation_logs.detail_no_summary', { defaultValue: '-' })}
            </Text>
        );
    }

    if (typeof cleaned !== 'object' || cleaned === null || Array.isArray(cleaned)) {
        return (
            <Text size="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {formatSummaryValue(cleaned)}
            </Text>
        );
    }

    const entries = Object.entries(cleaned as Record<string, unknown>);
    return (
        <Stack spacing={6}>
            {entries.map(([key, value]) => (
                <Group key={key} spacing={6} align="flex-start" noWrap>
                    <Text size="xs" color="dimmed" miw={110} style={{ flexShrink: 0 }}>
                        {t(
                            `components_settings_operation_logs.summary_keys.${key}`,
                            { defaultValue: key },
                        )}
                    </Text>
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {translateSummaryValue(key, value, t)}
                    </Text>
                </Group>
            ))}
        </Stack>
    );
};


const ActorDisplay: FC<{
    display: string | null | undefined;
    email: string | null | undefined;
}> = ({ display, email }) => {
    const { t } = useTranslation();
    const label = display || email || '-';
    if (!email) {
        return <Text size="xs">{label}</Text>;
    }

    return (
        <CopyButton value={email} timeout={1500}>
            {({ copied, copy }) => (
                <Tooltip
                    label={
                        copied
                            ? t(
                                  'components_settings_operation_logs.copy_email_done',
                              )
                            : t(
                                  'components_settings_operation_logs.copy_email_tip',
                              )
                    }
                    withArrow
                    position="top"
                >
                    <UnstyledButton
                        onClick={copy}
                        sx={(theme) => ({
                            maxWidth: '100%',
                            textAlign: 'left',
                            color: theme.colors.blue[6],
                            fontSize: theme.fontSizes.xs,
                            lineHeight: 1.4,
                            wordBreak: 'break-all',
                            '&:hover': {
                                textDecoration: 'underline',
                            },
                        })}
                    >
                        {label}
                    </UnstyledButton>
                </Tooltip>
            )}
        </CopyButton>
    );
};

const DetailRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Stack spacing={2}>
        <Text size="xs" color="dimmed">
            {label}
        </Text>
        <Text size="sm">{children}</Text>
    </Stack>
);

const SettingsOperationLogs: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation();
    const { cx, classes } = useTableStyles();

    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [q, setQ] = useState('');
    const [action, setAction] = useState<string | null>(null);
    const [resourceType, setResourceType] = useState<string | null>(null);
    const [actorEmail, setActorEmail] = useState('');
    const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
        dayjs().subtract(6, 'day').startOf('day').toDate(),
        dayjs().endOf('day').toDate(),
    ]);
    const [debouncedQ] = useDebouncedValue(q, 300);
    const [debouncedActorEmail] = useDebouncedValue(actorEmail, 300);

    useEffect(() => {
        setPage(1);
    }, [debouncedQ, debouncedActorEmail]);
    const [selectedUuid, setSelectedUuid] = useState<string | undefined>();
    const [purgeOpened, { open: openPurge, close: closePurge }] =
        useDisclosure(false);
    const [beforeDays, setBeforeDays] = useState<number>(90);

    const filters = useMemo(
        () => ({
            page,
            pageSize,
            q: debouncedQ.trim() || undefined,
            action: action || undefined,
            resourceType: resourceType || undefined,
            actorEmail: debouncedActorEmail.trim() || undefined,
            from: dateRange[0]
                ? dayjs(dateRange[0]).startOf('day').toISOString()
                : undefined,
            to: dateRange[1]
                ? dayjs(dateRange[1]).endOf('day').toISOString()
                : undefined,
        }),
        [
            page,
            pageSize,
            debouncedQ,
            action,
            resourceType,
            debouncedActorEmail,
            dateRange,
        ],
    );

    const { data, isLoading, isError } = useProjectOperationLogs(
        projectUuid,
        filters,
    );
    const { data: detail } = useProjectOperationLog(projectUuid, selectedUuid);
    const { mutateAsync: purge, isLoading: isPurging } =
        usePurgeProjectOperationLogs(projectUuid);

    const totalPages = data
        ? Math.max(
              1,
              Math.ceil(data.pagination.totalResults / data.pagination.pageSize),
          )
        : 1;

    const handlePurge = async () => {
        try {
            const result = await purge({ beforeDays });
            notifications.show({
                color: 'green',
                title: t('components_settings_operation_logs.purge_success_title'),
                message: t(
                    'components_settings_operation_logs.purge_success_message',
                    { count: result.deletedCount },
                ),
            });
            closePurge();
        } catch (e) {
            notifications.show({
                color: 'red',
                title: t('components_settings_operation_logs.purge_error_title'),
                message:
                    e instanceof Error
                        ? e.message
                        : t(
                              'components_settings_operation_logs.purge_error_fallback',
                          ),
            });
        }
    };

    if (isError) {
        return (
            <SuboptimalState
                title={t('components_settings_operation_logs.load_error')}
            />
        );
    }

    return (
        <Stack spacing="sm">
            <Group position="right">
                <Button
                    color="red"
                    variant="light"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconTrash} />}
                    onClick={openPurge}
                >
                    {t('components_settings_operation_logs.purge_button')}
                </Button>
            </Group>

            <SimpleGrid
                cols={5}
                spacing="xs"
                breakpoints={[
                    { maxWidth: 'lg', cols: 3 },
                    { maxWidth: 'md', cols: 2 },
                    { maxWidth: 'sm', cols: 1 },
                ]}
            >
                <DatePickerInput
                    type="range"
                    size="xs"
                    label={t('components_settings_operation_logs.filter_date')}
                    placeholder={[
                        t(
                            'components_settings_operation_logs.filter_date_placeholder',
                        ),
                        t(
                            'components_settings_operation_logs.filter_date_placeholder',
                        ),
                    ]}
                    value={dateRange}
                    onChange={(value) => {
                        setDateRange(value);
                        setPage(1);
                    }}
                    clearable
                    styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                />
                <Select
                    size="xs"
                    label={t('components_settings_operation_logs.filter_action')}
                    placeholder={t(
                        'components_settings_operation_logs.filter_action_placeholder',
                    )}
                    data={ACTION_OPTIONS.map((value) => ({
                        value,
                        label: t(actionLabelKey(value), { defaultValue: value }),
                    }))}
                    value={action}
                    onChange={(v) => {
                        setAction(v);
                        setPage(1);
                    }}
                    clearable
                    searchable
                    styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                />
                <Select
                    size="xs"
                    label={t(
                        'components_settings_operation_logs.filter_resource_type',
                    )}
                    placeholder={t(
                        'components_settings_operation_logs.filter_resource_type_placeholder',
                    )}
                    data={RESOURCE_TYPE_OPTIONS.map((value) => ({
                        value,
                        label: t(resourceTypeLabelKey(value), { defaultValue: value }),
                    }))}
                    value={resourceType}
                    onChange={(v) => {
                        setResourceType(v);
                        setPage(1);
                    }}
                    clearable
                    searchable
                    styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                />
                <TextInput
                    size="xs"
                    label={t('components_settings_operation_logs.filter_actor')}
                    placeholder={t(
                        'components_settings_operation_logs.filter_actor_placeholder',
                    )}
                    value={actorEmail}
                    onChange={(e) => {
                        setActorEmail(e.currentTarget.value);
                    }}
                    styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                />
                <TextInput
                    size="xs"
                    label={t('components_settings_operation_logs.filter_search')}
                    placeholder={t(
                        'components_settings_operation_logs.filter_search_placeholder',
                    )}
                    value={q}
                    onChange={(e) => {
                        setQ(e.currentTarget.value);
                    }}
                    styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                />
            </SimpleGrid>

            <Paper withBorder radius="sm">
                <Table
                    className={cx(classes.root)}
                    highlightOnHover
                    fontSize="xs"
                    horizontalSpacing="sm"
                    verticalSpacing="xs"
                >
                    <thead>
                        <tr>
                            <th>
                                {t(
                                    'components_settings_operation_logs.columns.time',
                                )}
                            </th>
                            <th>
                                {t(
                                    'components_settings_operation_logs.columns.actor',
                                )}
                            </th>
                            <th>
                                {t(
                                    'components_settings_operation_logs.columns.action',
                                )}
                            </th>
                            <th>
                                {t(
                                    'components_settings_operation_logs.columns.resource_type',
                                )}
                            </th>
                            <th>
                                {t(
                                    'components_settings_operation_logs.columns.resource_name',
                                )}
                            </th>
                            <th>
                                {t(
                                    'components_settings_operation_logs.columns.status',
                                )}
                            </th>
                            <th>
                                {t(
                                    'components_settings_operation_logs.columns.detail',
                                )}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={7}>
                                    <Text p="sm" color="dimmed" size="xs">
                                        {t(
                                            'components_settings_operation_logs.loading',
                                        )}
                                    </Text>
                                </td>
                            </tr>
                        ) : data?.data.length ? (
                            data.data.map((row) => (
                                <tr
                                    key={row.operationLogUuid}
                                    style={
                                        row.status === 'failure'
                                            ? {
                                                  backgroundColor: '#fff5f5',
                                              }
                                            : undefined
                                    }
                                >
                                    <td>
                                        {dayjs(row.createdAt).format(
                                            'YYYY-MM-DD HH:mm:ss',
                                        )}
                                    </td>
                                    <td>
                                        <ActorDisplay
                                            display={row.actorDisplay}
                                            email={row.actorEmail}
                                        />
                                    </td>
                                    <td>
                                        {t(actionLabelKey(row.action), {
                                            defaultValue: row.action,
                                        })}
                                    </td>
                                    <td>
                                        {t(resourceTypeLabelKey(row.resourceType), {
                                            defaultValue: row.resourceType,
                                        })}
                                    </td>
                                    <td>
                                        {row.resourceType === 'dashboard' &&
                                        row.resourceUuid ? (
                                            <Anchor
                                                size="xs"
                                                onClick={() =>
                                                    navigate(
                                                        `/projects/${projectUuid}/dashboards/${row.resourceUuid}`,
                                                    )
                                                }
                                            >
                                                {row.resourceName ||
                                                    row.resourceUuid}
                                            </Anchor>
                                        ) : (
                                            row.resourceName || '-'
                                        )}
                                    </td>
                                    <td>
                                        <Badge
                                            size="xs"
                                            variant="light"
                                            color={
                                                row.status === 'failure'
                                                    ? 'red'
                                                    : 'green'
                                            }
                                        >
                                            {t(statusLabelKey(row.status), {
                                                defaultValue: row.status,
                                            })}
                                        </Badge>
                                    </td>
                                    <td>
                                        <Anchor
                                            component="button"
                                            type="button"
                                            size="xs"
                                            onClick={() =>
                                                setSelectedUuid(
                                                    row.operationLogUuid,
                                                )
                                            }
                                        >
                                            {t(
                                                'components_settings_operation_logs.view_detail',
                                            )}
                                        </Anchor>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7}>
                                    <Text p="sm" color="dimmed" size="xs">
                                        {t(
                                            'components_settings_operation_logs.empty',
                                        )}
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </Paper>

            <Group position="apart" align="center" noWrap spacing="xs">
                <ResultCount
                    count={data?.pagination.totalResults ?? 0}
                    variant="warehouse"
                    isLoading={isLoading}
                />
                <Group spacing={4} noWrap align="center">
                    <Text
                        fz="xs"
                        c="dimmed"
                        m={0}
                        lh={1}
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        {t('components_common_table.pagination.page_size_prefix')}
                    </Text>
                    <Select
                        size="xs"
                        w={52}
                        styles={compactSelectStyles}
                        value={String(pageSize)}
                        data={TABLE_PAGINATION_PAGE_SIZES.map((size) => ({
                            value: String(size),
                            label: String(size),
                        }))}
                        onChange={(value) => {
                            if (!value) return;
                            setPageSize(Number(value));
                            setPage(1);
                        }}
                    />
                    <Text
                        fz="xs"
                        c="dimmed"
                        m={0}
                        lh={1}
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        {t('components_common_table.pagination.page_size_suffix')}
                    </Text>
                    <PaginateControl
                        compact
                        currentPage={page}
                        totalPages={totalPages}
                        hasPreviousPage={page > 1}
                        hasNextPage={page < totalPages}
                        onPreviousPage={() => setPage((p) => Math.max(1, p - 1))}
                        onNextPage={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                        }
                        onPageChange={setPage}
                    />
                </Group>
            </Group>

            <Drawer
                opened={!!selectedUuid}
                onClose={() => setSelectedUuid(undefined)}
                title={t('components_settings_operation_logs.detail_title')}
                position="right"
                size="md"
                padding="md"
            >
                {detail ? (
                    <Stack spacing="md">
                        <DetailRow
                            label={t(
                                'components_settings_operation_logs.columns.time',
                            )}
                        >
                            {dayjs(detail.createdAt).format(
                                'YYYY-MM-DD HH:mm:ss',
                            )}
                        </DetailRow>
                        <DetailRow
                            label={t(
                                'components_settings_operation_logs.columns.actor',
                            )}
                        >
                            <ActorDisplay
                                display={detail.actorDisplay}
                                email={detail.actorEmail}
                            />
                        </DetailRow>
                        <DetailRow
                            label={t(
                                'components_settings_operation_logs.columns.action',
                            )}
                        >
                            {t(actionLabelKey(detail.action), { defaultValue: detail.action })}
                        </DetailRow>
                        <DetailRow
                            label={t(
                                'components_settings_operation_logs.columns.resource_type',
                            )}
                        >
                            {t(resourceTypeLabelKey(detail.resourceType), {
                                defaultValue: detail.resourceType,
                            })}
                        </DetailRow>
                        <DetailRow
                            label={t(
                                'components_settings_operation_logs.columns.resource_name',
                            )}
                        >
                            {detail.resourceType === 'dashboard' &&
                            detail.resourceUuid ? (
                                <Anchor
                                    size="sm"
                                    onClick={() =>
                                        navigate(
                                            `/projects/${projectUuid}/dashboards/${detail.resourceUuid}`,
                                        )
                                    }
                                >
                                    {detail.resourceName || detail.resourceUuid}
                                </Anchor>
                            ) : (
                                detail.resourceName || '-'
                            )}
                        </DetailRow>
                        <DetailRow
                            label={t(
                                'components_settings_operation_logs.columns.status',
                            )}
                        >
                            <Badge
                                size="sm"
                                variant="light"
                                color={
                                    detail.status === 'failure' ? 'red' : 'green'
                                }
                            >
                                {t(statusLabelKey(detail.status), {
                                    defaultValue: detail.status,
                                })}
                            </Badge>
                        </DetailRow>
                        <Divider />
                        <Stack spacing={6}>
                            <Text size="xs" color="dimmed">
                                {t(
                                    'components_settings_operation_logs.detail_summary',
                                )}
                            </Text>
                            <SummaryView summary={detail.summary} />
                        </Stack>
                    </Stack>
                ) : (
                    <Text color="dimmed" size="xs">
                        {t('components_settings_operation_logs.loading')}
                    </Text>
                )}
            </Drawer>

            <Modal
                opened={purgeOpened}
                onClose={closePurge}
                title={t('components_settings_operation_logs.purge_modal_title')}
                size="sm"
            >
                <Stack spacing="sm">
                    <Text size="xs">
                        {t(
                            'components_settings_operation_logs.purge_modal_body',
                        )}
                    </Text>
                    <NumberInput
                        size="xs"
                        label={t(
                            'components_settings_operation_logs.purge_before_days',
                        )}
                        value={beforeDays}
                        onChange={(v) =>
                            setBeforeDays(typeof v === 'number' ? v : 90)
                        }
                        min={30}
                        styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                    />
                    <Group position="right" spacing="xs">
                        <Button
                            variant="default"
                            size="xs"
                            onClick={closePurge}
                        >
                            {t(
                                'components_settings_operation_logs.purge_cancel',
                            )}
                        </Button>
                        <Button
                            color="red"
                            size="xs"
                            loading={isPurging}
                            onClick={() => void handlePurge()}
                        >
                            {t(
                                'components_settings_operation_logs.purge_confirm',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
};

export default SettingsOperationLogs;
