import { PROJECT_OPERATION_LOG_ACTIONS } from '@lightdash/common';
import {
    Anchor,
    Button,
    Drawer,
    Group,
    Modal,
    NumberInput,
    Pagination,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
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

const SettingsOperationLogs: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation();
    const { cx, classes } = useTableStyles();

    const [page, setPage] = useState(1);
    const [q, setQ] = useState('');
    const [action, setAction] = useState<string | null>(null);
    const [actorEmail, setActorEmail] = useState('');
    const [dateRange, setDateRange] = useState<
        [Date | null, Date | null]
    >([null, null]);
    const [selectedUuid, setSelectedUuid] = useState<string | undefined>();
    const [purgeOpened, { open: openPurge, close: closePurge }] =
        useDisclosure(false);
    const [beforeDays, setBeforeDays] = useState<number>(90);

    const filters = useMemo(
        () => ({
            page,
            pageSize: 20,
            q: q || undefined,
            action: action || undefined,
            actorEmail: actorEmail || undefined,
            from: dateRange[0]
                ? dayjs(dateRange[0]).startOf('day').toISOString()
                : undefined,
            to: dateRange[1]
                ? dayjs(dateRange[1]).endOf('day').toISOString()
                : undefined,
        }),
        [page, q, action, actorEmail, dateRange],
    );

    const { data, isLoading, isError } = useProjectOperationLogs(
        projectUuid,
        filters,
    );
    const { data: detail } = useProjectOperationLog(
        projectUuid,
        selectedUuid,
    );
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
                        : t('components_settings_operation_logs.purge_error_fallback'),
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
        <Stack spacing="md">
            <Group position="apart" align="flex-end">
                <Text color="dimmed" size="sm" maw={560}>
                    {t('components_settings_operation_logs.description')}
                </Text>
                <Button
                    color="red"
                    variant="light"
                    leftIcon={<MantineIcon icon={IconTrash} />}
                    onClick={openPurge}
                >
                    {t('components_settings_operation_logs.purge_button')}
                </Button>
            </Group>

            <Group align="flex-end" spacing="sm">
                <DatePickerInput
                    type="range"
                    label={t('components_settings_operation_logs.filter_date')}
                    value={dateRange}
                    onChange={setDateRange}
                    clearable
                    w={280}
                />
                <Select
                    label={t('components_settings_operation_logs.filter_action')}
                    data={ACTION_OPTIONS}
                    value={action}
                    onChange={(v) => {
                        setAction(v);
                        setPage(1);
                    }}
                    clearable
                    searchable
                    w={260}
                />
                <TextInput
                    label={t(
                        'components_settings_operation_logs.filter_actor',
                    )}
                    value={actorEmail}
                    onChange={(e) => {
                        setActorEmail(e.currentTarget.value);
                        setPage(1);
                    }}
                    w={200}
                />
                <TextInput
                    label={t('components_settings_operation_logs.filter_search')}
                    value={q}
                    onChange={(e) => {
                        setQ(e.currentTarget.value);
                        setPage(1);
                    }}
                    w={200}
                />
            </Group>

            <Paper withBorder>
                <Table className={cx(classes.root)} highlightOnHover>
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
                                    <Text p="md" color="dimmed">
                                        {t(
                                            'components_settings_operation_logs.loading',
                                        )}
                                    </Text>
                                </td>
                            </tr>
                        ) : data?.data.length ? (
                            data.data.map((row) => (
                                <tr key={row.operationLogUuid}>
                                    <td>
                                        {dayjs(row.createdAt).format(
                                            'YYYY-MM-DD HH:mm:ss',
                                        )}
                                    </td>
                                    <td>{row.actorDisplay}</td>
                                    <td>{row.action}</td>
                                    <td>{row.resourceType}</td>
                                    <td>{row.resourceName || '-'}</td>
                                    <td>{row.status}</td>
                                    <td>
                                        <Anchor
                                            component="button"
                                            type="button"
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
                                    <Text p="md" color="dimmed">
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

            <Group position="right">
                <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                />
            </Group>

            <Drawer
                opened={!!selectedUuid}
                onClose={() => setSelectedUuid(undefined)}
                title={t('components_settings_operation_logs.detail_title')}
                position="right"
                size="lg"
            >
                {detail ? (
                    <Stack spacing="sm">
                        <Text size="sm">
                            <strong>
                                {t(
                                    'components_settings_operation_logs.columns.actor',
                                )}
                                :
                            </strong>{' '}
                            {detail.actorDisplay}
                        </Text>
                        <Text size="sm">
                            <strong>
                                {t(
                                    'components_settings_operation_logs.columns.action',
                                )}
                                :
                            </strong>{' '}
                            {detail.action}
                        </Text>
                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(detail.summary, null, 2) || '-'}
                        </Text>
                    </Stack>
                ) : (
                    <Text color="dimmed">
                        {t('components_settings_operation_logs.loading')}
                    </Text>
                )}
            </Drawer>

            <Modal
                opened={purgeOpened}
                onClose={closePurge}
                title={t('components_settings_operation_logs.purge_modal_title')}
            >
                <Stack>
                    <Text size="sm">
                        {t(
                            'components_settings_operation_logs.purge_modal_body',
                        )}
                    </Text>
                    <NumberInput
                        label={t(
                            'components_settings_operation_logs.purge_before_days',
                        )}
                        value={beforeDays}
                        onChange={(v) =>
                            setBeforeDays(typeof v === 'number' ? v : 90)
                        }
                        min={30}
                    />
                    <Group position="right">
                        <Button variant="default" onClick={closePurge}>
                            {t(
                                'components_settings_operation_logs.purge_cancel',
                            )}
                        </Button>
                        <Button
                            color="red"
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
