import {
    Alert,
    Box,
    Card,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconExternalLink, IconMessageCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../components/common/MantineIcon';
import { useEvalSectionContext } from '../../hooks/useEvalSectionContext';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    openInSidebar?: boolean;
};

export const EvalPromptThreadReference: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
    openInSidebar = false,
}) => {
    const { t } = useTranslation();

    const {
        data: thread,
        isLoading,
        error,
    } = useAiAgentThread(projectUuid, agentUuid, threadUuid);

    const { setSelectedThreadUuid } = useEvalSectionContext();

    const handleOpenThread = () => {
        if (!thread) return;

        if (openInSidebar) {
            setSelectedThreadUuid(thread.uuid);
        } else {
            const url = `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${thread.uuid}`;
            window.open(url, '_blank');
        }
    };

    if (isLoading) {
        return (
            <Card p="sm" withBorder>
                <Group gap="sm">
                    <MantineIcon icon={IconMessageCircle} color="dimmed" />
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                        {t(
                            'ai_copilot_chat_elements_evals_prompt_thread_reference.loading_thread_reference',
                        )}
                    </Text>
                </Group>
            </Card>
        );
    }

    if (error || !thread) {
        return (
            <Alert color="red" p="sm">
                <Group gap="sm">
                    <MantineIcon icon={IconMessageCircle} />
                    <Text size="sm">
                        {t(
                            'ai_copilot_chat_elements_evals_prompt_thread_reference.failed_to_load_thread_reference',
                        )}
                    </Text>
                </Group>
            </Alert>
        );
    }

    const promptMessage = thread.messages.find(
        (msg) => msg.role === 'user' && msg.uuid === promptUuid,
    );

    return (
        <Card
            p="sm"
            withBorder
            style={{
                cursor: 'pointer',
            }}
            onClick={handleOpenThread}
        >
            <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                    <Group gap="xs" style={{ flex: 1 }} align="flex-start">
                        <MantineIcon icon={IconMessageCircle} color="gray.6" />
                        <Box style={{ flex: 1 }}>
                            <Stack gap="xs"></Stack>
                            <Group gap="xs" align="center">
                                <Title order={6} lineClamp={1} lh={1.2}>
                                    {thread.title ??
                                        thread.firstMessage.message}
                                </Title>
                                {!openInSidebar && (
                                    <MantineIcon
                                        icon={IconExternalLink}
                                        size="sm"
                                        color="dimmed"
                                    />
                                )}
                            </Group>
                            <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                                {promptMessage
                                    ? promptMessage.message
                                    : t(
                                          'ai_copilot_chat_elements_evals_prompt_thread_reference.no_prompt_found',
                                      )}{' '}
                                •{' '}
                                {new Date(
                                    thread.createdAt,
                                ).toLocaleDateString()}
                            </Text>
                        </Box>
                    </Group>
                    {!openInSidebar && (
                        <Group gap="xs">
                            <MantineIcon icon={IconExternalLink} color="blue" />
                        </Group>
                    )}
                </Group>
            </Stack>
        </Card>
    );
};
