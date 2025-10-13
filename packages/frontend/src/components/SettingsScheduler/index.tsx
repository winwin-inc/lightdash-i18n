import { getErrorMessage, isApiError } from '@lightdash/common';
import { Card, Group, LoadingOverlay, Title } from '@mantine-8/core';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import useToaster from '../../hooks/toaster/useToaster';
import {
    useProject,
    useProjectUpdateSchedulerSettings,
} from '../../hooks/useProject';
import SchedulersView from '../SchedulersView';
import { SchedulerSettingsForm } from './schedulerSettingsForm';
import { type schedulerSettingsSchema } from './types';

type SettingsSchedulerProps = {
    projectUuid: string;
};

const SettingsScheduler: FC<SettingsSchedulerProps> = ({ projectUuid }) => {
    const { t } = useTranslation();
    const { showToastError, showToastSuccess } = useToaster();
    const { data: project, isLoading: isLoadingProject } =
        useProject(projectUuid);

    const projectMutation = useProjectUpdateSchedulerSettings(projectUuid);

    const handleSubmit = useCallback(
        async (schedulerSettings: z.infer<typeof schedulerSettingsSchema>) => {
            const { timezone } = schedulerSettings;
            try {
                await projectMutation.mutateAsync({
                    schedulerTimezone: timezone,
                });

                showToastSuccess({
                    title: t('components_settings_scheduler.tips.success'),
                });
            } catch (e) {
                const errorMessage = isApiError(e)
                    ? e.error.message
                    : getErrorMessage(e);
                showToastError({
                    title: t('components_settings_scheduler.tips.failed'),
                    subtitle: errorMessage,
                });
            }

            return false;
        },
        [projectMutation, showToastError, showToastSuccess, t],
    );

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />
            <Card>
                <Group justify="space-between">
                    <Title order={4}>
                        {t('components_settings_scheduler.settings')}
                    </Title>

                    <SchedulerSettingsForm
                        isLoading={false}
                        project={project}
                        onSubmit={handleSubmit}
                    />
                </Group>
            </Card>

            <SchedulersView projectUuid={projectUuid} />
        </>
    );
};

export default SettingsScheduler;
