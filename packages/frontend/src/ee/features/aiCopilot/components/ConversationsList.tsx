import { Badge, Loader, Stack, Table, Text, Title } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiAgentThreads } from '../hooks/useOrganizationAiAgents';
import { ThreadDetailsModal } from './ThreadDetailsModal';

type ConversationsListProps = {
    agentUuid: string;
    agentName: string;
};

export const ConversationsList: FC<ConversationsListProps> = ({
    agentUuid,
    agentName,
}) => {
    const { t } = useTranslation();

    const { data: threads, isLoading } = useAiAgentThreads(agentUuid);
    const [selectedThreadUuid, setSelectedThreadUuid] = useState<string | null>(
        null,
    );

    const handleRowClick = (threadUuid: string) => {
        setSelectedThreadUuid(threadUuid);
    };

    const handleModalClose = () => {
        setSelectedThreadUuid(null);
    };

    if (isLoading) {
        return (
            <Stack align="center" justify="center" h="100%">
                <Loader />
            </Stack>
        );
    }

    if (threads?.length === 0) {
        return (
            <Stack>
                <Text>
                    {t(
                        'features_ai_copilot_agents_list.no_conversations_found',
                    )}
                </Text>
            </Stack>
        );
    }

    return (
        <Stack>
            <Title order={5}>
                {t('features_ai_copilot_agents_list.conversations')}
            </Title>

            <Table highlightOnHover withTableBorder>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>
                            {t('features_ai_copilot_agents_list.conversation')}
                        </Table.Th>
                        <Table.Th>
                            {t('features_ai_copilot_agents_list.user')}
                        </Table.Th>
                        <Table.Th>
                            {t('features_ai_copilot_agents_list.created')}
                        </Table.Th>
                        <Table.Th>
                            {t('features_ai_copilot_agents_list.source')}
                        </Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {threads?.map((thread) => (
                        <Table.Tr
                            key={thread.uuid}
                            onClick={() => handleRowClick(thread.uuid)}
                            style={{
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease',
                            }}
                        >
                            <Table.Td>{thread.firstMessage}</Table.Td>
                            <Table.Td>{thread.user.name}</Table.Td>
                            <Table.Td>
                                {new Date(thread.createdAt).toLocaleString()}
                            </Table.Td>
                            <Table.Td>
                                <Badge
                                    color={
                                        thread.createdFrom === 'slack'
                                            ? 'indigo'
                                            : 'blue'
                                    }
                                    variant="light"
                                >
                                    {thread.createdFrom === 'slack'
                                        ? 'Slack'
                                        : 'Web'}
                                </Badge>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>

            <ThreadDetailsModal
                agentName={agentName}
                agentUuid={agentUuid}
                threadUuid={selectedThreadUuid}
                onClose={handleModalClose}
            />
        </Stack>
    );
};
