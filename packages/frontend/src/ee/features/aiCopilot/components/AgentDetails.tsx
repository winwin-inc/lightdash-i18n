import { type BaseAiAgent } from '@lightdash/common';
import {
    Button,
    Card,
    Group,
    MantineProvider,
    MultiSelect,
    Select,
    Stack,
    Tabs,
    TagsInput,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconArrowLeft,
    IconCheck,
    IconDatabase,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';

import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useGetSlack,
    useSlackChannels,
} from '../../../../hooks/slack/useSlack';
import { useProjects } from '../../../../hooks/useProjects';
import {
    useAiAgent,
    useAiAgents,
    useCreateAiAgentMutation,
    useDeleteAiAgentMutation,
    useUpdateAiAgentMutation,
} from '../hooks/useAiAgents';
import { AgentAvatar } from './AgentAvatar';
import { ConversationsList } from './ConversationsList';

export const AgentDetails: FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { agentId } = useParams<{ agentId: string }>();
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const { mutateAsync: createAgent, isLoading: isCreating } =
        useCreateAiAgentMutation();
    const { mutateAsync: updateAgent, isLoading: isUpdating } =
        useUpdateAiAgentMutation();
    const isCreateMode = agentId === 'new';
    const agentUuid = !isCreateMode && agentId ? agentId : undefined;

    const formSchema: z.ZodType<
        Pick<BaseAiAgent, 'name' | 'projectUuid' | 'integrations' | 'tags'>
    > = z.object({
        name: z.string().min(1),
        projectUuid: z
            .string({
                message: t('features_ai_copilot.validation.select_project'),
            })
            .uuid({
                message: t('features_ai_copilot.validation.invalid_project'),
            }),
        integrations: z.array(
            z.object({
                type: z.literal('slack'),
                channelId: z.string().min(1),
            }),
        ),
        tags: z.array(z.string()).nullable(),
    });

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(
        agentUuid || '',
        {
            enabled: !!agentUuid,
        },
    );
    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation();

    const { data: slackInstallation } = useGetSlack();

    const { data: agents, isSuccess: isSuccessAgents } = useAiAgents();

    const {
        data: slackChannels,
        refresh: refreshChannels,
        isLoading: isRefreshing,
    } = useSlackChannels('', true, {
        enabled: !!slackInstallation?.organizationUuid && isSuccessAgents,
    });
    const { data: projects } = useProjects();

    const slackChannelOptions = useMemo(
        () =>
            slackChannels?.map((channel) => ({
                value: channel.id,
                label: channel.name,
                disabled: agents?.some((a) =>
                    a.integrations.some((i) => i.channelId === channel.id),
                ),
            })) ?? [],
        [slackChannels, agents],
    );

    const form = useForm<z.infer<typeof formSchema>>({
        initialValues: {
            name: '',
            projectUuid: '',
            integrations: [],
            tags: null,
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (isCreateMode || !agent) {
            return;
        }

        if (!form.initialized) {
            form.setValues({
                name: agent.name,
                projectUuid: agent.projectUuid,
                integrations: agent.integrations,
                tags: agent.tags && agent.tags.length > 0 ? agent.tags : null,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, isCreateMode]);

    const projectOptions = useMemo(() => {
        return (
            projects?.map((project) => ({
                value: project.projectUuid,
                label: project.name,
            })) ?? []
        );
    }, [projects]);

    const handleBack = () => {
        void navigate('/generalSettings/aiAgents');
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (isCreateMode) {
            await createAgent(values);
        } else if (agentUuid) {
            await updateAgent({
                uuid: agentUuid,
                ...values,
            });
        }
    });

    const handleDeleteClick = useCallback(() => {
        setDeleteModalOpen(true);
    }, []);

    const handleDelete = useCallback(async () => {
        if (!agentUuid) {
            return;
        }

        await deleteAgent(agentUuid);
        setDeleteModalOpen(false);
        void navigate('/generalSettings/aiAgents');
    }, [navigate, agentUuid, deleteAgent]);

    const handleCancelDelete = useCallback(() => {
        setDeleteModalOpen(false);
    }, []);

    if (!isCreateMode && agentUuid && !agent && !isLoadingAgent) {
        return (
            <MantineProvider>
                <Stack gap="md">
                    <Group gap="xs">
                        <Button
                            variant="subtle"
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                            onClick={handleBack}
                        >
                            {t('features_ai_copilot.back_to_agents')}
                        </Button>
                    </Group>
                    <Card withBorder p="xl">
                        <Text>{t('features_ai_copilot.agent_not_found')}</Text>
                    </Card>
                </Stack>
            </MantineProvider>
        );
    }

    return (
        <MantineProvider>
            <Stack gap="sm">
                <Group gap="xs">
                    <Button
                        variant="subtle"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={handleBack}
                    >
                        {t('features_ai_copilot.back_to_agents')}
                    </Button>
                </Group>

                <Card withBorder p="xl">
                    <Stack gap="xl">
                        <Group gap="md">
                            <AgentAvatar
                                name={isCreateMode ? '+' : form.values.name}
                            />

                            <Title order={3}>
                                {isCreateMode
                                    ? t('features_ai_copilot.new_agent')
                                    : form.values.name ||
                                      t('features_ai_copilot.agent')}
                                {!isCreateMode && (
                                    <Text size="sm" c="dimmed">
                                        {t('features_ai_copilot.last_modified')}
                                        :{' '}
                                        {new Date(
                                            agent?.updatedAt ?? new Date(),
                                        ).toLocaleString()}
                                    </Text>
                                )}
                            </Title>
                        </Group>
                        <Tabs
                            defaultValue="general"
                            styles={{
                                panel: {
                                    paddingTop: 'xs',
                                },
                            }}
                        >
                            <Tabs.List>
                                <Tabs.Tab value="general">General</Tabs.Tab>
                                {!isCreateMode && (
                                    <Tabs.Tab value="conversations">
                                        {t('features_ai_copilot.conversations')}
                                    </Tabs.Tab>
                                )}
                            </Tabs.List>

                            <Tabs.Panel value="general" pt="xs">
                                <form onSubmit={handleSubmit}>
                                    <Stack gap="lg">
                                        {/* Basic Agent Info */}
                                        <Stack gap="sm">
                                            <Title order={5}>Details</Title>
                                            <TextInput
                                                label={t(
                                                    'features_ai_copilot.form.agent_name.label',
                                                )}
                                                placeholder={t(
                                                    'features_ai_copilot.form.agent_name.placeholder',
                                                )}
                                                {...form.getInputProps('name')}
                                            />

                                            <Select
                                                label={t(
                                                    'features_ai_copilot.form.project.label',
                                                )}
                                                placeholder={t(
                                                    'features_ai_copilot.form.project.placeholder',
                                                )}
                                                data={projectOptions}
                                                searchable
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconDatabase}
                                                    />
                                                }
                                                {...form.getInputProps(
                                                    'projectUuid',
                                                )}
                                            />
                                            {!!form.values.projectUuid && (
                                                <TagsInput
                                                    label={t(
                                                        'features_ai_copilot.form.tags.label',
                                                    )}
                                                    placeholder={t(
                                                        'features_ai_copilot.form.tags.placeholder',
                                                    )}
                                                    onChange={(value) => {
                                                        form.setFieldValue(
                                                            'tags',
                                                            value.length > 0
                                                                ? value
                                                                : null,
                                                        );
                                                    }}
                                                />
                                            )}
                                        </Stack>

                                        {/* Integrations Section */}

                                        <Stack gap="sm">
                                            <Group justify="space-between">
                                                <Title order={5}>
                                                    {t(
                                                        'features_ai_copilot.form.integrations',
                                                    )}
                                                </Title>
                                                {slackInstallation?.organizationUuid && (
                                                    <Button
                                                        size="xs"
                                                        variant="subtle"
                                                        leftSection={
                                                            <MantineIcon
                                                                icon={
                                                                    IconRefresh
                                                                }
                                                            />
                                                        }
                                                        loading={isRefreshing}
                                                        onClick={
                                                            refreshChannels
                                                        }
                                                    >
                                                        {t(
                                                            'features_ai_copilot.form.refresh_channels',
                                                        )}
                                                    </Button>
                                                )}
                                            </Group>

                                            <MultiSelect
                                                disabled={
                                                    !slackInstallation?.organizationUuid
                                                }
                                                description={
                                                    !slackInstallation?.organizationUuid
                                                        ? t(
                                                              'features_ai_copilot.form.slack.description',
                                                          )
                                                        : undefined
                                                }
                                                label={t(
                                                    'features_ai_copilot.form.slack.label',
                                                )}
                                                placeholder="Pick a channel"
                                                data={slackChannelOptions}
                                                value={form.values.integrations.map(
                                                    (i) => i.channelId,
                                                )}
                                                searchable
                                                onChange={(value) => {
                                                    form.setFieldValue(
                                                        'integrations',
                                                        value.map(
                                                            (v) =>
                                                                ({
                                                                    type: 'slack',
                                                                    channelId:
                                                                        v,
                                                                } as const),
                                                        ),
                                                    );
                                                }}
                                            />
                                        </Stack>

                                        <Group justify="flex-end">
                                            {!isCreateMode && (
                                                <Button
                                                    variant="outline"
                                                    onClick={handleDeleteClick}
                                                >
                                                    {t(
                                                        'features_ai_copilot.delete_agent',
                                                    )}
                                                </Button>
                                            )}
                                            <Button
                                                type="submit"
                                                loading={
                                                    isCreating || isUpdating
                                                }
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconCheck}
                                                    />
                                                }
                                            >
                                                {isCreateMode
                                                    ? t(
                                                          'features_ai_copilot.create_agent',
                                                      )
                                                    : t(
                                                          'features_ai_copilot.save_changes',
                                                      )}
                                            </Button>
                                        </Group>
                                    </Stack>
                                </form>
                            </Tabs.Panel>
                            {!isCreateMode && (
                                <Tabs.Panel value="conversations" pt="xs">
                                    <ConversationsList
                                        agentUuid={agentUuid ?? ''}
                                        agentName={form.values.name}
                                    />
                                </Tabs.Panel>
                            )}
                        </Tabs>
                    </Stack>
                </Card>

                <MantineModal
                    opened={deleteModalOpen}
                    onClose={handleCancelDelete}
                    title={t('features_ai_copilot.delete_agent')}
                    icon={IconTrash}
                    actions={
                        <Group>
                            <Button
                                variant="subtle"
                                onClick={handleCancelDelete}
                            >
                                {t('features_ai_copilot.cancel')}
                            </Button>
                            <Button color="red" onClick={handleDelete}>
                                {t('features_ai_copilot.delete')}
                            </Button>
                        </Group>
                    }
                >
                    <Stack gap="md">
                        <Text>{t('features_ai_copilot.delete_tip')}</Text>
                    </Stack>
                </MantineModal>
            </Stack>
        </MantineProvider>
    );
};
