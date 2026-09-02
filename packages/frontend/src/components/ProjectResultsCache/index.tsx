import {
    MAX_RESULTS_CACHE_TTL_SECONDS,
    MIN_RESULTS_CACHE_TTL_SECONDS,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    NumberInput,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useResultsCacheSettings,
    useUpdateResultsCacheSettings,
} from '../../hooks/useProjectResultsCacheSettings';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

const MIN_TTL_MINUTES = MIN_RESULTS_CACHE_TTL_SECONDS / 60;
const MAX_TTL_MINUTES = MAX_RESULTS_CACHE_TTL_SECONDS / 60;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

type TranslateFn = (
    key: string,
    options?: Record<string, string | number>,
) => string;

const formatDuration = (minutes: number, t: TranslateFn): string => {
    if (minutes >= 2 * MINUTES_PER_DAY && minutes % MINUTES_PER_DAY === 0) {
        const days = minutes / MINUTES_PER_DAY;
        return `${days} ${t(
            days === 1
                ? 'components_project_results_cache.units.day'
                : 'components_project_results_cache.units.days',
        )}`;
    }
    if (minutes > MINUTES_PER_HOUR) {
        const hours = minutes / MINUTES_PER_HOUR;
        const displayHours = Number.isInteger(hours)
            ? hours
            : Number(hours.toFixed(1));
        return `${displayHours} ${t(
            displayHours === 1
                ? 'components_project_results_cache.units.hour'
                : 'components_project_results_cache.units.hours',
        )}`;
    }
    return `${minutes} ${t(
        minutes === 1
            ? 'components_project_results_cache.units.minute'
            : 'components_project_results_cache.units.minutes',
    )}`;
};

const formatDurationHint = (
    minutes: number | '',
    t: TranslateFn,
): string | null =>
    typeof minutes === 'number' && minutes > MINUTES_PER_HOUR
        ? t('components_project_results_cache.ttl_hint', {
              duration: formatDuration(minutes, t),
          })
        : null;

type FormValues = {
    useInstanceDefault: boolean;
    ttlMinutes: number | '';
};

type FormProps = {
    projectUuid: string;
    initialTtlSeconds: number | null;
    instanceDefaultSeconds: number;
};

const ProjectResultsCacheForm: FC<FormProps> = ({
    projectUuid,
    initialTtlSeconds,
    instanceDefaultSeconds,
}) => {
    const { t } = useTranslation();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateResultsCacheSettings(projectUuid);
    const instanceDefaultMinutes = Math.round(instanceDefaultSeconds / 60);

    const form = useForm<FormValues>({
        initialValues: {
            useInstanceDefault: initialTtlSeconds === null,
            ttlMinutes:
                initialTtlSeconds === null
                    ? instanceDefaultMinutes
                    : Math.round(initialTtlSeconds / 60),
        },
        validate: {
            ttlMinutes: (value, values) => {
                if (values.useInstanceDefault) return null;
                if (
                    typeof value !== 'number' ||
                    !Number.isInteger(value) ||
                    value < MIN_TTL_MINUTES ||
                    value > MAX_TTL_MINUTES
                ) {
                    return t('components_project_results_cache.ttl_error', {
                        min: MIN_TTL_MINUTES,
                        max: MAX_TTL_MINUTES,
                    });
                }
                return null;
            },
        },
    });

    return (
        <form
            onSubmit={form.onSubmit(({ useInstanceDefault, ttlMinutes }) => {
                if (useInstanceDefault) {
                    updateSettings({ cacheTtlSeconds: null });
                } else if (typeof ttlMinutes === 'number') {
                    updateSettings({ cacheTtlSeconds: ttlMinutes * 60 });
                }
            })}
        >
            <Stack gap="md">
                <Switch
                    label={t('components_project_results_cache.use_default')}
                    description={t(
                        'components_project_results_cache.default_expires',
                        {
                            duration: formatDuration(
                                instanceDefaultMinutes,
                                t,
                            ),
                        },
                    )}
                    disabled={isUpdating}
                    {...form.getInputProps('useInstanceDefault', {
                        type: 'checkbox',
                    })}
                />

                <NumberInput
                    label={t('components_project_results_cache.ttl_label')}
                    min={MIN_TTL_MINUTES}
                    max={MAX_TTL_MINUTES}
                    step={1}
                    rightSectionWidth={90}
                    rightSection={
                        <Text c="ldGray.6" fz="xs">
                            {formatDurationHint(form.values.ttlMinutes, t)}
                        </Text>
                    }
                    disabled={isUpdating || form.values.useInstanceDefault}
                    {...form.getInputProps('ttlMinutes')}
                />

                <Group justify="flex-end">
                    <Button
                        type="submit"
                        loading={isUpdating}
                        disabled={isUpdating || !form.isValid()}
                    >
                        {t('components_project_results_cache.save')}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

type Props = {
    projectUuid: string;
};

const ProjectResultsCache: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation();
    const { data: settings, isLoading } = useResultsCacheSettings(projectUuid);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>
                    {t('components_project_results_cache.title')}
                </Title>
                <Text c="ldGray.6" fz="xs">
                    {t('components_project_results_cache.description')}
                </Text>
            </Box>
            {isLoading || !settings ? (
                <Loader size="sm" />
            ) : (
                <ProjectResultsCacheForm
                    projectUuid={projectUuid}
                    initialTtlSeconds={settings.cacheTtlSeconds}
                    instanceDefaultSeconds={settings.instanceDefaultTtlSeconds}
                />
            )}
        </SettingsGridCard>
    );
};

export default ProjectResultsCache;
