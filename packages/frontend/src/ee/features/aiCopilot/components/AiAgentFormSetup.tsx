import { FeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Code,
    Collapse,
    Group,
    HoverCard,
    Loader,
    LoadingOverlay,
    MultiSelect,
    Paper,
    Stack,
    Switch,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import type { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustmentsAlt,
    IconAlertTriangle,
    IconBook2,
    IconInfoCircle,
    IconLock,
    IconPlug,
    IconPointFilled,
    IconRefresh,
    IconSparkles,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useGetSlack,
    useSlackChannels,
} from '../../../../hooks/slack/useSlack';
import { useFeatureFlag } from '../../../../hooks/useFeatureFlagEnabled';
import { useOrganizationGroups } from '../../../../hooks/useOrganizationGroups';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import { UserAccessMultiSelect } from '../../../components/UserAccessMultiSelect';
import AiExploreAccessTree from '../../../pages/AiAgents/AiExploreAccessTree';
import {
    useDeleteAiAgentMutation,
    useProjectAiAgents,
} from '../hooks/useProjectAiAgents';
import { useGetAgentExploreAccessSummary } from '../hooks/useUserAgentPreferences';
import {
    InstructionsGuidelines,
    InstructionsTemplates,
} from './InstructionsSupport';

const formSchema = z.object({
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
    userAccess: z.array(z.string()),
    enableDataAccess: z.boolean(),
    enableSelfImprovement: z.boolean(),
    version: z.number(),
});

export const AiAgentFormSetup = ({
    mode,
    form,
    projectUuid,
    agentUuid,
}: {
    mode: 'create' | 'edit';
    form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
    projectUuid: string;
    agentUuid: string;
}) => {
    const { t } = useTranslation();

    const { data: project } = useProject(projectUuid);
    const exploreAccessSummaryQuery = useGetAgentExploreAccessSummary(
        projectUuid!,
        {
            tags: form.values.tags,
        },
    );

    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation(projectUuid!);

    const { user } = useApp();
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const handleDeleteClick = useCallback(() => {
        setDeleteModalOpen(true);
    }, []);
    const handleCancelDelete = useCallback(() => {
        setDeleteModalOpen(false);
    }, []);
    const handleDelete = useCallback(async () => {
        if (!agentUuid || !user?.data || !projectUuid) {
            return;
        }

        await deleteAgent(agentUuid);

        setDeleteModalOpen(false);
    }, [agentUuid, deleteAgent, user?.data, projectUuid]);

    const [isExploreAccessSummaryOpen, { toggle: toggleExploreAccessSummary }] =
        useDisclosure(false);

    const slackChannelsConfigured = useMemo(
        () =>
            form.values.integrations.some(
                (i) => i.type === 'slack' && i.channelId,
            ),
        [form.values.integrations],
    );
    const { data: slackInstallation, isLoading: isLoadingSlackInstallation } =
        useGetSlack();

    const { data: agents, isSuccess: isSuccessAgents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: true,
    });

    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const isGroupsEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    const { data: groups, isLoading: isLoadingGroups } = useOrganizationGroups(
        {
            includeMembers: 5,
        },
        {
            enabled: isGroupsEnabled,
        },
    );

    const groupOptions = useMemo(
        () =>
            groups?.map((group) => ({
                value: group.uuid,
                label: group.name,
            })) ?? [],
        [groups],
    );

    const {
        data: slackChannels,
        refresh: refreshChannels,
        isRefreshing,
        isLoading: isLoadingSlackChannels,
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

    return (
        <>
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
                                {t('ai_agent_form_setup.basic_information')}
                            </Title>
                        </Group>
                        <Stack>
                            <Group>
                                <TextInput
                                    label={t(
                                        'ai_agent_form_setup.agent_name.label',
                                    )}
                                    placeholder={t(
                                        'ai_agent_form_setup.agent_name.placeholder',
                                    )}
                                    {...form.getInputProps('name')}
                                    style={{ flexGrow: 1 }}
                                    variant="subtle"
                                />
                                <Tooltip
                                    label={t(
                                        'ai_agent_form_setup.project.tooltip',
                                    )}
                                >
                                    <TextInput
                                        label={t(
                                            'ai_agent_form_setup.project.label',
                                        )}
                                        placeholder={t(
                                            'ai_agent_form_setup.project.placeholder',
                                        )}
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
                                label={t(
                                    'ai_agent_form_setup.avatar_image_url.label',
                                )}
                                description={t(
                                    'ai_agent_form_setup.avatar_image_url.description',
                                )}
                                placeholder={t(
                                    'ai_agent_form_setup.avatar_image_url.placeholder',
                                )}
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
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Stack gap="md">
                            <Group align="center" gap="xs">
                                <Paper p="xxs" withBorder radius="sm">
                                    <MantineIcon icon={IconBook2} size="md" />
                                </Paper>
                                <Title order={5} c="gray.9" fw={700}>
                                    {t(
                                        'ai_agent_form_setup.knowledge_and_expertise.title',
                                    )}
                                </Title>
                            </Group>
                            <Stack gap="xs">
                                <Textarea
                                    variant="subtle"
                                    label={t(
                                        'ai_agent_form_setup.knowledge_and_expertise.label',
                                    )}
                                    description={t(
                                        'ai_agent_form_setup.knowledge_and_expertise.description',
                                    )}
                                    placeholder={t(
                                        'ai_agent_form_setup.knowledge_and_expertise.placeholder',
                                    )}
                                    resize="vertical"
                                    autosize
                                    minRows={3}
                                    maxRows={8}
                                    {...form.getInputProps('instruction')}
                                />
                                <Text size="xs" c="dimmed">
                                    {form.values.instruction?.length ?? 0}{' '}
                                    {t(
                                        'ai_agent_form_setup.knowledge_and_expertise.characters',
                                    )}
                                </Text>
                            </Stack>
                            <Stack gap="sm">
                                <Title order={6} c="gray.7" size="sm" fw={500}>
                                    {t(
                                        'ai_agent_form_setup.quick_templates.title',
                                    )}
                                </Title>

                                <InstructionsTemplates
                                    onSelect={(instruction: string) => {
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
                                        {t(
                                            'ai_agent_form_setup.guidelines.title',
                                        )}
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        {t(
                                            'ai_agent_form_setup.guidelines.content.part_1',
                                        )}
                                    </Text>
                                </Box>
                                <InstructionsGuidelines />
                                <Text c="dimmed" size="xs">
                                    {t(
                                        'ai_agent_form_setup.guidelines.content.part_2',
                                    )}{' '}
                                    <Anchor
                                        href="https://docs.lightdash.com/guides/ai-agents#writing-effective-instructions"
                                        target="_blank"
                                    >
                                        {t(
                                            'ai_agent_form_setup.guidelines.content.part_3',
                                        )}
                                    </Anchor>{' '}
                                    {t(
                                        'ai_agent_form_setup.guidelines.content.part_4',
                                    )}
                                </Text>
                            </Stack>
                            <Switch
                                variant="subtle"
                                label={
                                    <Group gap="xs">
                                        <Text fz="sm" fw={500}>
                                            {t(
                                                'ai_agent_form_setup.enable_data_access.label',
                                            )}
                                        </Text>
                                        <Tooltip
                                            label={t(
                                                'ai_agent_form_setup.enable_data_access.tooltip',
                                            )}
                                            withArrow
                                            withinPortal
                                            multiline
                                            position="right"
                                            maw="300px"
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                            />
                                        </Tooltip>
                                    </Group>
                                }
                                description={
                                    <>
                                        {t(
                                            'ai_agent_form_setup.enable_data_access.description.part_1',
                                        )}{' '}
                                        <Anchor
                                            href="https://docs.lightdash.com/guides/ai-agents#data-access-control"
                                            target="_blank"
                                            size="xs"
                                        >
                                            {t(
                                                'ai_agent_form_setup.enable_data_access.description.part_2',
                                            )}
                                        </Anchor>
                                    </>
                                }
                                {...form.getInputProps('enableDataAccess', {
                                    type: 'checkbox',
                                })}
                            />
                            <Switch
                                variant="subtle"
                                label={
                                    <Group gap="xs">
                                        <Text fz="sm" fw={500}>
                                            {t(
                                                'ai_agent_form_setup.enable_self_improvement.label',
                                            )}
                                        </Text>
                                        <Tooltip
                                            label={t(
                                                'ai_agent_form_setup.enable_self_improvement.tooltip',
                                            )}
                                            withArrow
                                            withinPortal
                                            multiline
                                            position="right"
                                            maw="300px"
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                            />
                                        </Tooltip>
                                        <Badge
                                            color="indigo"
                                            radius="sm"
                                            variant="light"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconSparkles}
                                                />
                                            }
                                        >
                                            {t(
                                                'ai_agent_form_setup.enable_self_improvement.beta',
                                            )}
                                        </Badge>
                                    </Group>
                                }
                                description={
                                    <>
                                        {t(
                                            'ai_agent_form_setup.enable_self_improvement.description.part_1',
                                        )}{' '}
                                        <Anchor
                                            href="https://docs.lightdash.com/guides/ai-agents#self-improvement"
                                            target="_blank"
                                            size="xs"
                                        >
                                            {t(
                                                'ai_agent_form_setup.enable_self_improvement.description.part_2',
                                            )}
                                        </Anchor>
                                    </>
                                }
                                {...form.getInputProps(
                                    'enableSelfImprovement',
                                    {
                                        type: 'checkbox',
                                    },
                                )}
                            />
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Group align="center" gap="xs" mb="md">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon icon={IconLock} size="md" />
                            </Paper>
                            <Title order={5} c="gray.9" fw={700}>
                                {t('ai_agent_form_setup.access_control.title')}
                            </Title>
                        </Group>
                        <Stack>
                            <UserAccessMultiSelect
                                projectUuid={projectUuid!}
                                isGroupsEnabled={isGroupsEnabled}
                                value={form.values.userAccess}
                                onChange={(value) => {
                                    form.setFieldValue('userAccess', value);
                                }}
                            />

                            {isGroupsEnabled && (
                                <Stack gap="xs">
                                    <MultiSelect
                                        variant="subtle"
                                        label={
                                            <Group gap="xs">
                                                <Text fz="sm" fw={500}>
                                                    {t(
                                                        'ai_agent_form_setup.access_control.group.label',
                                                    )}
                                                </Text>
                                                <Tooltip
                                                    label={t(
                                                        'ai_agent_form_setup.access_control.group.tooltip',
                                                    )}
                                                    withArrow
                                                    withinPortal
                                                    multiline
                                                    position="right"
                                                    maw="250px"
                                                >
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                    />
                                                </Tooltip>
                                            </Group>
                                        }
                                        description={t(
                                            'ai_agent_form_setup.access_control.group.description',
                                        )}
                                        placeholder={
                                            isLoadingGroups
                                                ? t(
                                                      'ai_agent_form_setup.access_control.group.placeholder.loading',
                                                  )
                                                : groupOptions.length === 0
                                                ? t(
                                                      'ai_agent_form_setup.access_control.group.placeholder.no_groups_available',
                                                  )
                                                : t(
                                                      'ai_agent_form_setup.access_control.group.placeholder.select_groups',
                                                  )
                                        }
                                        data={groupOptions}
                                        disabled={
                                            isLoadingGroups ||
                                            groupOptions.length === 0
                                        }
                                        comboboxProps={{
                                            transitionProps: {
                                                transition: 'pop',
                                                duration: 200,
                                            },
                                        }}
                                        clearable
                                        {...form.getInputProps('groupAccess')}
                                        value={
                                            form.getInputProps('groupAccess')
                                                .value ?? []
                                        }
                                        onChange={(value) => {
                                            form.setFieldValue(
                                                'groupAccess',
                                                value.length > 0 ? value : [],
                                            );
                                        }}
                                    />
                                </Stack>
                            )}

                            <Box>
                                <TagsInput
                                    variant="subtle"
                                    label={
                                        <Group gap="xs">
                                            <Text fz="sm" fw={500}>
                                                {t(
                                                    'ai_agent_form_setup.tags.label',
                                                )}
                                            </Text>
                                            <HoverCard
                                                position="right"
                                                withArrow
                                            >
                                                <HoverCard.Target>
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                    />
                                                </HoverCard.Target>
                                                <HoverCard.Dropdown maw="250px">
                                                    <Text fz="xs">
                                                        {t(
                                                            'ai_agent_form_setup.tags.dropdown.part_1',
                                                        )}{' '}
                                                        <Anchor
                                                            fz="xs"
                                                            c="dimmed"
                                                            underline="always"
                                                            href="https://docs.lightdash.com/guides/ai-agents#limiting-access-to-specific-explores-and-fields"
                                                            target="_blank"
                                                        >
                                                            {t(
                                                                'ai_agent_form_setup.tags.dropdown.part_2',
                                                            )}
                                                        </Anchor>
                                                    </Text>
                                                </HoverCard.Dropdown>
                                            </HoverCard>
                                        </Group>
                                    }
                                    placeholder={t(
                                        'ai_agent_form_setup.tags.placeholder',
                                    )}
                                    inputWrapperOrder={[
                                        'label',
                                        'input',
                                        'description',
                                    ]}
                                    description={
                                        exploreAccessSummaryQuery.isSuccess ? (
                                            exploreAccessSummaryQuery.data
                                                .length === 0 ? (
                                                t(
                                                    'ai_agent_form_setup.tags.description.part_1',
                                                )
                                            ) : (
                                                <>
                                                    {
                                                        exploreAccessSummaryQuery
                                                            .data.length
                                                    }{' '}
                                                    {t(
                                                        'ai_agent_form_setup.tags.description.part_2',
                                                    )}{' '}
                                                    <Anchor
                                                        size="xs"
                                                        onClick={
                                                            toggleExploreAccessSummary
                                                        }
                                                    >
                                                        {t(
                                                            'ai_agent_form_setup.tags.description.part_3',
                                                        )}{' '}
                                                    </Anchor>{' '}
                                                    {t(
                                                        'ai_agent_form_setup.tags.description.part_4',
                                                    )}
                                                </>
                                            )
                                        ) : (
                                            t(
                                                'ai_agent_form_setup.tags.description.part_5',
                                            )
                                        )
                                    }
                                    {...form.getInputProps('tags')}
                                    value={
                                        form.getInputProps('tags').value ?? []
                                    }
                                    onChange={(value) => {
                                        form.setFieldValue(
                                            'tags',
                                            value.length > 0 ? value : null,
                                        );
                                    }}
                                />

                                {exploreAccessSummaryQuery.isSuccess ? (
                                    <Collapse
                                        mt="xs"
                                        in={isExploreAccessSummaryOpen}
                                    >
                                        <Card>
                                            <AiExploreAccessTree
                                                exploreAccessSummary={
                                                    exploreAccessSummaryQuery.data
                                                }
                                            />
                                        </Card>
                                    </Collapse>
                                ) : null}
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Group align="center" gap="xs" mb="md">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon icon={IconPlug} size="md" />
                            </Paper>
                            <Title order={5} c="gray.9" fw={700}>
                                {t('ai_agent_form_setup.integrations.title')}
                            </Title>
                        </Group>
                        <Stack gap="sm">
                            <Group
                                align="center"
                                justify="space-between"
                                gap="xs"
                            >
                                <Title order={6}>Slack</Title>
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
                                            ? t(
                                                  'ai_agent_form_setup.integrations.slack.disabled',
                                              )
                                            : !slackChannelsConfigured
                                            ? t(
                                                  'ai_agent_form_setup.integrations.slack.channels_not_configured',
                                              )
                                            : t(
                                                  'ai_agent_form_setup.integrations.slack.enabled',
                                              )}
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
                                        backgroundColor: 'transparent',
                                    }}
                                >
                                    <Text size="xs" c="dimmed" ta="center">
                                        {t(
                                            'ai_agent_form_setup.integrations.slack.description.part_1',
                                        )}{' '}
                                        <Anchor
                                            c="dimmed"
                                            underline="always"
                                            href="/generalSettings/integrations"
                                            target="_blank"
                                        >
                                            {t(
                                                'ai_agent_form_setup.integrations.slack.description.part_2',
                                            )}
                                        </Anchor>
                                        {t(
                                            'ai_agent_form_setup.integrations.slack.description.part_3',
                                        )}{' '}
                                    </Text>
                                </Paper>
                            ) : (
                                <Box>
                                    <Stack gap="xs">
                                        <MultiSelect
                                            variant="subtle"
                                            readOnly={
                                                isLoadingSlackChannels ||
                                                isRefreshing
                                            }
                                            description={
                                                <>
                                                    {t(
                                                        'ai_agent_form_setup.integrations.channels.description.part_1',
                                                    )}{' '}
                                                    {slackChannelsConfigured && (
                                                        <>
                                                            {' '}
                                                            {t(
                                                                'ai_agent_form_setup.integrations.channels.description.part_2',
                                                            )}{' '}
                                                            <Code>
                                                                @
                                                                {
                                                                    slackInstallation.appName
                                                                }
                                                            </Code>{' '}
                                                            {t(
                                                                'ai_agent_form_setup.integrations.channels.description.part_3',
                                                            )}{' '}
                                                        </>
                                                    )}
                                                </>
                                            }
                                            labelProps={{
                                                style: {
                                                    width: '100%',
                                                },
                                            }}
                                            label={t(
                                                'ai_agent_form_setup.integrations.channels.label',
                                            )}
                                            limit={30}
                                            placeholder={
                                                isLoadingSlackChannels ||
                                                isRefreshing
                                                    ? t(
                                                          'ai_agent_form_setup.integrations.channels.placeholder.part_1',
                                                      )
                                                    : t(
                                                          'ai_agent_form_setup.integrations.channels.placeholder.part_2',
                                                      )
                                            }
                                            data={slackChannelOptions}
                                            value={form.values.integrations.map(
                                                (i) => i.channelId,
                                            )}
                                            searchable
                                            rightSectionPointerEvents="all"
                                            rightSection={
                                                isLoadingSlackChannels ||
                                                isRefreshing ? (
                                                    <Loader size="xs" />
                                                ) : (
                                                    <Tooltip
                                                        withArrow
                                                        withinPortal
                                                        label={t(
                                                            'ai_agent_form_setup.integrations.channels.refresh',
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
                                                )
                                            }
                                            onChange={(value) => {
                                                form.setFieldValue(
                                                    'integrations',
                                                    value.map(
                                                        (v) =>
                                                            ({
                                                                type: 'slack',
                                                                channelId: v,
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

                    {mode === 'edit' && (
                        <Paper p="xl" withBorder>
                            <Group align="center" gap="xs" mb="md">
                                <Paper p="xxs" withBorder radius="sm">
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        size="md"
                                    />
                                </Paper>
                                <Title order={5} c="gray.9" fw={700}>
                                    {t('ai_agent_form_setup.danger_zone')}
                                </Title>
                            </Group>
                            <Group
                                gap="xs"
                                align="center"
                                justify="space-between"
                            >
                                <Box>
                                    <Title
                                        order={6}
                                        c="gray.7"
                                        size="sm"
                                        fw={500}
                                    >
                                        {t('ai_agent_form_setup.delete_agent')}
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        {t(
                                            'ai_agent_form_setup.delete_agent_description',
                                        )}
                                    </Text>
                                </Box>
                                <Button
                                    variant="outline"
                                    color="red"
                                    onClick={handleDeleteClick}
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                >
                                    {t('ai_agent_form_setup.delete')}
                                </Button>
                            </Group>
                        </Paper>
                    )}
                </Stack>
            </form>
            <MantineModal
                opened={deleteModalOpen}
                onClose={handleCancelDelete}
                title={t('ai_agent_form_setup.delete_agent')}
                icon={IconTrash}
                actions={
                    <Group>
                        <Button variant="subtle" onClick={handleCancelDelete}>
                            {t('ai_agent_form_setup.cancel')}
                        </Button>
                        <Button color="red" onClick={handleDelete}>
                            {t('ai_agent_form_setup.delete')}
                        </Button>
                    </Group>
                }
            >
                <Stack gap="md">
                    <Text>{t('ai_agent_form_setup.delete_agent_confirm')}</Text>
                </Stack>
            </MantineModal>
        </>
    );
};
