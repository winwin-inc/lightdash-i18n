import {
    getHumanReadableCronExpression,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCircleFilled, IconPencil, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useSchedulersEnabledUpdateMutation } from '../hooks/useSchedulersUpdateMutation';

type SchedulersListItemProps = {
    scheduler: SchedulerAndTargets;
    onEdit: (schedulerUuid: string) => void;
    onDelete: (schedulerUuid: string) => void;
};

const SchedulersListItem: FC<SchedulersListItemProps> = ({
    scheduler,
    onEdit,
    onDelete,
}) => {
    const { t } = useTranslation();
    const { mutate: mutateSchedulerEnabled } =
        useSchedulersEnabledUpdateMutation(scheduler.schedulerUuid);

    return (
        <Paper p="sm" mb="xs" withBorder sx={{ overflow: 'hidden' }}>
            <Group noWrap position="apart">
                <Stack spacing="xs" w={475}>
                    <Text fw={600} truncate>
                        {scheduler.name}
                    </Text>
                    <Group>
                        <Text color="gray" size={12}>
                            {getHumanReadableCronExpression(scheduler.cron)}
                        </Text>

                        {/* TODO: This icon should use Mantine icon,
                            but MantineIcon doesn't support filled icons atm.
                            Util we fix that, this style is imperfect
                        */}
                        <Box
                            sx={(theme) => ({
                                color: theme.colors.gray[4],
                                marginTop: '-6px',
                            })}
                        >
                            <IconCircleFilled style={{ width: 5, height: 5 }} />
                        </Box>

                        <Text color="gray" size={12}>
                            {scheduler.targets.length}{' '}
                            {t('features_scheduler_list_item.recipients')}
                        </Text>
                    </Group>
                </Stack>
                <Group noWrap spacing="xs">
                    <Tooltip
                        label={
                            scheduler.enabled
                                ? t(
                                      'features_scheduler_list_item.tooltip_scheduler.enabled',
                                  )
                                : t(
                                      'features_scheduler_list_item.tooltip_scheduler.disabled',
                                  )
                        }
                    >
                        <Box>
                            <Switch
                                mr="sm"
                                onLabel="on"
                                offLabel="paused"
                                checked={scheduler.enabled}
                                onChange={() => {
                                    mutateSchedulerEnabled(!scheduler.enabled);
                                }}
                            />
                        </Box>
                    </Tooltip>
                    <Tooltip label={t('features_scheduler_list_item.edit')}>
                        <ActionIcon
                            variant="light"
                            onClick={() => onEdit(scheduler.schedulerUuid)}
                        >
                            <MantineIcon icon={IconPencil} />
                        </ActionIcon>
                    </Tooltip>
                    <ActionIcon
                        variant="light"
                        onClick={() => onDelete(scheduler.schedulerUuid)}
                    >
                        <MantineIcon color="red" icon={IconTrash} />
                    </ActionIcon>
                </Group>
            </Group>
        </Paper>
    );
};

export default SchedulersListItem;
