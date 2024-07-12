import { ActionIcon, Group, Paper, Title, Tooltip } from '@mantine/core';
import { IconDeviceFloppy, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch } from '../store/hooks';
import { toggleModal } from '../store/sqlRunnerSlice';
import { SaveSqlChartModal } from './SaveSqlChartModal';

export const Header: FC = () => {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                <Group position="apart">
                    <Title order={2} c="gray.6">
                        {t('features_sql_runner_header.untitled_sql_query')}
                    </Title>
                    <Group spacing="md">
                        <Tooltip
                            variant="xs"
                            label={t('features_sql_runner_header.save_chart')}
                            position="bottom"
                        >
                            <ActionIcon size="xs">
                                <MantineIcon
                                    icon={IconDeviceFloppy}
                                    onClick={() =>
                                        dispatch(toggleModal('saveChartModal'))
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            variant="xs"
                            label={t('features_sql_runner_header.share_url')}
                            position="bottom"
                        >
                            <ActionIcon size="xs">
                                <MantineIcon icon={IconLink} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal />
        </>
    );
};
