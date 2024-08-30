import { type CreateDbtCloudIntegration } from '@lightdash/common/dist/types/dbtCloud';
import {
    Anchor,
    Button,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconAlertCircle, IconHelp } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
    useProjectDbtCloud,
    useProjectDbtCloudDeleteMutation,
    useProjectDbtCloudUpdateMutation,
} from '../../hooks/dbtCloud/useProjectDbtCloudSettings';
import MantineIcon from '../common/MantineIcon';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

interface DbtCloudSettingsProps {
    projectUuid: string;
}

const DbtCloudSettings: FC<DbtCloudSettingsProps> = ({ projectUuid }) => {
    const { t } = useTranslation();

    const schema = z.object({
        serviceToken: z.string().nonempty({
            message: t(
                'components_dbt_cloud_settings.schema_valdation.server_token',
            ),
        }),
        metricsJobId: z.string().nonempty({
            message: t('components_dbt_cloud_settings.schema_valdation.job_id'),
        }),
    });

    const form = useForm<CreateDbtCloudIntegration>({
        validate: zodResolver(schema),
        initialValues: {
            serviceToken: '',
            metricsJobId: '',
        },
    });
    const dbtCloudSettings = useProjectDbtCloud(projectUuid, {
        staleTime: 0,
        onSuccess: (data) => {
            form.setFieldValue('metricsJobId', data?.metricsJobId ?? '');
        },
    });
    const updateDbtCloud = useProjectDbtCloudUpdateMutation(projectUuid);
    const deletDbtCloud = useProjectDbtCloudDeleteMutation(projectUuid);

    const handleSubmit = (data: CreateDbtCloudIntegration) => {
        updateDbtCloud.mutate(data);
    };

    const handleClear = async () => {
        deletDbtCloud.mutate(undefined);
    };

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            {dbtCloudSettings.error ? (
                <SuboptimalState
                    title={dbtCloudSettings.error.error.message}
                    icon={IconAlertCircle}
                />
            ) : (
                <SettingsGridCard>
                    <Stack spacing="sm">
                        <Title order={4}>
                            {t('components_dbt_cloud_settings.form.title')}
                        </Title>

                        <Text color="dimmed">
                            {t(
                                'components_dbt_cloud_settings.form.content.part_1',
                            )}
                        </Text>
                        <Text color="dimmed">
                            {t(
                                'components_dbt_cloud_settings.form.content.part_2',
                            )}{' '}
                            <Anchor href="https://docs.lightdash.com/references/dbt-semantic-layer">
                                {t(
                                    'components_dbt_cloud_settings.form.content.part_3',
                                )}
                            </Anchor>
                        </Text>
                    </Stack>

                    <Stack>
                        <PasswordInput
                            {...form.getInputProps('serviceToken')}
                            label={
                                <Group display="inline-flex" spacing="xs">
                                    {t(
                                        'components_dbt_cloud_settings.form.password.label',
                                    )}
                                    <Tooltip
                                        maw={400}
                                        label={t(
                                            'components_dbt_cloud_settings.form.password.tooltip.label',
                                        )}
                                        multiline
                                    >
                                        <MantineIcon
                                            icon={IconHelp}
                                            color="gray.6"
                                        />
                                    </Tooltip>
                                </Group>
                            }
                            readOnly
                            disabled
                        />

                        <TextInput
                            {...form.getInputProps('metricsJobId')}
                            label={
                                <Group display="inline-flex" spacing="xs">
                                    {t(
                                        'components_dbt_cloud_settings.form.environment.label',
                                    )}
                                    <Tooltip
                                        maw={400}
                                        label={t(
                                            'components_dbt_cloud_settings.form.environment.tooltip.label',
                                        )}
                                        multiline
                                    >
                                        <MantineIcon
                                            icon={IconHelp}
                                            color="gray.6"
                                        />
                                    </Tooltip>
                                </Group>
                            }
                            readOnly
                            disabled
                        />

                        <Group ml="auto">
                            {dbtCloudSettings.data?.metricsJobId && (
                                <Button
                                    disabled
                                    variant="default"
                                    onClick={() => handleClear()}
                                >
                                    {t(
                                        'components_dbt_cloud_settings.form.clear',
                                    )}
                                </Button>
                            )}

                            <Button
                                type="submit"
                                disabled
                                loading={dbtCloudSettings.isInitialLoading}
                            >
                                {t('components_dbt_cloud_settings.form.save')}
                            </Button>
                        </Group>
                    </Stack>
                </SettingsGridCard>
            )}
        </form>
    );
};

export default DbtCloudSettings;
