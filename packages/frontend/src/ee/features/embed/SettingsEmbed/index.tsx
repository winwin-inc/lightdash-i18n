import {
    type ApiError,
    type DecodedEmbed,
    type UpdateEmbed,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    Paper,
    PasswordInput,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../../api';
import { EmptyState } from '../../../../components/common/EmptyState';
import MantineIcon from '../../../../components/common/MantineIcon';
import { SettingsGridCard } from '../../../../components/common/Settings/SettingsCard';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { useDashboards } from '../../../../hooks/dashboard/useDashboards';
import useToaster from '../../../../hooks/toaster/useToaster';
import useApp from '../../../../providers/App/useApp';
import EmbedDashboardsForm from './EmbedDashboardsForm';
import EmbedUrlForm from './EmbedUrlForm';

const useEmbedConfig = (projectUuid: string) => {
    return useQuery<DecodedEmbed, ApiError>({
        queryKey: ['embed-config'],
        queryFn: async () =>
            lightdashApi<DecodedEmbed>({
                url: `/embed/${projectUuid}/config`,
                method: 'GET',
                body: undefined,
            }),
        retry: false,
    });
};

const useEmbedConfigCreateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    const { t } = useTranslation();

    return useMutation<DecodedEmbed, ApiError, { dashboardUuids: string[] }>(
        ({ dashboardUuids }: { dashboardUuids: string[] }) =>
            lightdashApi<DecodedEmbed>({
                url: `/embed/${projectUuid}/config`,
                method: 'POST',
                body: JSON.stringify({
                    dashboardUuids,
                }),
            }),
        {
            mutationKey: ['create-embed-config'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['embed-config']);
                showToastSuccess({
                    title: t('ai_embed_settings_embed.create_tips.success'),
                });
            },
            onError: (error) => {
                showToastError({
                    title: t('ai_embed_settings_embed.create_tips.error'),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const useEmbedConfigUpdateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    const { t } = useTranslation();

    return useMutation<null, ApiError, UpdateEmbed>(
        ({ dashboardUuids, allowAllDashboards }: UpdateEmbed) =>
            lightdashApi<null>({
                url: `/embed/${projectUuid}/config/dashboards`,
                method: 'PATCH',
                body: JSON.stringify({
                    dashboardUuids,
                    allowAllDashboards,
                }),
            }),
        {
            mutationKey: ['update-embed-config'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['embed-config']);
                showToastSuccess({
                    title: t('ai_embed_settings_embed.update_tips.success'),
                });
            },
            onError: (error) => {
                showToastError({
                    title: t('ai_embed_settings_embed.update_tips.error'),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const SettingsEmbed: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { health } = useApp();
    const { isLoading, data: embedConfig, error } = useEmbedConfig(projectUuid);
    const { isLoading: isLoadingDashboards, data: dashboards } = useDashboards(
        projectUuid,
        undefined,
        true,
    );
    const { mutate: createEmbedConfig, isLoading: isCreating } =
        useEmbedConfigCreateMutation(projectUuid);
    const { mutate: updateEmbedConfig, isLoading: isUpdating } =
        useEmbedConfigUpdateMutation(projectUuid);
    const { t } = useTranslation();

    const isSaving = isCreating || isUpdating;
    const allowedDashboards = useMemo(() => {
        if (!dashboards || !embedConfig) {
            return [];
        }
        if (embedConfig.allowAllDashboards) {
            return dashboards;
        }
        return dashboards.filter((dashboard) =>
            embedConfig.dashboardUuids.includes(dashboard.uuid),
        );
    }, [dashboards, embedConfig]);

    if (isLoading || isLoadingDashboards || !health.data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('ai_embed_settings_embed.loading_embed_config')}
                    loading
                />
            </div>
        );
    }

    if (error && error.error.statusCode !== 404) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('ai_embed_settings_embed.not_available')}
                    description={error.error.message}
                    icon={IconAlertCircle}
                />
            </div>
        );
    }

    if (!embedConfig) {
        return (
            <Stack mb="lg">
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconKey}
                            color="gray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title={t('ai_embed_settings_embed.no_embed_secret')}
                    description={t(
                        'ai_embed_settings_embed.no_embed_secret_description',
                    )}
                >
                    <Button
                        disabled={isSaving}
                        onClick={() =>
                            createEmbedConfig({ dashboardUuids: [] })
                        }
                    >
                        {t('ai_embed_settings_embed.generate_embed_secret')}
                    </Button>
                </EmptyState>
            </Stack>
        );
    }

    return (
        <Stack mb="lg">
            <SettingsGridCard>
                <Stack spacing="sm">
                    <Title order={4}>
                        {t('ai_embed_settings_embed.embed_secret')}
                    </Title>
                    <Text color="dimmed">
                        {t('ai_embed_settings_embed.embed_secret_description')}
                    </Text>
                    <Text color="dimmed" fz="xs">
                        {t('ai_embed_settings_embed.embed_secret_read_more')}{' '}
                        <Anchor href="https://docs.lightdash.com/references/embedding">
                            {t(
                                'ai_embed_settings_embed.embed_secret_docs_guide',
                            )}
                        </Anchor>
                    </Text>
                </Stack>
                <Stack>
                    <PasswordInput
                        value={embedConfig.secret}
                        label={t('ai_embed_settings_embed.secret')}
                        readOnly
                    />
                    <Flex justify="flex-end" gap="sm">
                        <Button
                            disabled={isSaving}
                            onClick={() =>
                                createEmbedConfig({
                                    dashboardUuids: embedConfig.dashboardUuids,
                                })
                            }
                        >
                            {t('ai_embed_settings_embed.generate_new_secret')}
                        </Button>
                    </Flex>
                </Stack>
            </SettingsGridCard>
            <Paper shadow="sm" withBorder p="md">
                <Stack spacing="sm" mb="md">
                    <Title order={4}>
                        {t('ai_embed_settings_embed.allowed_dashboards')}
                    </Title>
                </Stack>
                <EmbedDashboardsForm
                    disabled={isSaving}
                    embedConfig={embedConfig}
                    dashboards={dashboards || []}
                    onSave={updateEmbedConfig}
                />
            </Paper>
            <Paper shadow="sm" withBorder p="md">
                <Stack spacing="sm" mb="md">
                    <Title order={4}>
                        {t('ai_embed_settings_embed.preview_and_code_snippet')}
                    </Title>
                </Stack>
                <EmbedUrlForm
                    projectUuid={projectUuid}
                    siteUrl={health.data.siteUrl}
                    dashboards={allowedDashboards}
                />
            </Paper>
        </Stack>
    );
};

export default SettingsEmbed;
