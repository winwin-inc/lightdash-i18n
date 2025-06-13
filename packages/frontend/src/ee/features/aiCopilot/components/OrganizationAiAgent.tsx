import { type BaseAiAgent } from '@lightdash/common';
import {
    ActionIcon,
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
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconArrowLeft,
    IconCheck,
    IconDatabase,
    IconInfoCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { LightdashUserAvatar } from '../../../../components/Avatar';
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
} from '../hooks/useOrganizationAiAgents';
import { ConversationsList } from './ConversationsList';
import { SlackIntegrationSteps } from './SlackIntegrationSteps';

const formSchema: z.ZodType<
    Pick<
        BaseAiAgent,
        | 'name'
        | 'projectUuid'
        | 'integrations'
        | 'tags'
        | 'instruction'
        | 'imageUrl'
    >
> = z.object({
    name: z.string().min(1),
    projectUuid: z
        .string({ message: 'You must select a project' })
        .uuid({ message: 'Invalid project' }),
    integrations: z.array(
        z.object({
            type: z.literal('slack'),
            channelId: z.string().min(1),
        }),
    ),
    tags: z.array(z.string()).nullable(),
    instruction: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
});

export const OrganizationAiAgent: FC = () => {
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

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(agentUuid);
    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation();

    const { data: slackInstallation } = useGetSlack();

    const { data: agents, isSuccess: isSuccessAgents } = useAiAgents();

    const {
        data: slackChannels,
        refresh: refreshChannels,
        isRefreshing,
    } = useSlackChannels(
        '',
        {
            excludeArchived: true,
            excludeDms: true,
            excludeGroups: true,
        },
        {
            enabled: !!slackInstallation?.organizationUuid && isSuccessAgents,
        },
    );
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
            instruction: null,
            imageUrl: null,
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
                instruction: agent.instruction,
                imageUrl: agent.imageUrl,
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
                            <LightdashUserAvatar
                                name={isCreateMode ? '+' : form.values.name}
                                variant="filled"
                                src={
                                    !isCreateMode
                                        ? form.values.imageUrl
                                        : undefined
                                }
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
                            {/* <Tabs.List>
                                <Tabs.Tab value="general">General</Tabs.Tab>
                                {!isCreateMode && (
                                    <Tabs.Tab value="conversations">
                                        {t('features_ai_copilot.conversations')}
                                    </Tabs.Tab>
                                )}
                            </Tabs.List> */}

                            <Tabs.Panel value="general" pt="xs">
                                <form onSubmit={handleSubmit}>
                                    <Stack gap="lg">
                                        {/* Basic Agent Info */}
                                        <Stack gap="sm">
                                            <Group gap="sm">
                                                <TextInput
                                                    label={t(
                                                        'features_ai_copilot.form.agent_name.label',
                                                    )}
                                                    placeholder={t(
                                                        'features_ai_copilot.form.agent_name.placeholder',
                                                    )}
                                                    {...form.getInputProps(
                                                        'name',
                                                    )}
                                                    style={{ flexGrow: 1 }}
                                                />

                                                <TextInput
                                                    style={{ flexGrow: 1 }}
                                                    label={
                                                        <Group gap="xs">
                                                            <Text>
                                                                {t(
                                                                    'features_ai_copilot.form.image_url.label',
                                                                )}
                                                            </Text>
                                                            <Tooltip
                                                                label={t(
                                                                    'features_ai_copilot.form.image_url.tooltip',
                                                                )}
                                                                withArrow
                                                                withinPortal
                                                                multiline
                                                                maw="250px"
                                                            >
                                                                <MantineIcon
                                                                    icon={
                                                                        IconInfoCircle
                                                                    }
                                                                />
                                                            </Tooltip>
                                                        </Group>
                                                    }
                                                    placeholder={t(
                                                        'features_ai_copilot.form.image_url.placeholder',
                                                    )}
                                                    type="url"
                                                    {...form.getInputProps(
                                                        'imageUrl',
                                                    )}
                                                    onChange={(e) => {
                                                        const value =
                                                            e.target.value;

                                                        form.setFieldValue(
                                                            'imageUrl',
                                                            value
                                                                ? value
                                                                : null,
                                                        );
                                                    }}
                                                />
                                            </Group>

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
                                                    label="Tags"
                                                    placeholder="Select tags"
                                                    {...form.getInputProps(
                                                        'tags',
                                                    )}
                                                    value={
                                                        form.getInputProps(
                                                            'tags',
                                                        ).value ?? []
                                                    }
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

                                        <Stack gap="sm">
                                            <Textarea
                                                label={t(
                                                    'features_ai_copilot.form.integrations.label',
                                                )}
                                                description={t(
                                                    'features_ai_copilot.form.integrations.description',
                                                )}
                                                placeholder={t(
                                                    'features_ai_copilot.form.integrations.placeholder',
                                                )}
                                                resize="vertical"
                                                {...form.getInputProps(
                                                    'instruction',
                                                )}
                                            />
                                        </Stack>

                                        {/* Integrations Section */}

                                        <Stack gap="sm">
                                            <Stack gap="md">
                                                <Title order={6}>Slack</Title>

                                                <SlackIntegrationSteps
                                                    slackInstallation={
                                                        !!slackInstallation?.organizationUuid
                                                    }
                                                    channelsConfigured={form.values.integrations.some(
                                                        (i) =>
                                                            i.type ===
                                                                'slack' &&
                                                            i.channelId,
                                                    )}
                                                />

                                                <Stack gap="xs">
                                                    <MultiSelect
                                                        disabled={
                                                            isRefreshing ||
                                                            !slackInstallation?.organizationUuid
                                                        }
                                                        description={
                                                            !slackInstallation?.organizationUuid
                                                                ? t(
                                                                      'features_ai_copilot.form.channels.description',
                                                                  )
                                                                : undefined
                                                        }
                                                        labelProps={{
                                                            style: {
                                                                width: '100%',
                                                            },
                                                        }}
                                                        label={t(
                                                            'features_ai_copilot.form.channels.label',
                                                        )}
                                                        placeholder={t(
                                                            'features_ai_copilot.form.channels.placeholder',
                                                        )}
                                                        data={
                                                            slackChannelOptions
                                                        }
                                                        value={form.values.integrations.map(
                                                            (i) => i.channelId,
                                                        )}
                                                        searchable
                                                        rightSectionPointerEvents="all"
                                                        rightSection={
                                                            <Tooltip
                                                                withArrow
                                                                withinPortal
                                                                label={t(
                                                                    'features_ai_copilot.form.channels.refresh',
                                                                )}
                                                            >
                                                                <ActionIcon
                                                                    variant="transparent"
                                                                    onClick={
                                                                        refreshChannels
                                                                    }
                                                                >
                                                                    <MantineIcon
                                                                        icon={
                                                                            IconRefresh
                                                                        }
                                                                    />
                                                                </ActionIcon>
                                                            </Tooltip>
                                                        }
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
                                            </Stack>
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
