import { subject } from '@casl/ability';
import { type AiAgent } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Card,
    Center,
    Divider,
    Grid,
    Group,
    Paper,
    Pill,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconBook, IconHelp, IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import { useProjectAiAgents } from '../../features/aiCopilot/hooks/useProjectAiAgents';

type AgentCardProps = {
    agent: AiAgent;
};

const AgentCard = ({ agent }: AgentCardProps) => {
    const { projectUuid } = useParams();
    const { user } = useApp();
    const { t } = useTranslation();

    return (
        <Card
            withBorder
            p={0}
            radius="md"
            styles={{
                root: { height: '100%' },
            }}
            component={Link}
            to={`/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`}
        >
            <Stack gap="sm" p="lg" style={{ flex: 1 }}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <LightdashUserAvatar
                        name={agent.name}
                        h={54}
                        w={54}
                        variant="filled"
                        style={{ flexShrink: 0 }}
                        src={agent.imageUrl}
                    />
                    <Stack gap="xs">
                        <Title order={5}>{agent.name}</Title>
                        <Group gap={4}>
                            {agent.tags && agent.tags.length > 0 ? (
                                agent.tags.map((tag) => (
                                    <Pill
                                        key={tag}
                                        variant="outline"
                                        size="sm"
                                        px="xs"
                                    >
                                        {tag}
                                    </Pill>
                                ))
                            ) : (
                                <Text size="sm" c="dimmed">
                                    {t('ai_agents_list_page.last_modified')}{' '}
                                    {new Date(
                                        agent.updatedAt ?? new Date(),
                                    ).toLocaleString()}
                                </Text>
                            )}
                        </Group>
                    </Stack>
                </Group>

                <Text size="sm" c="dimmed" lineClamp={2}>
                    {agent.instruction}
                </Text>
            </Stack>
            <Divider />
            <Group justify="space-between" p="sm">
                {user?.data?.ability.can('manage', 'AiAgent') && (
                    <Button
                        variant="default"
                        c="dimmed"
                        bd="none"
                        component={Link}
                        to={`/generalSettings/aiAgents/${agent.uuid}`}
                    >
                        {t('ai_agents_list_page.settings')}
                    </Button>
                )}
                <Button variant="default" size="sm" px="md">
                    {t('ai_agents_list_page.start_chat')}
                </Button>
            </Group>
        </Card>
    );
};

const AgentsListPage = () => {
    const { projectUuid } = useParams();
    const agentsListQuery = useProjectAiAgents(projectUuid);
    const { user } = useApp();
    const { t } = useTranslation();

    if (agentsListQuery.isLoading) {
        return <PageSpinner />;
    }

    const userCanManageAiAgent = user.data?.ability.can(
        'manage',
        subject('AiAgent', {
            organizationUuid: user.data?.organizationUuid,
        }),
    );

    return (
        <Page
            withCenteredRoot
            withXLargePaddedContent
            withLargeContent
            backgroundColor="#FAFAFA"
        >
            <Stack gap="xxl" h="100%">
                <Group justify="space-between">
                    <Box>
                        <Group gap="xs">
                            <Title order={3}>
                                {t('ai_agents_list_page.ai_agents')}
                            </Title>
                            <Tooltip
                                variant="xs"
                                label={t('ai_agents_list_page.tooltip.part_1')}
                                position="right"
                            >
                                <Badge
                                    variant="filled"
                                    color="pink.5"
                                    radius={6}
                                    size="md"
                                    py="xxs"
                                    px="xs"
                                >
                                    {t('ai_agents_list_page.tooltip.part_2')}
                                </Badge>
                            </Tooltip>
                        </Group>
                        <Text c="dimmed" size="sm">
                            {t('ai_agents_list_page.tooltip.part_3')}
                        </Text>
                    </Box>
                    <Group gap="xs">
                        {userCanManageAiAgent && (
                            <Button
                                size="xs"
                                variant="default"
                                radius="md"
                                component={Link}
                                to="/generalSettings/aiAgents/new"
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                {t('ai_agents_list_page.new_agent')}
                            </Button>
                        )}
                        <Button
                            size="xs"
                            variant="default"
                            radius="md"
                            component="a"
                            href="https://docs.lightdash.com/guides/ai-analyst#ai-analyst"
                            target="_blank"
                            leftSection={<MantineIcon icon={IconBook} />}
                        >
                            {t('ai_agents_list_page.learn_more')}
                        </Button>
                    </Group>
                </Group>
                {!agentsListQuery.data || agentsListQuery.data.length === 0 ? (
                    <Center
                        component={Paper}
                        h={100}
                        mah={600}
                        p="md"
                        bg="gray.0"
                        style={{ borderStyle: 'dashed', flex: 1 }}
                    >
                        <Stack gap="xs" align="center">
                            <Paper withBorder p="xs" radius="md">
                                <MantineIcon icon={IconHelp} color="gray" />
                            </Paper>
                            <Text size="sm" c="dimmed" ta="center">
                                {t('ai_agents_list_page.no_agents_found')}
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <Grid>
                        {agentsListQuery.data.map((agent) => (
                            <Grid.Col span={4} key={agent.uuid}>
                                <AgentCard agent={agent} />
                            </Grid.Col>
                        ))}
                    </Grid>
                )}
            </Stack>
        </Page>
    );
};

export default AgentsListPage;
