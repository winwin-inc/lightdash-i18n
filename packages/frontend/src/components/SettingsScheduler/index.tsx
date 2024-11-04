import { LoadingOverlay, Stack, Title } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import useToaster from '../../hooks/toaster/useToaster';
import {
    useProject,
    useProjectUpdateSchedulerSettings,
} from '../../hooks/useProject';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import SchedulersView from '../SchedulersView';
import SchedulerSettingsForm, {
    type schedulerSettingsSchema,
} from './schedulerSettingsForm';

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
                showToastError({
                    title: t('components_settings_scheduler.tips.failed'),
                    ...(e.error.message ? { subtitle: e.error.message } : {}),
                });
            }

            return false;
        },
        [projectMutation, showToastError, showToastSuccess, t],
    );

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />
            <SettingsGridCard>
                <Stack spacing="sm">
                    <Title order={4}>
                        {t('components_settings_scheduler.title')}
                    </Title>
                </Stack>

                <SchedulerSettingsForm
                    isLoading={false}
                    project={project}
                    onSubmit={handleSubmit}
                />
            </SettingsGridCard>
            <SchedulersView projectUuid={projectUuid} />
        </>
    );
};

export default SettingsScheduler;
