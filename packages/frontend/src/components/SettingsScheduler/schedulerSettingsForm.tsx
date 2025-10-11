import { type Project } from '@lightdash/common';
import { Button, Group, Text, Tooltip } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type z } from 'zod';

import MantineIcon from '../common/MantineIcon';
import TimeZonePicker from '../common/TimeZonePicker';
import { schedulerSettingsSchema } from './types';

type Props = {
    isLoading: boolean;
    project?: Project;
    onSubmit: (data: z.infer<typeof schedulerSettingsSchema>) => void;
};

export const SchedulerSettingsForm: FC<Props> = ({
    isLoading,
    project,
    onSubmit,
}) => {
    const { t } = useTranslation();

    const form = useForm<z.infer<typeof schedulerSettingsSchema>>({
        validate: zodResolver(schedulerSettingsSchema),
        initialValues: {
            timezone: project?.schedulerTimezone ?? 'UTC',
        },
    });

    const hasChanged = useMemo(
        () => form.values.timezone !== project?.schedulerTimezone,
        [form.values.timezone, project?.schedulerTimezone],
    );

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Group w="100%" gap="sm" align="flex-end">
                <TimeZonePicker
                    label={
                        <Group display="inline-flex" gap="xs">
                            {t(
                                'components_settings_scheduler.form.time_zone.label.part_1',
                            )}
                            <Tooltip
                                maw={400}
                                label={
                                    <Text fw={400}>
                                        {t(
                                            'components_settings_scheduler.form.time_zone.label.part_2',
                                        )}
                                    </Text>
                                }
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                    size="xs"
                    variant="default"
                    maw="100%"
                    searchable
                    {...form.getInputProps('timezone')}
                />

                <Button
                    type="submit"
                    size="xs"
                    disabled={!form.isValid() || !hasChanged}
                    loading={isLoading}
                >
                    {t('components_settings_scheduler.form.update')}
                </Button>
            </Group>
        </form>
    );
};
