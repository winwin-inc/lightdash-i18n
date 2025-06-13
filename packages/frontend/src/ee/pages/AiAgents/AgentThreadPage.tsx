import { type AiAgentMessage } from '@lightdash/common';
import {
    Box,
    Center,
    Divider,
    Loader,
    ScrollArea,
    Stack,
} from '@mantine-8/core';
import { Fragment, useLayoutEffect, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext, useParams } from 'react-router';

import {
    AssistantBubble,
    UserBubble,
} from '../../features/aiCopilot/components/ChatElements/AgentChatBubbles';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import {
    useAiAgent,
    useAiAgentThread,
    useGenerateAgentThreadResponseMutation,
} from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
import { type AgentContext } from './AgentPage';

type AiThreadMessageProps = {
    message: AiAgentMessage;
    agentName?: string;
};

const AiThreadMessage: FC<AiThreadMessageProps> = ({ message }) => {
    const isUser = message.role === 'user';

    return isUser ? (
        <UserBubble message={message} />
    ) : (
        <AssistantBubble message={message} />
    );
};

const AiAgentThreadPage = () => {
    const { t } = useTranslation();

    const { agentUuid, threadUuid, projectUuid } = useParams();
    const { data: thread, isLoading: isLoadingThread } = useAiAgentThread(
        agentUuid,
        threadUuid,
    );

    const agentQuery = useAiAgent(agentUuid);
    const { agent } = useOutletContext<AgentContext>();

    const {
        mutateAsync: generateAgentThreadResponse,
        isLoading: isGenerating,
    } = useGenerateAgentThreadResponseMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );

    const viewport = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!viewport.current) return;

        const scrollToBottom = () => {
            const element = viewport.current!;
            element.scrollTo({
                top: element.scrollHeight,
                behavior: 'smooth',
            });
        };

        const raf = requestAnimationFrame(scrollToBottom);
        const timeout = setTimeout(scrollToBottom, 300);

        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(timeout);
        };
    }, [isGenerating, thread?.messages.length]);

    const handleSubmit = (prompt: string) => {
        void generateAgentThreadResponse({ prompt });
    };

    if (isLoadingThread || !thread || agentQuery.isLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <Stack h="100%" justify="space-between" py="xl">
            <ScrollArea
                type="hover"
                offsetScrollbars="y"
                styles={{
                    content: {
                        flex: 1,
                    },
                }}
                viewportRef={viewport}
            >
                {/* Padding left to make up space from the scrollbar */}
                <Stack
                    {...ChatElementsUtils.centeredElementProps}
                    gap="xl"
                    pl="xl"
                >
                    {thread.messages.map((message, i, xs) => {
                        return (
                            <Fragment key={`${message.role}-${message.uuid}`}>
                                {ChatElementsUtils.shouldRenderDivider(
                                    message,
                                    i,
                                    xs,
                                ) && (
                                    <Divider
                                        label={ChatElementsUtils.getDividerLabel(
                                            message.createdAt,
                                        )}
                                        labelPosition="center"
                                        my="sm"
                                    />
                                )}
                                <AiThreadMessage
                                    message={message}
                                    agentName={agentQuery.data?.name ?? 'AI'}
                                />
                            </Fragment>
                        );
                    })}
                </Stack>
            </ScrollArea>
            <Box
                {...ChatElementsUtils.centeredElementProps}
                pos="sticky"
                bottom={0}
                h="auto"
            >
                <AgentChatInput
                    disabled={thread.createdFrom === 'slack'}
                    disabledReason={t(
                        'ai_agents_thread_page.thread_created_in_slack',
                    )}
                    loading={isGenerating}
                    onSubmit={handleSubmit}
                    placeholder={t('ai_agents_thread_page.ask_agent_anything', {
                        agentName: agent.name,
                    })}
                />
            </Box>
        </Stack>
    );
};

export default AiAgentThreadPage;
