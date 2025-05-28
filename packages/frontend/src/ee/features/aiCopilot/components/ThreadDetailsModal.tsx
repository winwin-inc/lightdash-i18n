import {
    Badge,
    Group,
    Modal,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiAgentThread } from '../hooks/useAiAgents';
import { AgentAvatar } from './AgentAvatar';

type ThreadDetailsModalProps = {
    agentName: string;
    agentUuid: string;
    threadUuid: string | null;
    onClose: () => void;
};

export const ThreadDetailsModal: FC<ThreadDetailsModalProps> = ({
    agentName,
    agentUuid,
    threadUuid,
    onClose,
}) => {
    const { t } = useTranslation();

    const { data: thread, isLoading } = useAiAgentThread(
        agentUuid,
        threadUuid || '',
        {
            enabled: !!threadUuid,
        },
    );

    // Format date function since date-fns is not available
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    return (
        <Modal
            opened={!!threadUuid}
            onClose={onClose}
            title={
                <Title order={4}>
                    {t(
                        'features_ai_copilot_agents_details.conversation_details',
                    )}
                </Title>
            }
            size="xl"
        >
            {isLoading ? (
                <Text>
                    {t(
                        'features_ai_copilot_agents_details.loading_conversation',
                    )}
                </Text>
            ) : thread ? (
                <Stack gap="md">
                    <Group gap="xs">
                        <Badge
                            color={
                                thread.createdFrom === 'slack'
                                    ? 'indigo'
                                    : 'blue'
                            }
                            variant="light"
                        >
                            {thread.createdFrom === 'slack' ? 'Slack' : 'Web'}
                        </Badge>
                        <Text size="sm" c="dimmed">
                            {t(
                                'features_ai_copilot_agents_details.started_by',
                                {
                                    user: thread.user.name,
                                    date: formatDate(thread.createdAt),
                                },
                            )}
                        </Text>
                    </Group>

                    <ScrollArea h={400}>
                        <Stack gap="md">
                            {thread.messages.map((message) => (
                                <Paper
                                    key={message.uuid}
                                    withBorder
                                    p="md"
                                    radius="md"
                                    style={{
                                        backgroundColor:
                                            message.role === 'assistant'
                                                ? '#E6F7FF'
                                                : 'transparent',
                                        alignSelf:
                                            message.role === 'assistant'
                                                ? 'flex-start'
                                                : 'flex-end',
                                        maxWidth: '80%',
                                    }}
                                >
                                    <Stack gap="xs">
                                        <Group gap="xs">
                                            <AgentAvatar
                                                name={
                                                    message.role === 'assistant'
                                                        ? agentName ||
                                                          t(
                                                              'features_ai_copilot_agents_details.ai_assistant',
                                                          )
                                                        : thread.user.name
                                                }
                                            />

                                            <Text fw={500} size="sm">
                                                {message.role === 'assistant'
                                                    ? agentName ||
                                                      t(
                                                          'features_ai_copilot_agents_details.ai_assistant',
                                                      )
                                                    : thread.user.name}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {formatDate(message.createdAt)}
                                            </Text>
                                        </Group>
                                        <Text
                                            style={{
                                                whiteSpace: 'pre-wrap',
                                            }}
                                        >
                                            {message.message}
                                        </Text>
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>
                    </ScrollArea>
                </Stack>
            ) : (
                <Text>
                    {t('features_ai_copilot_agents_details.thread_not_found')}
                </Text>
            )}
        </Modal>
    );
};
