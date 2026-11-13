import {
    DownloadFileType,
    formatDate,
    type DownloadOptions,
    type PivotConfig,
} from '@lightdash/common';
import { Alert, Box, Button, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTableExport } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
    memo,
    useEffect,
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
import { scheduleDownloadQuery } from '../../hooks/useQueryResults';
import MantineIcon from '../common/MantineIcon';
import ExportOptions from './ExportOptions';
import { Limit, Values } from './types';
import { useExportLimitDefaults } from './useExportLimitDefaults';

type ExportCsvRenderProps = {
    onExport: () => Promise<unknown>;
    isExporting: boolean;
};

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

        const health = useHealth();
        const { defaultLimit } = useExportLimitDefaults(projectUuid);

        const exportProgressTimer = useRef<number | null>(null);

        useEffect(
            () => () => {
                if (exportProgressTimer.current) {
                    window.clearInterval(exportProgressTimer.current);
                }
            },
            [],
        );

        const [limit, setLimit] = useState<Limit>(defaultLimit);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<Values>(Values.FORMATTED);
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
                        <ExportOptions
                            projectUuid={projectUuid}
                            fileType={fileType}
                            onFileTypeChange={setFileType}
                            values={format}
                            onValuesChange={setFormat}
                            limit={limit}
                            onLimitChange={setLimit}
                            customLimit={customLimit}
                            onCustomLimitChange={setCustomLimit}
                            hideLimitSelection={hideLimitSelection}
                        >
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
                        </ExportOptions>
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
