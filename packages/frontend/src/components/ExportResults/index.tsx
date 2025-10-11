import { subject } from '@casl/ability';
import {
    DownloadFileType,
    formatDate,
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
import { memo, useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { pollJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
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
        const [limit, setLimit] = useState<Limit>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const [fileType, setFileType] = useState<DownloadFileType>(
            DownloadFileType.CSV,
        );

        const { isLoading: isExporting, mutateAsync: exportMutation } =
            useMutation(
                ['export-results', fileType],
                async () => {
                    const queryUuid = await getDownloadQueryUuid(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                            ? totalResults ?? 0
                            : null,
                        limit,
                    );

                    const downloadOptions = {
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
                    },
                    onSuccess: (response) => {
                        // Download file
                        pollJobStatus(response.jobId)
                            .then(async (details) => {
                                const link = document.createElement('a');
                                link.href = details?.fileUrl;
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
                                    subtitle: error.message,
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
        const maxColumnLimit = health.data?.pivotTable?.maxColumnLimit || 60;

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

                            {/* Excel row limit warning */}
                            {fileType === DownloadFileType.XLSX &&
                                (limit === Limit.ALL ||
                                    limit === Limit.CUSTOM) &&
                                !isPivotTable && (
                                    <Alert color="gray.9" p="xs">
                                        <Text size="xs">
                                            {t(
                                                'components_export_results.limit',
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
