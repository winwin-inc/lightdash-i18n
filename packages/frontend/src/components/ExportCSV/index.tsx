import { subject } from '@casl/ability';
import { type ApiScheduledDownloadCsv } from '@lightdash/common';
import { Alert, Box, Button, NumberInput, Radio, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTableExport } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { memo, useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { pollCsvFileUrl } from '../../api/csv';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import useUser from '../../hooks/user/useUser';
import { Can } from '../../providers/Ability';
import MantineIcon from '../common/MantineIcon';

enum Limit {
    TABLE = 'table',
    ALL = 'all',
    CUSTOM = 'custom',
}

enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

type ExportCsvRenderProps = {
    onExport: () => Promise<unknown>;
    isExporting: boolean;
};

export type ExportCSVProps = {
    projectUuid: string;
    totalResults: number | undefined;
    getCsvLink: (
        limit: number | null,
        onlyRaw: boolean,
    ) => Promise<ApiScheduledDownloadCsv>;
    isDialogBody?: boolean;
    renderDialogActions?: (renderProps: ExportCsvRenderProps) => ReactNode;
};

const ExportCSV: FC<ExportCSVProps> = memo(
    ({
        projectUuid,
        totalResults,
        getCsvLink,
        isDialogBody,
        renderDialogActions,
    }) => {
        const { showToastError, showToastInfo, showToastWarning } =
            useToaster();
        const { t } = useTranslation();

        const user = useUser(true);
        const [limit, setLimit] = useState<string>(Limit.TABLE);
        const [customLimit, setCustomLimit] = useState<number>(1);
        const [format, setFormat] = useState<string>(Values.FORMATTED);
        const health = useHealth();

        const { isLoading: isExporting, mutateAsync: exportCsvMutation } =
            useMutation(
                [limit, customLimit, totalResults, format],
                () =>
                    getCsvLink(
                        limit === Limit.CUSTOM
                            ? customLimit
                            : limit === Limit.TABLE
                            ? totalResults ?? 0
                            : null,
                        format === Values.RAW,
                    ),
                {
                    onMutate: () => {
                        showToastInfo({
                            title: t('components_export_csv.toast_info.title'),
                            subtitle: t(
                                'components_export_csv.toast_info.subtitle',
                            ),
                            loading: true,
                            key: 'exporting-csv',
                            autoClose: false,
                        });
                    },
                    onSuccess: (scheduledCsvResponse) => {
                        pollCsvFileUrl(scheduledCsvResponse)
                            .then((csvFile) => {
                                if (csvFile.url)
                                    window.location.href = csvFile.url;
                                notifications.hide('exporting-csv');

                                if (csvFile.truncated) {
                                    showToastWarning({
                                        title: t(
                                            'components_export_csv.toast_warning.title',
                                        ),
                                        subtitle: t(
                                            'components_export_csv.toast_warning.subtitle',
                                            {
                                                csvCellsLimit:
                                                    health.data?.query
                                                        .csvCellsLimit,
                                            },
                                        ),
                                    });
                                }
                            })
                            .catch((error) => {
                                notifications.hide('exporting-csv');

                                showToastError({
                                    title: t(
                                        'components_export_csv.toast_error.title',
                                    ),
                                    subtitle: error?.error?.message,
                                });
                            });
                    },
                    onError: (error: { error: Error }) => {
                        notifications.hide('exporting-csv');

                        showToastError({
                            title: t('components_export_csv.toast_error.title'),
                            subtitle: error?.error?.message,
                        });
                    },
                },
            );

        if (!totalResults || totalResults <= 0) {
            return (
                <Alert color="gray">
                    {t('components_export_csv.no_data_to_export')}
                </Alert>
            );
        }

        return (
            <Box>
                <Stack
                    spacing="xs"
                    m={isDialogBody ? 'md' : undefined}
                    miw={300}
                >
                    <Radio.Group
                        label={t(
                            'components_export_csv.radio_groups_values.label',
                        )}
                        value={format}
                        onChange={(val) => setFormat(val)}
                    >
                        <Stack spacing="xs" mt="xs">
                            <Radio
                                label={t(
                                    'components_export_csv.radio_groups_values.radio_01',
                                )}
                                value={Values.FORMATTED}
                            />
                            <Radio
                                label={t(
                                    'components_export_csv.radio_groups_values.radio_02',
                                )}
                                value={Values.RAW}
                            />
                        </Stack>
                    </Radio.Group>

                    <Can
                        I="manage"
                        this={subject('ChangeCsvResults', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <Radio.Group
                            label={t(
                                'components_export_csv.radio_groups_limit.label',
                            )}
                            value={limit}
                            onChange={(val) => setLimit(val)}
                        >
                            <Stack spacing="xs" mt="xs">
                                <Radio
                                    label={t(
                                        'components_export_csv.radio_groups_limit.radio_01',
                                    )}
                                    value={Limit.TABLE}
                                />
                                <Radio
                                    label={t(
                                        'components_export_csv.radio_groups_limit.radio_02',
                                    )}
                                    value={Limit.ALL}
                                />
                                <Radio
                                    label={t(
                                        'components_export_csv.radio_groups_limit.radio_03',
                                    )}
                                    value={Limit.CUSTOM}
                                />
                            </Stack>
                        </Radio.Group>
                    </Can>

                    {limit === Limit.CUSTOM && (
                        <NumberInput
                            w="7xl"
                            size="xs"
                            min={1}
                            precision={0}
                            required
                            value={customLimit}
                            onChange={(value) => setCustomLimit(Number(value))}
                        />
                    )}

                    {(limit === Limit.ALL || limit === Limit.CUSTOM) && (
                        <Alert color="gray">
                            {t('components_export_csv.limit_alert_tip.part_1')}{' '}
                            {Number(
                                health.data?.query.csvCellsLimit || 100000,
                            ).toLocaleString()}{' '}
                            {t('components_export_csv.limit_alert_tip.part_2')}
                        </Alert>
                    )}
                    {!isDialogBody && (
                        <Button
                            loading={isExporting}
                            compact
                            sx={{
                                alignSelf: 'end',
                            }}
                            leftIcon={<MantineIcon icon={IconTableExport} />}
                            onClick={() => exportCsvMutation()}
                            data-testid="chart-export-csv-button"
                        >
                            {t('components_export_csv.export_csv')}
                        </Button>
                    )}
                </Stack>

                {isDialogBody && renderDialogActions && (
                    <>
                        {renderDialogActions({
                            onExport: exportCsvMutation,
                            isExporting,
                        })}
                    </>
                )}
            </Box>
        );
    },
);

export default ExportCSV;
