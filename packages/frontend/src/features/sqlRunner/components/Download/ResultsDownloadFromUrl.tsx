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
import { useDownloadResults } from '../../hooks/useDownloadResults';
import { DEFAULT_SQL_LIMIT } from '../ContentPanel';

type Props = {
    fileUrl: string | undefined;
    columnNames: string[];
    chartName?: string;
};

export const ResultsDownloadFromUrl: FC<Props> = ({
    fileUrl,
    columnNames,
    chartName,
}) => {
    const { t } = useTranslation();

    const [customLimit, setCustomLimit] = useState(DEFAULT_SQL_LIMIT);
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
                        defaultValue={DEFAULT_SQL_LIMIT}
                        onChange={(value: number) => setCustomLimit(value)}
                    />
                    <Button
                        size="xs"
                        ml="auto"
                        leftIcon={<MantineIcon icon={IconDownload} />}
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
