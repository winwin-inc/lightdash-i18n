import {
    Box,
    Button,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import React, { useCallback, useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useScheduler } from '../hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../hooks/useSchedulersDeleteMutation';

interface DashboardDeleteModalProps extends ModalProps {
    schedulerUuid: string;
    onConfirm: () => void;
}

export const SchedulerDeleteModal: FC<DashboardDeleteModalProps> = ({
    schedulerUuid,
    onConfirm,
    onClose,
    opened,
}) => {
    const { t } = useTranslation();
    const scheduler = useScheduler(schedulerUuid);
    const mutation = useSchedulersDeleteMutation();

    useEffect(() => {
        if (mutation.isSuccess) {
            onConfirm();
        }
    }, [mutation.isSuccess, onConfirm]);

    const handleConfirm = useCallback(() => {
        mutation.mutate(schedulerUuid);
    }, [mutation, schedulerUuid]);

    return (
        <Modal
            opened={opened}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} size="lg" color="red" />
                    <Text fw={600}>
                        {t('feature_scheduler_delete_modal.title')}
                    </Text>
                </Group>
            }
            onClose={onClose}
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Box px="md" py="xl">
                {scheduler.isInitialLoading ? (
                    <Stack h={300} w="100%" align="center">
                        <Text fw={600}>
                            {t('feature_scheduler_delete_modal.content.part_1')}
                        </Text>
                        <Loader />
                    </Stack>
                ) : scheduler.isError ? (
                    <ErrorState error={scheduler.error.error} />
                ) : (
                    <Text span>
                        {t('feature_scheduler_delete_modal.content.part_2')}{' '}
                        <Text fw={700} span>
                            "{scheduler.data?.name}"
                        </Text>
                        ?
                    </Text>
                )}
            </Box>
            <Group
                position="right"
                p="md"
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[4]}`,
                })}
            >
                <Button onClick={onClose} color="dark" variant="outline">
                    {t('feature_scheduler_delete_modal.cancel')}
                </Button>
                {scheduler.isSuccess && (
                    <Button
                        loading={mutation.isLoading}
                        onClick={handleConfirm}
                        color="red"
                    >
                        {t('feature_scheduler_delete_modal.delete')}
                    </Button>
                )}
            </Group>
        </Modal>
    );
};
