import { Button, Group, Stack, Text } from '@mantine/core';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import ErrorState from '../../../components/common/ErrorState';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useScheduler } from '../../../features/scheduler/hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../../../features/scheduler/hooks/useSchedulersDeleteMutation';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';

export const SyncModalDelete = () => {
    const { t } = useTranslation();
    const { currentSchedulerUuid, setAction } = useSyncModal();
    const scheduler = useScheduler(currentSchedulerUuid ?? '');
    const {
        mutate: deleteScheduler,
        isLoading,
        isSuccess: isSchedulerDeleteSuccessful,
    } = useSchedulersDeleteMutation();

    useEffect(() => {
        if (isSchedulerDeleteSuccessful) {
            setAction(SyncModalAction.VIEW);
        }
    }, [isSchedulerDeleteSuccessful, setAction]);

    const handleConfirm = useCallback(() => {
        if (!currentSchedulerUuid) return;
        deleteScheduler(currentSchedulerUuid);
    }, [deleteScheduler, currentSchedulerUuid]);

    if (scheduler.isInitialLoading) {
        return (
            <SuboptimalState
                title={t('features_sync.modal_delete.loading_sync')}
                loading
            />
        );
    }

    if (scheduler.error) {
        return <ErrorState error={scheduler.error.error} />;
    }

    return (
        <Stack spacing="lg">
            <Text>
                {t('features_sync.modal_delete.content')}{' '}
                <b>"{scheduler.data?.name}"</b>?
            </Text>

            <Group position="apart">
                <Button
                    variant="outline"
                    color="dark"
                    onClick={() => setAction(SyncModalAction.VIEW)}
                >
                    {t('features_sync.modal_delete.cancel')}
                </Button>

                {scheduler.isSuccess && (
                    <Button
                        color="red"
                        loading={isLoading}
                        onClick={handleConfirm}
                    >
                        {t('features_sync.modal_delete.delete')}
                    </Button>
                )}
            </Group>
        </Stack>
    );
};
