import { capitalize, DownloadFileType } from '@lightdash/common';
import { ActionIcon, Button, Popover, Radio, Stack } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type EChartsInstance } from 'echarts-for-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ChartDownloadOptions from '../../../../components/common/ChartDownload/ChartDownloadOptions';
import { DownloadType } from '../../../../components/common/ChartDownload/chartDownloadUtils';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useDownloadResults } from '../../hooks/useDownloadResults';

type Props = {
    fileUrl: string | undefined;
    columnNames: string[];
    chartName: string | undefined;
    echartsInstance: EChartsInstance;
};

export const ChartDownload: React.FC<Props> = memo(
    ({ fileUrl, columnNames, chartName, echartsInstance }) => {
        const { t } = useTranslation();

        const [downloadFormat, setDownloadFormat] = useState<
            DownloadFileType.CSV | DownloadFileType.IMAGE
        >(DownloadFileType.CSV);

        const { handleDownload: handleCsvDownload } = useDownloadResults({
            fileUrl,
            columnNames,
            chartName,
        });

        return (
            <Popover>
                <Popover.Target>
                    <ActionIcon variant="default" disabled={!fileUrl}>
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown miw={250}>
                    <Stack spacing="xs">
                        <Radio.Group
                            size="sm"
                            value={downloadFormat}
                            onChange={(
                                value:
                                    | DownloadFileType.CSV
                                    | DownloadFileType.IMAGE,
                            ) => setDownloadFormat(value)}
                            name="download-format"
                            label={t('features_sql_runner_download.format')}
                        >
                            <Radio
                                value={DownloadFileType.CSV}
                                label={capitalize(DownloadFileType.CSV)}
                                my="xs"
                            />
                            <Radio
                                value={DownloadFileType.IMAGE}
                                label={capitalize(DownloadFileType.IMAGE)}
                            />
                        </Radio.Group>
                        {downloadFormat === DownloadFileType.IMAGE && (
                            <ChartDownloadOptions
                                getChartInstance={() => echartsInstance}
                                unavailableOptions={[DownloadType.JSON]}
                            />
                        )}
                        {downloadFormat === DownloadFileType.CSV && (
                            <Button
                                size="xs"
                                ml="auto"
                                leftIcon={<MantineIcon icon={IconDownload} />}
                                onClick={handleCsvDownload}
                            >
                                {t('features_sql_runner_download.download')}
                            </Button>
                        )}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        );
    },
);
