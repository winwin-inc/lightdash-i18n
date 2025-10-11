import type { AiArtifact, ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const AI_AGENT_ARTIFACT_KEY = 'aiAgentArtifact';

const getAiAgentArtifact = async (
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
): Promise<AiArtifact> => {
    return lightdashApi<AiArtifact>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}`,
        method: 'GET',
        body: undefined,
    });
};

const getAiAgentArtifactVersion = async (
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
    versionUuid: string,
): Promise<AiArtifact> => {
    return lightdashApi<AiArtifact>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}`,
        method: 'GET',
        body: undefined,
    });
};

type UseAiAgentArtifactProps = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid?: string;
    versionUuid?: string;
    options?: UseQueryOptions<AiArtifact, ApiError>;
};

export const useAiAgentArtifact = ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    options,
}: UseAiAgentArtifactProps) => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    const queryKey = versionUuid
        ? [
              AI_AGENT_ARTIFACT_KEY,
              projectUuid,
              agentUuid,
              artifactUuid,
              'version',
              versionUuid,
          ]
        : [AI_AGENT_ARTIFACT_KEY, projectUuid, agentUuid, artifactUuid];

    const queryFn = versionUuid
        ? () =>
              getAiAgentArtifactVersion(
                  projectUuid,
                  agentUuid,
                  artifactUuid!,
                  versionUuid,
              )
        : () => getAiAgentArtifact(projectUuid, agentUuid, artifactUuid!);

    return useQuery<AiArtifact, ApiError>({
        queryKey,
        queryFn,
        ...options,
        onError: (error) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: versionUuid
                        ? t(
                              'ai_copilot_hooks.agent_artifact.failed_to_fetch_artifact_version',
                          )
                        : t(
                              'ai_copilot_hooks.agent_artifact.failed_to_fetch_artifact',
                          ),
                    apiError: error.error,
                });
            }
            options?.onError?.(error);
        },
        enabled: !!artifactUuid && !!versionUuid && options?.enabled,
        ...options,
    });
};
