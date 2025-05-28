import {
    ActionIcon,
    Button,
    NumberInput,
    Popover,
    Stack,
    Tooltip,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../components/common/MantineIcon';
import { DEFAULT_SQL_LIMIT } from '../../constants';
import { useDownloadResults } from '../../hooks/useDownloadResults';

type Props = {
    fileUrl: string | undefined;
    columnNames: string[];
    chartName?: string;
    defaultQueryLimit?: number;
};

export const ResultsDownloadFromUrl: FC<Props> = ({
    fileUrl,
    columnNames,
    chartName,
    defaultQueryLimit,
}) => {
    const { t } = useTranslation();

    const [customLimit, setCustomLimit] = useState(defaultQueryLimit);
    const { handleDownload, isLoading } = useDownloadResults({
        fileUrl,
        columnNames,
        chartName,
        customLimit:
            customLimit !== DEFAULT_SQL_LIMIT ? customLimit : undefined,
    });
    return (
        <Popover
            withArrow
            disabled={!fileUrl}
            closeOnClickOutside={!isLoading}
            closeOnEscape={!isLoading}
        >
            <Popover.Target>
                <Tooltip
                    variant="xs"
                    label={t('features_sql_runner_download.download_results')}
                >
                    <ActionIcon variant="default" disabled={!fileUrl}>
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack>
                    <NumberInput
                        size="xs"
                        type="number"
                        label={t('features_sql_runner_download.limit')}
                        step={100}
                        min={1}
                        autoFocus
                        required
                        defaultValue={customLimit}
                        onChange={(value: number) => setCustomLimit(value)}
                    />
                    <Button
                        size="xs"
                        ml="auto"
                        onClick={handleDownload}
                        loading={isLoading}
                    >
                        {t('features_sql_runner_download.download')}
                    </Button>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
