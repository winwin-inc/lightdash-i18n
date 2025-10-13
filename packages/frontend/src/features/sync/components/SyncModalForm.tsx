import {
    formatMinutesOffset,
    getTzMinutesOffset,
    isSchedulerGsheetsOptions,
    SchedulerFormat,
    type CreateSchedulerAndTargetsWithoutIds,
    type UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Input,
    Space,
    Stack,
    Switch,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCirclesRelation, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import TimeZonePicker from '../../../components/common/TimeZonePicker';
import CronInput from '../../../components/ReactHookForm/CronInput';
import { useChartSchedulerCreateMutation } from '../../../features/scheduler/hooks/useChartSchedulers';
import { useScheduler } from '../../../features/scheduler/hooks/useScheduler';
import { useSchedulersUpdateMutation } from '../../../features/scheduler/hooks/useSchedulersUpdateMutation';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { SelectGoogleSheetButton } from './SelectGoogleSheetButton';

export const SyncModalForm: FC<{ chartUuid: string }> = ({ chartUuid }) => {
    const { t } = useTranslation();
    const { action, setAction, currentSchedulerUuid } = useSyncModal();

    const isEditing = action === SyncModalAction.EDIT;
    const {
        data: schedulerData,
        isInitialLoading: isLoadingSchedulerData,
        isError: isSchedulerError,
        error: schedulerError,
    } = useScheduler(currentSchedulerUuid ?? '', {
        enabled: !!currentSchedulerUuid && isEditing,
    });

    const {
        mutate: updateChartSync,
        isLoading: isUpdateChartSyncLoading,
        isSuccess: isUpdateChartSyncSuccess,
    } = useSchedulersUpdateMutation(currentSchedulerUuid ?? '');
    const {
        mutate: createChartSync,
        isLoading: isCreateChartSyncLoading,
        isSuccess: isCreateChartSyncSuccess,
    } = useChartSchedulerCreateMutation();

    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);

    const [saveInNewTab, setSaveInNewTab] = useState(false);
    const isLoading = isCreateChartSyncLoading || isUpdateChartSyncLoading;
    const isSuccess = isCreateChartSyncSuccess || isUpdateChartSyncSuccess;

    const methods = useForm<CreateSchedulerAndTargetsWithoutIds>({
        mode: 'onChange',
        defaultValues: {
            cron: '0 9 * * *',
            name: '',
            options: {
                gdriveId: '',
                gdriveName: '',
                gdriveOrganizationName: '',
                url: '',
                tabName: '',
            },
            timezone: undefined,
        },
    });

    useEffect(() => {
        if (schedulerData && isEditing) {
            methods.reset(schedulerData);
            methods.setValue('timezone', schedulerData.timezone);

            if (
                isSchedulerGsheetsOptions(schedulerData.options) &&
                schedulerData.options.tabName
            ) {
                setSaveInNewTab(true);
            }
        }
    }, [isEditing, methods, schedulerData]);

    const handleSubmit = async (
        data:
            | CreateSchedulerAndTargetsWithoutIds
            | UpdateSchedulerAndTargetsWithoutId,
    ) => {
        if (!methods.formState.isValid) {
            console.error(
                'Unable to send form with errors',
                methods.formState.errors,
            );
            return;
        }

        const defaultNewSchedulerValues = {
            format: SchedulerFormat.GSHEETS,
            enabled: true,
            targets: [],
        };

        const payload = {
            ...data,
            ...defaultNewSchedulerValues,
            timezone: data.timezone || undefined,
            options: {
                ...data.options,
                tabName:
                    saveInNewTab && isSchedulerGsheetsOptions(data.options)
                        ? data.options.tabName
                        : undefined,
            },
        };

        if (isEditing) {
            updateChartSync(payload);
        } else {
            createChartSync({
                resourceUuid: chartUuid,
                data: payload,
            });
        }
    };

    useEffect(() => {
        if (isSuccess) {
            methods.reset();
            setAction(SyncModalAction.VIEW);
        }
    }, [isSuccess, methods, setAction]);

    const hasSetGoogleSheet = methods.watch('options.gdriveId') !== '';

    const projectDefaultOffsetString = useMemo(() => {
        if (!project) {
            return;
        }
        const minsOffset = getTzMinutesOffset('UTC', project.schedulerTimezone);
        return formatMinutesOffset(minsOffset);
    }, [project]);

    const timezoneValue = methods.watch('timezone');

    if (isEditing && isLoadingSchedulerData) {
        return (
            <SuboptimalState
                title={t('features_sync.form.loading_sync')}
                loading
            />
        );
    }

    if (isEditing && isSchedulerError) {
        return <ErrorState error={schedulerError.error} />;
    }
    return (
        <FormProvider {...methods}>
            <form onSubmit={methods.handleSubmit(handleSubmit)}>
                <Stack>
                    <TextInput
                        label={t('features_sync.form.name.label')}
                        required
                        {...methods.register('name')}
                    />
                    <Group align="flex-end">
                        <Input.Wrapper
                            label={t('features_sync.form.frequency.label')}
                            required
                        >
                            <Box>
                                <CronInput
                                    name="cron"
                                    defaultValue="0 9 * * 1"
                                    rules={{
                                        required: t(
                                            'features_sync.form.frequency.require_field',
                                        ),
                                        validate: {
                                            isValidCronExpression:
                                                isInvalidCronExpression(
                                                    'Cron expression',
                                                ),
                                        },
                                    }}
                                />
                            </Box>
                        </Input.Wrapper>
                        <TimeZonePicker
                            size="sm"
                            style={{ flexGrow: 1 }}
                            placeholder={`${t(
                                'features_sync.form.default_project',
                            )}t ${
                                projectDefaultOffsetString
                                    ? `(UTC ${projectDefaultOffsetString})`
                                    : ''
                            }`}
                            maw={350}
                            searchable
                            clearable
                            variant="default"
                            comboboxProps={{
                                withinPortal: true,
                            }}
                            {...methods.register('timezone')}
                            onChange={(value) => {
                                methods.setValue(
                                    'timezone',
                                    value || undefined,
                                );
                            }}
                            value={timezoneValue}
                        />
                    </Group>

                    <SelectGoogleSheetButton />

                    <Group>
                        <Switch
                            label={t(
                                'features_sync.form.save_in_new_tab.label',
                            )}
                            checked={saveInNewTab}
                            onChange={() => setSaveInNewTab(!saveInNewTab)}
                        ></Switch>
                        <Tooltip
                            label={t(
                                'features_sync.form.save_in_new_tab.tooltip',
                            )}
                            multiline
                            withinPortal
                            position="right"
                            maw={400}
                        >
                            <MantineIcon icon={IconInfoCircle} color="gray.6" />
                        </Tooltip>
                    </Group>
                    {saveInNewTab && (
                        <TextInput
                            required
                            label={t('features_sync.form.tab_name.label')}
                            placeholder={t(
                                'features_sync.form.tab_name.placeholder',
                            )}
                            error={
                                methods.formState.errors.options &&
                                `tabName` in methods.formState.errors.options &&
                                methods.formState.errors.options?.tabName
                                    ?.message
                            }
                            {...methods.register('options.tabName', {
                                validate: (value) => {
                                    if (value?.toLowerCase() === 'metadata') {
                                        return t(
                                            'features_sync.form.tab_name.error',
                                        );
                                    }
                                    return true;
                                },
                            })}
                        />
                    )}
                    <Space />

                    <Group position="apart">
                        <Button
                            variant="outline"
                            loading={isLoading}
                            onClick={() => setAction(SyncModalAction.VIEW)}
                        >
                            {t('features_sync.form.cancel')}
                        </Button>

                        <Button
                            type="submit"
                            disabled={
                                !hasSetGoogleSheet || !methods.formState.isValid
                            }
                            loading={isLoading}
                            leftIcon={
                                !isEditing && (
                                    <MantineIcon icon={IconCirclesRelation} />
                                )
                            }
                        >
                            {isEditing
                                ? t('features_sync.form.save_changes')
                                : t('features_sync.form.sync')}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </FormProvider>
    );
};
