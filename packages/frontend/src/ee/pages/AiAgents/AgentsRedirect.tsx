import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import PageSpinner from '../../../components/PageSpinner';
import useToaster from '../../../hooks/toaster/useToaster';
import { useDefaultProject } from '../../../hooks/useProjects';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';

/**
 * Page used to facilitate linking users to ai agents.
 * This page will redirect them to their default project ai-agents welcome page.
 */
const AgentsRedirect = () => {
    const { t } = useTranslation();

    const { data, isLoading } = useDefaultProject();
    const { showToastInfo } = useToaster();
    const canViewAiAgents = useAiAgentPermission({
        action: 'view',
        projectUuid: data?.projectUuid,
    });

    useEffect(() => {
        if (!canViewAiAgents) {
            showToastInfo({
                subtitle: t('pages_ai_agents_redirect.not_allowed'),
            });
        }
    }, [canViewAiAgents, showToastInfo, t]);

    if (isLoading) {
        return <PageSpinner />;
    }

    if (canViewAiAgents && data) {
        return (
            <Navigate to={`/projects/${data.projectUuid}/ai-agents`} replace />
        );
    }

    return <Navigate to={`/projects/`} />;
};

export default AgentsRedirect;
