import { PROJECT_OPERATION_LOG_ACTIONS } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Checkbox,
    CopyButton,
    Divider,
    Drawer,
    Grid,
    Group,
    Modal,
    NumberInput,
    Paper,
    Radio,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
    createStyles,
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

const useStyles = createStyles((theme) => ({
    tableWrap: {
        overflowX: 'auto',
    },
    stickyStatus: {
        position: 'sticky',
        right: 72,
        zIndex: 2,
        backgroundColor: theme.white,
        minWidth: 88,
        boxShadow: `-4px 0 8px -6px ${theme.fn.rgba(theme.black, 0.15)}`,
    },
    stickyDetail: {
        position: 'sticky',
        right: 0,
        zIndex: 2,
        backgroundColor: theme.white,
        minWidth: 72,
        boxShadow: `-4px 0 8px -6px ${theme.fn.rgba(theme.black, 0.15)}`,
    },
    stickyHead: {
        backgroundColor: theme.colors.gray[0],
        zIndex: 3,
    },
}));


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


const looksLikeFieldPath = (value: string): boolean =>
    /^[a-zA-Z_][\w]*\.[a-zA-Z_][\w]*$/.test(value);

const formatResourceName = (row: {
    resourceType: string;
    resourceName: string | null;
    summary?: Record<string, unknown> | null;
}): string => {
    const summary = row.summary || {};
    const summaryLabel =
        typeof summary.label === 'string' ? summary.label.trim() : '';
    const summaryFieldId =
        typeof summary.fieldId === 'string' ? summary.fieldId.trim() : '';
    const summaryTable =
        typeof summary.tableName === 'string' ? summary.tableName.trim() : '';
    const summaryTabName =
        typeof summary.tabName === 'string' ? summary.tabName.trim() : '';
    const storedName = row.resourceName?.trim() || '';

    if (row.resourceType === 'dashboard_filter') {
        const summaryScope =
            typeof summary.scope === 'string' ? summary.scope : '';
        // Prefer human label; skip when label is just the raw field id / scope token.
        if (
            summaryLabel &&
            summaryLabel !== summaryFieldId &&
            summaryLabel !== 'global' &&
            summaryLabel !== 'tab' &&
            !looksLikeFieldPath(summaryLabel)
        ) {
            return summaryLabel;
        }
        if (summaryScope === 'global' && !summaryTabName) {
            return '全局筛选器';
        }
        if (summaryTabName) {
            const tail =
                summaryLabel && !looksLikeFieldPath(summaryLabel)
                    ? summaryLabel
                    : summaryFieldId ||
                      (looksLikeFieldPath(storedName) ? '' : storedName);
            return tail ? `${summaryTabName} · ${tail}` : summaryTabName;
        }
        if (summaryLabel) return summaryLabel;
        if (storedName && !looksLikeFieldPath(storedName)) return storedName;
        if (summaryFieldId) return summaryFieldId;
        if (summaryTable && summaryFieldId) {
            return `${summaryTable}.${summaryFieldId}`;
        }
        return storedName || '-';
    }

    return storedName || '-';
};

const canOpenDashboardResource = (
    resourceType: string,
    resourceUuid: string | null | undefined,
    action: string,
): boolean =>
    resourceType === 'dashboard' &&
    !!resourceUuid &&
    !action.endsWith('.deleted');

const getRelatedDashboard = (row: {
    resourceType: string;
    resourceUuid: string | null | undefined;
    resourceName?: string | null;
    action: string;
    summary?: Record<string, unknown> | null;
}): { uuid: string; name: string } | null => {
    if (row.action.endsWith('.deleted')) return null;
    const summary = row.summary || {};
    const fromSummaryUuid =
        typeof summary.dashboardUuid === 'string'
            ? summary.dashboardUuid.trim()
            : '';
    const fromSummaryName =
        typeof summary.dashboardName === 'string'
            ? summary.dashboardName.trim()
            : '';
    if (fromSummaryUuid) {
        return {
            uuid: fromSummaryUuid,
            name: fromSummaryName || fromSummaryUuid,
        };
    }
    if (row.resourceType === 'dashboard' && row.resourceUuid) {
        return {
            uuid: row.resourceUuid,
            name: row.resourceName?.trim() || row.resourceUuid,
        };
    }
    return null;
};


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
    if (typeof value === 'boolean') {
        return t(
            `components_settings_operation_logs.summary_values.${value}`,
            { defaultValue: value ? 'true' : 'false' },
        );
    }
    if (typeof value === 'string') {
        if (
            key === 'scope' ||
            key === 'source' ||
            key === 'kind' ||
            key === 'changeKind' ||
            key === 'mode'
        ) {
            return t(
                `components_settings_operation_logs.summary_values.${value}`,
                { defaultValue: value },
            );
        }
        if (key === 'action' && value.includes('.')) {
            return t(actionLabelKey(value), { defaultValue: value });
        }
    }
    if (Array.isArray(value) && key === 'changeKinds') {
        return value
            .map((item) =>
                typeof item === 'string' && item.includes('.')
                    ? t(actionLabelKey(item), { defaultValue: item })
                    : formatSummaryValue(item),
            )
            .join('、');
    }
    return formatSummaryValue(value);
};

const formatChangeActionLabel = (action: unknown, t: TFunction): string => {
    if (typeof action !== 'string' || !action) return '-';
    return t(actionLabelKey(action), { defaultValue: action });
};

const SummaryView: FC<{ summary: unknown }> = ({ summary }) => {
    const { t } = useTranslation();
    const cleaned = cleanSummary(summary);
    if (cleaned === undefined) {
        return (
            <Text size="xs" color="dimmed">
                {t('components_settings_operation_logs.detail_no_summary', {
                    defaultValue: '-',
                })}
            </Text>
        );
    }

    if (typeof cleaned !== 'object' || cleaned === null || Array.isArray(cleaned)) {
        return (
            <Text
                size="xs"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
                {formatSummaryValue(cleaned)}
            </Text>
        );
    }

    const record = cleaned as Record<string, unknown>;
    const changes = Array.isArray(record.changes) ? record.changes : null;

    if (changes && changes.length > 0) {
        const metaEntries = Object.entries(record).filter(
            ([key]) => key !== 'changes' && key !== 'changeKinds',
        );
        return (
            <Stack spacing="sm">
                {metaEntries.length > 0 ? (
                    <Stack spacing={6}>
                        {metaEntries.map(([key, value]) => (
                            <Group
                                key={key}
                                spacing={6}
                                align="flex-start"
                                noWrap
                            >
                                <Text
                                    size="xs"
                                    color="dimmed"
                                    miw={110}
                                    style={{ flexShrink: 0 }}
                                >
                                    {t(
                                        `components_settings_operation_logs.summary_keys.${key}`,
                                        { defaultValue: key },
                                    )}
                                </Text>
                                <Text
                                    size="xs"
                                    style={{
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                    }}
                                >
                                    {translateSummaryValue(key, value, t)}
                                </Text>
                            </Group>
                        ))}
                    </Stack>
                ) : null}
                <Stack spacing={6}>
                    <Text size="xs" color="dimmed">
                        {t(
                            'components_settings_operation_logs.summary_keys.changes',
                            { defaultValue: 'changes' },
                        )}
                    </Text>
                    <Stack spacing={4}>
                        {changes.map((item, index) => {
                            const change =
                                item && typeof item === 'object'
                                    ? (item as Record<string, unknown>)
                                    : {};
                            const actionLabel = formatChangeActionLabel(
                                change.action,
                                t,
                            );
                            const changeKindLabel =
                                typeof change.changeKind === 'string'
                                    ? t(
                                          `components_settings_operation_logs.summary_values.${change.changeKind}`,
                                          {
                                              defaultValue:
                                                  change.changeKind,
                                          },
                                      )
                                    : '';
                            const title =
                                actionLabel !== '-'
                                    ? actionLabel
                                    : changeKindLabel || '-';
                            const resourceName =
                                typeof change.resourceName === 'string' &&
                                !looksLikeFieldPath(change.resourceName)
                                    ? change.resourceName
                                    : '';
                            const nestedSummary =
                                change.summary &&
                                typeof change.summary === 'object' &&
                                !Array.isArray(change.summary)
                                    ? (change.summary as Record<
                                          string,
                                          unknown
                                      >)
                                    : null;
                            return (
                                <Paper
                                    key={`${String(
                                        change.action || change.changeKind,
                                    )}-${index}`}
                                    withBorder
                                    p={6}
                                    radius="sm"
                                    bg="gray.0"
                                >
                                    <Stack spacing={2}>
                                        <Text size="xs">
                                            {index + 1}. {title}
                                            {resourceName
                                                ? ` · ${resourceName}`
                                                : ''}
                                        </Text>
                                        {nestedSummary ? (
                                            <Stack spacing={2} pl={12}>
                                                {Object.entries(nestedSummary)
                                                    .filter(
                                                        ([key]) =>
                                                            ![
                                                                'source',
                                                                'schemaVersion',
                                                                'occurredAt',
                                                            ].includes(key),
                                                    )
                                                    .map(([key, value]) => (
                                                        <Group
                                                            key={key}
                                                            spacing={6}
                                                            align="flex-start"
                                                            noWrap
                                                        >
                                                            <Text
                                                                size="xs"
                                                                color="dimmed"
                                                                miw={80}
                                                                style={{
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {t(
                                                                    `components_settings_operation_logs.summary_keys.${key}`,
                                                                    {
                                                                        defaultValue:
                                                                            key,
                                                                    },
                                                                )}
                                                            </Text>
                                                            <Text
                                                                size="xs"
                                                                color="dimmed"
                                                                style={{
                                                                    whiteSpace:
                                                                        'pre-wrap',
                                                                    wordBreak:
                                                                        'break-word',
                                                                }}
                                                            >
                                                                {translateSummaryValue(
                                                                    key,
                                                                    value,
                                                                    t,
                                                                )}
                                                            </Text>
                                                        </Group>
                                                    ))}
                                            </Stack>
                                        ) : null}
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
                </Stack>
            </Stack>
        );
    }

    const entries = Object.entries(record);
    return (
        <Stack spacing={6}>
            {entries.map(([key, value]) => (
                <Group key={key} spacing={6} align="flex-start" noWrap>
                    <Text
                        size="xs"
                        color="dimmed"
                        miw={110}
                        style={{ flexShrink: 0 }}
                    >
                        {t(
                            `components_settings_operation_logs.summary_keys.${key}`,
                            { defaultValue: key },
                        )}
                    </Text>
                    <Text
                        size="xs"
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
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
                            fontSize: theme.fontSizes.sm,
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
    const { classes: stickyClasses } = useStyles();

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
    const [purgeMode, setPurgeMode] = useState<'before_days' | 'all'>(
        'before_days',
    );
    const [confirmClearAll, setConfirmClearAll] = useState(false);

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
            const result = await purge(
                purgeMode === 'all'
                    ? { mode: 'all' }
                    : { mode: 'before_days', beforeDays },
            );
            notifications.show({
                color: 'green',
                title: t('components_settings_operation_logs.purge_success_title'),
                message: t(
                    'components_settings_operation_logs.purge_success_message',
                    { count: result.deletedCount },
                ),
            });
            setConfirmClearAll(false);
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
                    onClick={() => {
                        setPurgeMode('before_days');
                        setBeforeDays(90);
                        setConfirmClearAll(false);
                        openPurge();
                    }}
                >
                    {t('components_settings_operation_logs.purge_button')}
                </Button>
            </Group>

                        <Grid gutter="xs" align="flex-end">
                <Grid.Col xs={12} sm={6} md={4} lg={3}>
                    <DatePickerInput
                        type="range"
                        size="xs"
                        label={t(
                            'components_settings_operation_logs.filter_date',
                        )}
                        valueFormat="YYYY-MM-DD"
                        value={dateRange}
                        onChange={(value) => {
                            setDateRange(value);
                            setPage(1);
                        }}
                        clearable
                        w="100%"
                        styles={{
                            label: { fontSize: 12, marginBottom: 4 },
                            input: { minWidth: 0 },
                        }}
                    />
                </Grid.Col>
                <Grid.Col xs={12} sm={6} md={4} lg={2}>
                    <Select
                        size="xs"
                        label={t(
                            'components_settings_operation_logs.filter_action',
                        )}
                        placeholder={t(
                            'components_settings_operation_logs.filter_action_placeholder',
                        )}
                        data={ACTION_OPTIONS.map((value) => ({
                            value,
                            label: t(actionLabelKey(value), {
                                defaultValue: value,
                            }),
                        }))}
                        value={action}
                        onChange={(v) => {
                            setAction(v);
                            setPage(1);
                        }}
                        clearable
                        searchable
                        w="100%"
                        styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                    />
                </Grid.Col>
                <Grid.Col xs={12} sm={6} md={4} lg={2}>
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
                            label: t(resourceTypeLabelKey(value), {
                                defaultValue: value,
                            }),
                        }))}
                        value={resourceType}
                        onChange={(v) => {
                            setResourceType(v);
                            setPage(1);
                        }}
                        clearable
                        searchable
                        w="100%"
                        styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                    />
                </Grid.Col>
                <Grid.Col xs={12} sm={6} md={4} lg={2}>
                    <TextInput
                        size="xs"
                        label={t(
                            'components_settings_operation_logs.filter_actor',
                        )}
                        placeholder={t(
                            'components_settings_operation_logs.filter_actor_placeholder',
                        )}
                        value={actorEmail}
                        onChange={(e) => {
                            setActorEmail(e.currentTarget.value);
                        }}
                        w="100%"
                        styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                    />
                </Grid.Col>
                <Grid.Col xs={12} sm={6} md={4} lg={3}>
                    <TextInput
                        size="xs"
                        label={t(
                            'components_settings_operation_logs.filter_search',
                        )}
                        placeholder={t(
                            'components_settings_operation_logs.filter_search_placeholder',
                        )}
                        value={q}
                        onChange={(e) => {
                            setQ(e.currentTarget.value);
                        }}
                        w="100%"
                        styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                    />
                </Grid.Col>
            </Grid>

            <Paper withBorder radius="sm" className={stickyClasses.tableWrap}>
                <Table
                    className={cx(classes.root)}
                    highlightOnHover
                    fontSize="sm"
                    horizontalSpacing="md"
                    verticalSpacing="sm"
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
                            <th
                                className={cx(
                                    stickyClasses.stickyStatus,
                                    stickyClasses.stickyHead,
                                )}
                            >
                                {t(
                                    'components_settings_operation_logs.columns.status',
                                )}
                            </th>
                            <th
                                className={cx(
                                    stickyClasses.stickyDetail,
                                    stickyClasses.stickyHead,
                                )}
                            >
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
                                    <Text p="sm" color="dimmed" size="sm">
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
                                        <Stack spacing={2}>
                                            {canOpenDashboardResource(
                                                row.resourceType,
                                                row.resourceUuid,
                                                row.action,
                                            ) ? (
                                                <Anchor
                                                    size="sm"
                                                    onClick={() =>
                                                        navigate(
                                                            `/projects/${projectUuid}/dashboards/${row.resourceUuid}`,
                                                        )
                                                    }
                                                >
                                                    {formatResourceName(row)}
                                                </Anchor>
                                            ) : (
                                                <Text size="sm">
                                                    {formatResourceName(row)}
                                                </Text>
                                            )}
                                            {row.resourceType ===
                                                'dashboard_filter' &&
                                            getRelatedDashboard(row) ? (
                                                <Anchor
                                                    size="xs"
                                                    color="dimmed"
                                                    onClick={() => {
                                                        const related =
                                                            getRelatedDashboard(
                                                                row,
                                                            );
                                                        if (!related) return;
                                                        navigate(
                                                            `/projects/${projectUuid}/dashboards/${related.uuid}`,
                                                        );
                                                    }}
                                                >
                                                    {t(
                                                        'components_settings_operation_logs.related_dashboard_prefix',
                                                        {
                                                            defaultValue:
                                                                'Dashboard: ',
                                                        },
                                                    )}
                                                    {
                                                        getRelatedDashboard(row)!
                                                            .name
                                                    }
                                                </Anchor>
                                            ) : null}
                                        </Stack>
                                    </td>
                                    <td
                                        className={stickyClasses.stickyStatus}
                                        style={
                                            row.status === 'failure'
                                                ? { backgroundColor: '#fff5f5' }
                                                : undefined
                                        }
                                    >
                                        <Badge
                                            size="sm"
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
                                    <td
                                        className={stickyClasses.stickyDetail}
                                        style={
                                            row.status === 'failure'
                                                ? { backgroundColor: '#fff5f5' }
                                                : undefined
                                        }
                                    >
                                        <Anchor
                                            component="button"
                                            type="button"
                                            size="sm"
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
                                    <Text p="sm" color="dimmed" size="sm">
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
                            {canOpenDashboardResource(
                                detail.resourceType,
                                detail.resourceUuid,
                                detail.action,
                            ) ? (
                                <Anchor
                                    size="sm"
                                    onClick={() =>
                                        navigate(
                                            `/projects/${projectUuid}/dashboards/${detail.resourceUuid}`,
                                        )
                                    }
                                >
                                    {formatResourceName(detail)}
                                </Anchor>
                            ) : (
                                formatResourceName(detail)
                            )}
                        </DetailRow>
                        {detail.resourceType === 'dashboard_filter' &&
                        getRelatedDashboard(detail) ? (
                            <DetailRow
                                label={t(
                                    'components_settings_operation_logs.related_dashboard',
                                    { defaultValue: 'Dashboard' },
                                )}
                            >
                                <Anchor
                                    size="sm"
                                    onClick={() => {
                                        const related =
                                            getRelatedDashboard(detail);
                                        if (!related) return;
                                        navigate(
                                            `/projects/${projectUuid}/dashboards/${related.uuid}`,
                                        );
                                    }}
                                >
                                    {getRelatedDashboard(detail)!.name}
                                </Anchor>
                            </DetailRow>
                        ) : null}
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
                    <Radio.Group
                        value={purgeMode}
                        onChange={(v) => {
                            setPurgeMode(v as 'before_days' | 'all');
                            setConfirmClearAll(false);
                        }}
                        label={t(
                            'components_settings_operation_logs.purge_mode_label',
                        )}
                        size="xs"
                        styles={{ label: { fontSize: 12, marginBottom: 4 } }}
                    >
                        <Stack spacing={6} mt={4}>
                            <Radio
                                value="before_days"
                                label={t(
                                    'components_settings_operation_logs.purge_mode_before_days',
                                )}
                                size="xs"
                            />
                            <Radio
                                value="all"
                                label={t(
                                    'components_settings_operation_logs.purge_mode_all',
                                )}
                                size="xs"
                            />
                        </Stack>
                    </Radio.Group>
                    {purgeMode === 'before_days' ? (
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
                            styles={{
                                label: { fontSize: 12, marginBottom: 4 },
                            }}
                        />
                    ) : (
                        <Stack spacing={6}>
                            <Text size="xs" color="red">
                                {t(
                                    'components_settings_operation_logs.purge_clear_all_warning',
                                )}
                            </Text>
                            <Checkbox
                                size="xs"
                                checked={confirmClearAll}
                                onChange={(e) =>
                                    setConfirmClearAll(
                                        e.currentTarget.checked,
                                    )
                                }
                                label={t(
                                    'components_settings_operation_logs.purge_clear_all_confirm',
                                )}
                            />
                        </Stack>
                    )}
                    <Group position="right" spacing="xs">
                        <Button
                            variant="default"
                            size="xs"
                            onClick={() => {
                                setConfirmClearAll(false);
                                closePurge();
                            }}
                        >
                            {t(
                                'components_settings_operation_logs.purge_cancel',
                            )}
                        </Button>
                        <Button
                            color="red"
                            size="xs"
                            loading={isPurging}
                            disabled={
                                purgeMode === 'all' && !confirmClearAll
                            }
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
