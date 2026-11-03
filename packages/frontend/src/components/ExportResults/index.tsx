import { subject } from '@casl/ability';
import {
    DownloadFileType,
    formatDate,
    type DownloadOptions,
    type PivotConfig,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    NumberInput,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTableExport } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
    memo,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
    JobPollTimeoutError,
    pollJobStatus,
} from '../../features/scheduler/hooks/useScheduler';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import { scheduleDownloadQuery } from '../../hooks/useQueryResults';
import useUser from '../../hooks/user/useUser';
import { Can } from '../../providers/Ability';
import MantineIcon from '../common/MantineIcon';
import { Limit } from './types';

type ExportCsvRenderProps = {
    onExport: () => Promise<unknown>;
    isExporting: boolean;
};

enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

export type ExportResultsProps = {
    projectUuid: string;
    totalResults: number | undefined;
    getDownloadQueryUuid: (
        limit: number | null,
        limitType: Limit,
    ) => Promise<string>;
    columnOrder?: string[];
    customLabels?: Record<string, string>;
    hiddenFields?: string[];
    showTableNames?: boolean;
    chartName?: string;
    pivotConfig?: PivotConfig;
    hideLimitSelection?: boolean;
    renderDialogActions?: (renderProps: ExportCsvRenderProps) => ReactNode;
};

const TOAST_KEY = 'exporting-results';

const ExportResults: FC<ExportResultsProps> = memo(
    ({
        projectUuid,
        totalResults,
        getDownloadQueryUuid,
        columnOrder,
        customLabels,
        hiddenFields,
        showTableNames,
        chartName,
        pivotConfig,
        hideLimitSelection = false,
        renderDialogActions,
    }) => {
        const { t } = useTranslation();

        const { showToastError, showToastInfo, showToastWarning } =
            useToaster();

        const user = useUser(true);
        const health = useHealth();
        const { data: project } = useProject(projectUuid);

        const exportProgressTimer = useRef<number | null>(null);

        useEffect(
            () => () => {
                if (exportProgressTimer.current) {
                    window.clearInterval(exportProgressTimer.current);
                }
            },
            [],
        );

        // Check if user has permission to change CSV results limit
        const canChangeCsvResults =
            user.data?.ability?.can(
                'manage',
                subject('ChangeCsvResults', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                }),
            ) ?? false;

        // Determine default limit based on isClientUse and permissions
        // If isClientUse and user doesn't have permission to see limit options, default to ALL
        // Otherwise, default to TABLE
        const isClientUse = project?.isClientUse ?? false;
        const defaultLimit = useMemo(() => {
            if (isClientUse && !canChangeCsvResults) {
                // User mode without permission to see limit options, default to all results
                return Limit.ALL;
            }
            // User can see limit options, default to table results
            return Limit.TABLE;
        }, [isClientUse, canChangeCsvResults]);

        const [limit, setLimit] = useState<Limit>(defaultLimit);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const [fileType, setFileType] = useState<DownloadFileType>(
            DownloadFileType.CSV,
        );

        // Update limit when project data is loaded and defaultLimit changes
        useEffect(() => {
            setLimit(defaultLimit);
        }, [defaultLimit]);

        const { isLoading: isExporting, mutateAsync: exportMutation } =
            useMutation(
                ['export-results', fileType],
                async () => {
                    const queryUuid = await getDownloadQueryUuid(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                              ? (totalResults ?? 0)
                              : null,
                        limit,
                    );

                    const downloadOptions: DownloadOptions = {
                        fileType,
                        onlyRaw: format === Values.RAW,
                        columnOrder,
                        customLabels,
                        hiddenFields,
                        showTableNames,
                        pivotConfig,
                        attachmentDownloadName: chartName
                            ? `${chartName}_${formatDate(new Date())}`
                            : undefined,
                    };

                    return scheduleDownloadQuery(
                        projectUuid,
                        queryUuid,
                        downloadOptions,
                    );
                },
                {
                    onMutate: () => {
                        const startedAt = Date.now();
                        showToastInfo({
                            title: t(
                                'components_export_results.exporting.title',
                            ),
                            subtitle: t(
                                'components_export_results.exporting.subtitle',
                            ),
                            loading: true,
                            key: TOAST_KEY,
                            autoClose: false,
                        });

                        // A long export looks like a frozen UI otherwise: refresh the
                        // toast with the elapsed time so users can tell the work is alive.
                        exportProgressTimer.current = window.setInterval(() => {
                            const elapsedSeconds = Math.round(
                                (Date.now() - startedAt) / 1000,
                            );
                            if (elapsedSeconds < 10) return;
                            showToastInfo({
                                title: t(
                                    'components_export_results.exporting.title',
                                ),
                                subtitle: t(
                                    'components_export_results.exporting.subtitle_elapsed',
                                    { seconds: elapsedSeconds },
                                ),
                                loading: true,
                                key: TOAST_KEY,
                                autoClose: false,
                            });
                        }, 5000);
                    },
                    onSettled: () => {
                        if (exportProgressTimer.current) {
                            window.clearInterval(exportProgressTimer.current);
                            exportProgressTimer.current = null;
                        }
                    },
                    onSuccess: (response) => {
                        // Download file
                        pollJobStatus(response.jobId)
                            .then(async (details) => {
                                const fileUrl = details?.fileUrl;
                                if (!fileUrl) {
                                    throw new Error(
                                        t(
                                            'components_export_results.error.no_file',
                                        ),
                                    );
                                }
                                const link = document.createElement('a');
                                link.href = fileUrl;
                                link.setAttribute(
                                    'download',
                                    `${chartName || 'results'}_${formatDate(
                                        new Date(),
                                    )}.${fileType}`,
                                );
                                document.body.appendChild(link);
                                link.click();
                                link.remove(); // Remove the link from the DOM
                                // Hide toast
                                notifications.hide(TOAST_KEY);

                                if (details?.truncated) {
                                    showToastWarning({
                                        title: t(
                                            'components_export_results.warning.title',
                                        ),
                                        subtitle: t(
                                            'components_export_results.warning.subtitle',
                                        ),
                                    });
                                }
                            })
                            .catch((error: Error) => {
                                showToastError({
                                    title: t(
                                        'components_export_results.error.title',
                                    ),
                                    subtitle:
                                        error instanceof JobPollTimeoutError
                                            ? t(
                                                  'components_export_results.error.timeout',
                                              )
                                            : error.message,
                                });
                            });
                    },
                    onError: (error: { error: Error }) => {
                        notifications.hide(TOAST_KEY);

                        showToastError({
                            title: t('components_export_results.error.title'),
                            subtitle: error?.error?.message,
                        });
                    },
                },
            );

        if (!totalResults || totalResults <= 0) {
            return (
                <Alert color="gray">
                    {t('components_export_results.no_data_to_export')}
                </Alert>
            );
        }

        // Calculate pivot table specific limits
        const csvCellsLimit = health.data?.query?.csvCellsLimit || 100000;
        const maxColumnLimit = health.data?.pivotTable?.maxColumnLimit || 150;

        // For pivot tables, calculate conservative row limits
        const isPivotTable = !!pivotConfig;

        return (
            <Box>
                <Stack spacing={0} miw={300}>
                    <Stack p={renderDialogActions ? 'md' : 0}>
                        <Stack spacing="xs">
                            <Text fw={500}>
                                {t('components_export_results.file_format')}
                            </Text>
                            <SegmentedControl
                                size={'xs'}
                                value={fileType}
                                onChange={(value) =>
                                    setFileType(value as DownloadFileType)
                                }
                                data={[
                                    {
                                        label: 'CSV',
                                        value: DownloadFileType.CSV,
                                    },
                                    {
                                        label: 'XLSX',
                                        value: DownloadFileType.XLSX,
                                    },
                                ]}
                            />
                        </Stack>

                        <Stack spacing="xs">
                            <Text fw={500}>
                                {t('components_export_results.tabs.values')}
                            </Text>
                            <SegmentedControl
                                size={'xs'}
                                value={format}
                                onChange={(value) => setFormat(value)}
                                data={[
                                    {
                                        label: t(
                                            'components_export_results.radio_groups_values.part_1',
                                        ),
                                        value: Values.FORMATTED,
                                    },
                                    {
                                        label: t(
                                            'components_export_results.radio_groups_values.part_2',
                                        ),
                                        value: Values.RAW,
                                    },
                                ]}
                            />
                        </Stack>
                        <Stack spacing="xs">
                            <Can
                                I="manage"
                                this={subject('ChangeCsvResults', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                {!hideLimitSelection ? (
                                    <Stack spacing="xs">
                                        <Text fw={500}>
                                            {t(
                                                'components_export_results.tabs.limit',
                                            )}
                                        </Text>
                                        <SegmentedControl
                                            size={'xs'}
                                            value={limit}
                                            onChange={(value) =>
                                                setLimit(value as Limit)
                                            }
                                            data={[
                                                {
                                                    label: t(
                                                        'components_export_results.radio_groups_limit.part_1',
                                                    ),
                                                    value: Limit.TABLE,
                                                },
                                                {
                                                    label: t(
                                                        'components_export_results.radio_groups_limit.part_2',
                                                    ),
                                                    value: Limit.ALL,
                                                },
                                                {
                                                    label: t(
                                                        'components_export_results.radio_groups_limit.part_3',
                                                    ),
                                                    value: Limit.CUSTOM,
                                                },
                                            ]}
                                        />
                                    </Stack>
                                ) : null}
                            </Can>

                            {limit === Limit.TABLE && (
                                <Alert color="gray" p="xs">
                                    <Text size="xs">
                                        {t(
                                            'components_export_results.table_results_limit_hint',
                                            {
                                                count: totalResults,
                                            },
                                        )}
                                    </Text>
                                </Alert>
                            )}
                            {(limit === Limit.ALL || limit === Limit.CUSTOM) &&
                                !isPivotTable && (
                                    <Alert color="gray" p="xs">
                                        <Text size="xs">
                                            {fileType === DownloadFileType.XLSX
                                                ? t(
                                                      'components_export_results.limit',
                                                  )
                                                : t(
                                                      'components_export_results.csv_cells_limit_hint',
                                                      {
                                                          csvCellsLimit:
                                                              csvCellsLimit.toLocaleString(),
                                                      },
                                                  )}
                                        </Text>
                                    </Alert>
                                )}
                            {limit === Limit.CUSTOM && (
                                <NumberInput
                                    w="100%"
                                    size="xs"
                                    min={1}
                                    precision={0}
                                    required
                                    value={customLimit}
                                    onChange={(value) =>
                                        setCustomLimit(Number(value))
                                    }
                                />
                            )}
                            {/* Pivot table specific warnings */}
                            {isPivotTable && (
                                <Alert color="gray" p="xs">
                                    <Text size="xs">
                                        {t(
                                            'components_export_results.prvot_tables_warning',
                                            {
                                                csvCellsLimit:
                                                    csvCellsLimit.toLocaleString(),
                                                maxColumnLimit,
                                            },
                                        )}
                                    </Text>
                                </Alert>
                            )}
                        </Stack>
                    </Stack>

                    {!renderDialogActions ? (
                        <Button
                            loading={isExporting}
                            sx={{
                                alignSelf: 'end',
                            }}
                            size="xs"
                            mt="sm"
                            leftIcon={<MantineIcon icon={IconTableExport} />}
                            onClick={exportMutation}
                            data-testid="chart-export-results-button"
                        >
                            {t('components_export_results.download')}
                        </Button>
                    ) : (
                        renderDialogActions({
                            onExport: exportMutation,
                            isExporting,
                        })
                    )}
                </Stack>
            </Box>
        );
    },
);

export default ExportResults;
