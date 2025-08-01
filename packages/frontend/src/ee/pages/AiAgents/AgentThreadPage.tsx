import { Center, Loader } from '@mantine-8/core';
import { useOutletContext, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import {
    useAiAgent,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
import { useAiAgentThreadStreaming } from '../../features/aiCopilot/streaming/useAiAgentThreadStreamQuery';
import { type AgentContext } from './AgentPage';

const AiAgentThreadPage = () => {
    const { t } = useTranslation();

    const { agentUuid, threadUuid, projectUuid } = useParams();
    const { user } = useApp();
    const { data: thread, isLoading: isLoadingThread } = useAiAgentThread(
        agentUuid,
        threadUuid,
    );

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const agentQuery = useAiAgent(agentUuid);
    const { agent } = useOutletContext<AgentContext>();

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(projectUuid, agentUuid, threadUuid);
    const isStreaming = useAiAgentThreadStreaming(threadUuid!);

    const handleSubmit = (prompt: string) => {
        void createAgentThreadMessage({ prompt });
    };

    if (isLoadingThread || !thread || agentQuery.isLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <AgentChatDisplay
            thread={thread}
            agentName={agentQuery.data?.name ?? 'AI'}
            enableAutoScroll={true}
            mode="interactive"
        >
            <AgentChatInput
                disabled={
                    thread.createdFrom === 'slack' || !isThreadFromCurrentUser
                }
                disabledReason={t('ai_agents_thread_page.thread_created_in_slack')}
                loading={isCreatingMessage || isStreaming}
                onSubmit={handleSubmit}
                placeholder={t('ai_agents_thread_page.ask_agent_anything', {
                    agentName: agent.name,
                })}
            />
        </AgentChatDisplay>
    );
};

export default AiAgentThreadPage;
