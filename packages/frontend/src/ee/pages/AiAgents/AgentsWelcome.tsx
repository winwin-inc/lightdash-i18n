import {
    Avatar,
    Box,
    Button,
    Center,
    List,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconBulb,
    IconChartHistogram,
    IconClipboardData,
    IconMessageChatbot,
    IconPlus,
    IconRobot,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router';

import MantineIcon from '../../../components/common/MantineIcon';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../features/aiCopilot/hooks/useAiOrganizationSettings';
import { useProjectAiAgents } from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../features/aiCopilot/hooks/useUserAgentPreferences';

const AiPageLoading = () => (
    <AiAgentPageLayout>
        <Center h="100%">
            <Loader color="gray" />
        </Center>
    </AiAgentPageLayout>
);

const AgentsWelcome = () => {
    const { t } = useTranslation();

    const { projectUuid } = useParams();
    const canCreateAgent = useAiAgentPermission({ action: 'manage' });
    const organizationSettingsQuery = useAiOrganizationSettings();

    const isAiCopilotEnabledOrTrial =
        (organizationSettingsQuery.isSuccess &&
            organizationSettingsQuery.data?.isCopilotEnabled) ||
        organizationSettingsQuery.data?.isTrial;

    const AGENT_FEATURES = [
        {
            icon: IconClipboardData,
            color: 'cyan',
            title: t('pages_ai_agents_welcome.agent_features.analyze.title'),
            description: t(
                'pages_ai_agents_welcome.agent_features.analyze.description',
            ),
        },
        {
            icon: IconBulb,
            color: 'grape',
            title: t(
                'pages_ai_agents_welcome.agent_features.get_insights.title',
            ),
            description: t(
                'pages_ai_agents_welcome.agent_features.get_insights.description',
            ),
        },
        {
            icon: IconChartHistogram,
            color: 'lime',
            title: t(
                'pages_ai_agents_welcome.agent_features.create_visualizations.title',
            ),
            description: t(
                'pages_ai_agents_welcome.agent_features.create_visualizations.description',
            ),
        },
        {
            icon: IconMessageChatbot,
            color: 'orange',
            title: t(
                'pages_ai_agents_welcome.agent_features.specialized_agents.title',
            ),
            description: t(
                'pages_ai_agents_welcome.agent_features.specialized_agents.description',
            ),
        },
    ] as const;

    const agentsQuery = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: true,
        options: {
            enabled: isAiCopilotEnabledOrTrial,
        },
    });
    const userAgentPreferencesQuery = useGetUserAgentPreferences(projectUuid, {
        enabled: isAiCopilotEnabledOrTrial,
    });

    if (organizationSettingsQuery.isLoading) {
        return <AiPageLoading />;
    }
    if (!isAiCopilotEnabledOrTrial) {
        return <Navigate to="/" replace />;
    }

    if (agentsQuery.isError || userAgentPreferencesQuery.isError) {
        return <div>{t('pages_ai_agents_welcome.something_went_wrong')}</div>;
    }

    if (agentsQuery.isLoading || userAgentPreferencesQuery.isLoading) {
        return <AiPageLoading />;
    }

    if (userAgentPreferencesQuery.data?.defaultAgentUuid) {
        return (
            <Navigate
                to={`/projects/${projectUuid}/ai-agents/${userAgentPreferencesQuery.data.defaultAgentUuid}`}
                replace
            />
        );
    }

    if (agentsQuery.data.length > 0) {
        return (
            <Navigate
                to={`/projects/${projectUuid}/ai-agents/${agentsQuery.data[0].uuid}`}
                replace
            />
        );
    }

    return (
        <AiAgentPageLayout>
            <Center mt="xl">
                <Stack gap={32}>
                    <Stack align="center" gap="xxs">
                        <Avatar size="lg" color="gray">
                            <MantineIcon icon={IconRobot} size="xxl" />
                        </Avatar>
                        <Title order={2}>
                            {t('pages_ai_agents_welcome.welcome')}
                        </Title>
                        <Text c="dimmed" size="sm">
                            {t(
                                'pages_ai_agents_welcome.your_ai_powered_bi_assistants',
                            )}
                        </Text>
                    </Stack>

                    <Paper p="xl" shadow="subtle">
                        <Stack>
                            <Title order={5}>
                                {t(
                                    'pages_ai_agents_welcome.what_you_can_do_with_ai_agents',
                                )}
                                :
                            </Title>

                            <List
                                styles={(theme) => ({
                                    item: {
                                        marginBottom: theme.spacing.xs,
                                        marginTop: theme.spacing.xs,
                                    },
                                })}
                            >
                                {AGENT_FEATURES.map((agentFeature) => (
                                    <List.Item
                                        key={agentFeature.title}
                                        icon={
                                            <Avatar
                                                c="gray"
                                                size="md"
                                                color={agentFeature.color}
                                            >
                                                <MantineIcon
                                                    size="lg"
                                                    icon={agentFeature.icon}
                                                />
                                            </Avatar>
                                        }
                                    >
                                        <Stack gap={0}>
                                            <Text
                                                size="sm"
                                                fw="bold"
                                                c="gray.7"
                                            >
                                                {agentFeature.title}
                                            </Text>
                                            <Text c="dimmed" size="xs">
                                                {agentFeature.description}
                                            </Text>
                                        </Stack>
                                    </List.Item>
                                ))}
                            </List>
                        </Stack>
                    </Paper>
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
                            {t('pages_ai_agents_welcome.ready_to_get_started')}
                        </Title>
                        <Text size="sm" c="dimmed">
                            {t(
                                'pages_ai_agents_welcome.create_your_first_agent',
                            )}
                        </Text>
                        <Box mt="lg">
                            {canCreateAgent ? (
                                <Button
                                    variant="dark"
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    component={Link}
                                    to={`/projects/${projectUuid}/ai-agents/new`}
                                >
                                    {t(
                                        'pages_ai_agents_welcome.create_your_first_agent_button',
                                    )}
                                </Button>
                            ) : (
                                <Text size="sm" c="dimmed" fs="italic">
                                    {t('pages_ai_agents_welcome.no_permission')}
                                </Text>
                            )}
                        </Box>
                    </Paper>
                </Stack>
            </Center>
        </AiAgentPageLayout>
    );
};

export default AgentsWelcome;
