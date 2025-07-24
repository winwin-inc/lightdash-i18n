import { type BaseAiAgent } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Code,
    Group,
    LoadingOverlay,
    MultiSelect,
    Paper,
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
    IconAdjustmentsAlt,
    IconArrowLeft,
    IconBook2,
    IconCheck,
    IconInfoCircle,
    IconPlug,
    IconPointFilled,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { z } from 'zod';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import Page from '../../../components/common/Page/Page';
import { useGetSlack, useSlackChannels } from '../../../hooks/slack/useSlack';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import { ConversationsList } from '../../features/aiCopilot/components/ConversationsList';
import {
    InstructionsGuidelines,
    InstructionsTemplates,
} from '../../features/aiCopilot/components/InstructionsSupport';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useDeleteAiAgentMutation } from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
import {
    useProjectAiAgent,
    useProjectAiAgents,
    useProjectCreateAiAgentMutation,
    useProjectUpdateAiAgentMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';

const formSchema: z.ZodType<
    Pick<
        BaseAiAgent,
        | 'name'
        | 'integrations'
        | 'tags'
        | 'instruction'
        | 'imageUrl'
        | 'groupAccess'
    >
> = z.object({
    name: z.string().min(1),
    integrations: z.array(
        z.object({
            type: z.literal('slack'),
            channelId: z.string().min(1),
        }),
    ),
    tags: z.array(z.string()).nullable(),
    instruction: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
    groupAccess: z.array(z.string()),
});

type Props = {
    isCreateMode?: boolean;
};

const ProjectAiAgentEditPage: FC<Props> = ({ isCreateMode = false }) => {
    const { agentUuid, projectUuid } = useParams<{
        agentUuid: string;
        projectUuid: string;
    }>();
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const { t } = useTranslation();

    const navigate = useNavigate();
    const { user } = useApp();

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const { data: project } = useProject(projectUuid);
    const { mutateAsync: createAgent, isLoading: isCreating } =
        useProjectCreateAiAgentMutation(projectUuid!);
    const { mutateAsync: updateAgent, isLoading: isUpdating } =
        useProjectUpdateAiAgentMutation(projectUuid!);
    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation();

    const actualAgentUuid = !isCreateMode && agentUuid ? agentUuid : undefined;

    const { data: agent, isLoading: isLoadingAgent } = useProjectAiAgent(
        projectUuid,
        actualAgentUuid,
    );

    const { data: slackInstallation, isLoading: isLoadingSlackInstallation } =
        useGetSlack();

    const { data: agents, isSuccess: isSuccessAgents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: true,
    });

    const { data: groups, isLoading: isLoadingGroups } = useOrganizationGroups({
        includeMembers: 5,
    });

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

    const groupOptions = useMemo(
        () =>
            groups?.map((group) => ({
                value: group.uuid,
                label: group.name,
            })) ?? [],
        [groups],
    );

    const form = useForm<z.infer<typeof formSchema>>({
        initialValues: {
            name: '',
            integrations: [],
            tags: null,
            instruction: null,
            imageUrl: null,
            groupAccess: [],
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (isCreateMode || !agent) {
            return;
        }

        if (!form.initialized) {
            const values = {
                name: agent.name,
                integrations: agent.integrations,
                tags: agent.tags && agent.tags.length > 0 ? agent.tags : null,
                instruction: agent.instruction,
                imageUrl: agent.imageUrl,
                groupAccess: agent.groupAccess ?? [],
            };
            form.setValues(values);
            form.resetDirty(values);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, isCreateMode]);

    const slackChannelsConfigured = useMemo(
        () =>
            form.values.integrations.some(
                (i) => i.type === 'slack' && i.channelId,
            ),
        [form.values.integrations],
    );

    const handleBack = () => {
        void navigate(-1);
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (!projectUuid || !user?.data) {
            return;
        }

        if (isCreateMode) {
            await createAgent({
                ...values,
                projectUuid,
            });
        } else if (actualAgentUuid) {
            await updateAgent({
                uuid: actualAgentUuid,
                projectUuid,
                ...values,
            });
        }
    });

    const handleDeleteClick = useCallback(() => {
        setDeleteModalOpen(true);
    }, []);

    const handleDelete = useCallback(async () => {
        if (!actualAgentUuid || !user?.data || !projectUuid || !agent) {
            return;
        }

        await deleteAgent(actualAgentUuid);

        setDeleteModalOpen(false);
    }, [actualAgentUuid, deleteAgent, user?.data, projectUuid, agent]);

    const handleCancelDelete = useCallback(() => {
        setDeleteModalOpen(false);
    }, []);

    useEffect(() => {
        if (!canManageAgents) {
            void navigate(`/projects/${projectUuid}/ai-agents`);
        }
    }, [canManageAgents, navigate, projectUuid]);

    if (!isCreateMode && actualAgentUuid && !agent && !isLoadingAgent) {
        return (
            <Page
                withFullHeight
                withCenteredRoot
                withCenteredContent
                withXLargePaddedContent
                withLargeContent
                withFixedContent
            >
                <Stack gap="md">
                    <Group gap="xs">
                        <Button
                            variant="subtle"
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                            onClick={handleBack}
                        >
                            {t('pages_ai_agents_edit_page.back_to_agents')}
                        </Button>
                    </Group>
                    <Paper
                        p="xl"
                        shadow="subtle"
                        component={Stack}
                        gap="xxs"
                        align="center"
                        withBorder
                        style={{ borderStyle: 'dashed' }}
                    >
                        <Title order={5}>
                            {t('pages_ai_agents_edit_page.agent_not_found.title')}
                        </Title>
                        <Text size="sm" c="dimmed">
                            {t('pages_ai_agents_edit_page.agent_not_found.description')}
                        </Text>
                    </Paper>
                </Stack>
            </Page>
        );
    }

    return (
        <Page
            withFullHeight
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
            withFixedContent
        >
            <Stack gap="xs">
                <div>
                    <Button
                        variant="subtle"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={handleBack}
                    >
                        {t('pages_ai_agents_edit_page.back')}
                    </Button>
                </div>
                <Group justify="space-between" wrap="nowrap" align="center">
                    <Group gap="sm" align="center" flex="1" wrap="nowrap">
                        <LightdashUserAvatar
                            name={isCreateMode ? '+' : form.values.name}
                            variant="filled"
                            src={
                                !isCreateMode ? form.values.imageUrl : undefined
                            }
                            size={48}
                        />
                        <Stack gap={0}>
                            <Title order={2} lineClamp={1} w="100%">
                                {isCreateMode
                                    ? t('pages_ai_agents_edit_page.new_agent')
                                    : agent?.name || t('pages_ai_agents_edit_page.agent')}
                            </Title>
                            <Text size="sm" c="dimmed">
                                {t('pages_ai_agents_edit_page.last_modified')}:{' '}
                                {new Date(
                                    agent?.updatedAt ?? new Date(),
                                ).toLocaleString()}
                            </Text>
                        </Stack>
                    </Group>
                    <Group justify="flex-end" gap="xs">
                        {!isCreateMode && (
                            <Button
                                size="compact-sm"
                                variant="outline"
                                color="red"
                                leftSection={<MantineIcon icon={IconTrash} />}
                                onClick={handleDeleteClick}
                            >
                                {t('pages_ai_agents_edit_page.delete_agent')}
                            </Button>
                        )}
                        <Button
                            size="compact-sm"
                            onClick={() => handleSubmit()}
                            loading={isCreating || isUpdating}
                            leftSection={<MantineIcon icon={IconCheck} />}
                            disabled={
                                isCreateMode ? !form.isValid() : !form.isDirty()
                            }
                        >
                            {isCreateMode ? t('pages_ai_agents_edit_page.create_agent') : t('pages_ai_agents_edit_page.save_changes')}
                        </Button>
                    </Group>
                </Group>

                <Tabs defaultValue="setup">
                    <Tabs.List>
                        <Tabs.Tab value="setup">{t('pages_ai_agents_edit_page.setup')}</Tabs.Tab>
                        {!isCreateMode && (
                            <Tabs.Tab value="conversations">
                                {t('pages_ai_agents_edit_page.conversations')}
                            </Tabs.Tab>
                        )}
                    </Tabs.List>

                    <Tabs.Panel value="setup" pt="lg">
                        <form>
                            <Stack gap="sm">
                                <Paper p="xl">
                                    <Group align="center" gap="xs" mb="md">
                                        <Paper p="xxs" withBorder radius="sm">
                                            <MantineIcon
                                                icon={IconAdjustmentsAlt}
                                                size="md"
                                            />
                                        </Paper>
                                        <Title order={5} c="gray.9" fw={700}>
                                            {t('pages_ai_agents_edit_page.basic_information')}
                                        </Title>
                                    </Group>
                                    <Stack>
                                        <Group>
                                            <TextInput
                                                label={t('pages_ai_agents_edit_page.form.name.name')}
                                                placeholder={t('pages_ai_agents_edit_page.form.name.placeholder')}
                                                {...form.getInputProps('name')}
                                                style={{ flexGrow: 1 }}
                                                variant="subtle"
                                            />
                                            <Tooltip label={t('pages_ai_agents_edit_page.form.name.tooltip')}>
                                                <TextInput
                                                    label={t('pages_ai_agents_edit_page.form.project.label')}
                                                    placeholder={t('pages_ai_agents_edit_page.form.project.placeholder')}
                                                    value={project?.name}
                                                    readOnly
                                                    style={{ flexGrow: 1 }}
                                                    variant="subtle"
                                                />
                                            </Tooltip>
                                        </Group>
                                        <TextInput
                                            style={{ flexGrow: 1 }}
                                            miw={200}
                                            variant="subtle"
                                            label={t('pages_ai_agents_edit_page.form.avatar.label')}
                                            description={t('pages_ai_agents_edit_page.form.avatar.description')}
                                            placeholder={t('pages_ai_agents_edit_page.form.avatar.placeholder')}
                                            type="url"
                                            {...form.getInputProps('imageUrl')}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                form.setFieldValue(
                                                    'imageUrl',
                                                    value ? value : null,
                                                );
                                            }}
                                        />
                                        <TagsInput
                                            variant="subtle"
                                            label={t('pages_ai_agents_edit_page.form.tags.label')}
                                            placeholder={t('pages_ai_agents_edit_page.form.tags.placeholder')}
                                            {...form.getInputProps('tags')}
                                            value={
                                                form.getInputProps('tags')
                                                    .value ?? []
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

                                        <Stack gap="xs">
                                            <MultiSelect
                                                variant="subtle"
                                                label={
                                                    <Group gap="xs">
                                                        <Text fz="sm" fw={500}>
                                                            {t('pages_ai_agents_edit_page.form.group_access.label')}
                                                        </Text>
                                                        <Tooltip
                                                            label={t('pages_ai_agents_edit_page.form.group_access.description')}
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
                                                placeholder={
                                                    isLoadingGroups
                                                        ? t('pages_ai_agents_edit_page.form.group_access.placeholder.loading')
                                                        : groupOptions.length ===
                                                          0
                                                        ? t('pages_ai_agents_edit_page.form.group_access.placeholder.no_groups')
                                                        : t('pages_ai_agents_edit_page.form.group_access.placeholder.select_groups')
                                                }
                                                data={groupOptions}
                                                disabled={
                                                    isLoadingGroups ||
                                                    groupOptions.length === 0
                                                }
                                                clearable
                                                {...form.getInputProps(
                                                    'groupAccess',
                                                )}
                                                value={
                                                    form.getInputProps(
                                                        'groupAccess',
                                                    ).value ?? []
                                                }
                                                onChange={(value) => {
                                                    form.setFieldValue(
                                                        'groupAccess',
                                                        value.length > 0
                                                            ? value
                                                            : [],
                                                    );
                                                }}
                                            />
                                            {/*  Add message + link to orgfanization settings if no groups are available and if this is enabled */}
                                        </Stack>
                                    </Stack>
                                </Paper>

                                <Paper p="xl">
                                    <Stack gap="md">
                                        <Group align="center" gap="xs">
                                            <Paper
                                                p="xxs"
                                                withBorder
                                                radius="sm"
                                            >
                                                <MantineIcon
                                                    icon={IconBook2}
                                                    size="md"
                                                />
                                            </Paper>
                                            <Title
                                                order={5}
                                                c="gray.9"
                                                fw={700}
                                            >
                                                {t('pages_ai_agents_edit_page.form.knowledge_expertise.label')}
                                            </Title>
                                        </Group>

                                        <Stack gap="xs">
                                            <Textarea
                                                variant="subtle"
                                                label={t('pages_ai_agents_edit_page.form.instructions.label')}
                                                description={t('pages_ai_agents_edit_page.form.instructions.description')}
                                                placeholder={t('pages_ai_agents_edit_page.form.instructions.placeholder')}
                                                resize="vertical"
                                                autosize
                                                minRows={3}
                                                maxRows={8}
                                                {...form.getInputProps(
                                                    'instruction',
                                                )}
                                            />
                                            <Text size="xs" c="dimmed">
                                                {form.values.instruction
                                                    ?.length ?? 0}{' '}
                                                characters
                                            </Text>
                                        </Stack>

                                        <Stack gap="sm">
                                            <Title
                                                order={6}
                                                c="gray.7"
                                                size="sm"
                                                fw={500}
                                            >
                                                {t('pages_ai_agents_edit_page.form.quick_templates.label')}
                                            </Title>

                                            <InstructionsTemplates
                                                onSelect={(
                                                    instruction: string,
                                                ) => {
                                                    form.setFieldValue(
                                                        'instruction',
                                                        form.values.instruction
                                                            ? `${form.values.instruction}\n\n${instruction}`
                                                            : instruction,
                                                    );
                                                }}
                                            />
                                        </Stack>

                                        <Stack gap="sm">
                                            <Box>
                                                <Title
                                                    order={6}
                                                    c="gray.7"
                                                    size="sm"
                                                    fw={500}
                                                >
                                                    {t('pages_ai_agents_edit_page.form.guidelines.label')}
                                                </Title>
                                                <Text c="dimmed" size="xs">
                                                    {t('pages_ai_agents_edit_page.form.guidelines.description')}
                                                </Text>
                                            </Box>
                                            <InstructionsGuidelines />
                                            <Text c="dimmed" size="xs">
                                                {t('pages_ai_agents_edit_page.form.guidelines.visit.part_1')}
                                                <Anchor
                                                    href="https://docs.lightdash.com/guides/ai-agents#writing-effective-instructions"
                                                    target="_blank"
                                                >
                                                    {t('pages_ai_agents_edit_page.form.guidelines.visit.part_2')}
                                                </Anchor>{' '}
                                                {t('pages_ai_agents_edit_page.form.guidelines.visit.part_3')}
                                            </Text>
                                        </Stack>
                                    </Stack>
                                </Paper>

                                <Paper p="xl">
                                    <Group align="center" gap="xs" mb="md">
                                        <Paper p="xxs" withBorder radius="sm">
                                            <MantineIcon
                                                icon={IconPlug}
                                                size="md"
                                            />
                                        </Paper>
                                        <Title order={5} c="gray.9" fw={700}>
                                            {t('pages_ai_agents_edit_page.form.integrations.label')}
                                        </Title>
                                    </Group>
                                    <Stack gap="sm">
                                        <Group
                                            align="center"
                                            justify="space-between"
                                            gap="xs"
                                        >
                                            <Title order={6}>{t('pages_ai_agents_edit_page.form.integrations.slack.title')}</Title>
                                            <Group
                                                c={
                                                    slackChannelsConfigured
                                                        ? 'green.04'
                                                        : 'dimmed'
                                                }
                                                gap="xxs"
                                                align="flex-start"
                                            >
                                                <MantineIcon
                                                    icon={IconPointFilled}
                                                    size={16}
                                                />
                                                <Text size="xs">
                                                    {!slackInstallation?.organizationUuid
                                                        ? t('pages_ai_agents_edit_page.form.integrations.slack.description.part_1')
                                                        : !slackChannelsConfigured
                                                        ? t('pages_ai_agents_edit_page.form.integrations.slack.description.part_2')
                                                        : t('pages_ai_agents_edit_page.form.integrations.slack.description.part_3')}
                                                </Text>
                                            </Group>
                                        </Group>

                                        <LoadingOverlay
                                            visible={isLoadingSlackInstallation}
                                        />
                                        {!slackInstallation?.organizationUuid ? (
                                            <Paper
                                                withBorder
                                                p="sm"
                                                style={{
                                                    borderStyle: 'dashed',
                                                    backgroundColor:
                                                        'transparent',
                                                }}
                                            >
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    ta="center"
                                                >
                                                    {t('pages_ai_agents_edit_page.form.integrations.slack.enable_slack_integration.part_1')}
                                                    <Anchor
                                                        c="dimmed"
                                                        underline="always"
                                                        href="/generalSettings/integrations"
                                                        target="_blank"
                                                    >
                                                        {t('pages_ai_agents_edit_page.form.integrations.slack.enable_slack_integration.part_2')}
                                                    </Anchor>
                                                    {t('pages_ai_agents_edit_page.form.integrations.slack.enable_slack_integration.part_3')}
                                                </Text>
                                            </Paper>
                                        ) : (
                                            <Box>
                                                <Stack gap="xs">
                                                    <MultiSelect
                                                        variant="subtle"
                                                        disabled={isRefreshing}
                                                        description={
                                                            <>
                                                                {t('pages_ai_agents_edit_page.form.integrations.slack.refresh_slack_channels.label')}
                                                                {slackChannelsConfigured && (
                                                                    <>
                                                                        {' '}
                                                                        {t('pages_ai_agents_edit_page.form.integrations.slack.channels.tag_slack_app.part_1')}
                                                                        <Code>
                                                                            @
                                                                            {
                                                                                slackInstallation.appName
                                                                            }
                                                                        </Code>{' '}
                                                                        {t('pages_ai_agents_edit_page.form.integrations.slack.channels.tag_slack_app.part_2')}
                                                                    </>
                                                                )}
                                                            </>
                                                        }
                                                        labelProps={{
                                                            style: {
                                                                width: '100%',
                                                            },
                                                        }}
                                                        label={t('pages_ai_agents_edit_page.form.integrations.slack.channels.label')}
                                                        placeholder={t('pages_ai_agents_edit_page.form.integrations.slack.channels.placeholder')}
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
                                                                label={t('pages_ai_agents_edit_page.form.integrations.slack.channels.refresh')}
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
                                            </Box>
                                        )}
                                    </Stack>
                                </Paper>
                            </Stack>
                        </form>
                    </Tabs.Panel>
                    <Tabs.Panel value="conversations" pt="lg">
                        <ConversationsList
                            agentUuid={actualAgentUuid!}
                            agentName={agent?.name ?? 'Agent'}
                            allUsers={canManageAgents}
                        />
                    </Tabs.Panel>
                </Tabs>

                <MantineModal
                    opened={deleteModalOpen}
                    onClose={handleCancelDelete}
                    title={t('pages_ai_agents_edit_page.modal.title')}
                    icon={IconTrash}
                    actions={
                        <Group>
                            <Button
                                variant="subtle"
                                onClick={handleCancelDelete}
                            >
                                {t('pages_ai_agents_edit_page.modal.cancel')}
                            </Button>
                            <Button color="red" onClick={handleDelete}>
                                {t('pages_ai_agents_edit_page.modal.delete')}
                            </Button>
                        </Group>
                    }
                >
                    <Stack gap="md">
                        <Text>
                            {t('pages_ai_agents_edit_page.modal.content')}
                        </Text>
                    </Stack>
                </MantineModal>
            </Stack>
        </Page>
    );
};

export default ProjectAiAgentEditPage;
