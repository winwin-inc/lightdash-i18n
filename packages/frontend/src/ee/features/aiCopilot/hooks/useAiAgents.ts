import {
    type ApiAiAgentResponse,
    type ApiAiAgentSummaryResponse,
    type ApiAiAgentThreadResponse,
    type ApiAiAgentThreadSummaryListResponse,
    type ApiCreateAiAgent,
    type ApiCreateAiAgentResponse,
    type ApiError,
    type ApiSuccessEmpty,
    type ApiUpdateAiAgent,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const AI_AGENTS_KEY = 'aiAgents';

// API calls
const listAgents = () =>
    lightdashApi<ApiAiAgentSummaryResponse['results']>({
        version: 'v1',
        url: `/aiAgents`,
        method: 'GET',
        body: undefined,
    });

const getAgent = async (
    agentUuid: string,
): Promise<ApiAiAgentResponse['results']> =>
    lightdashApi<ApiAiAgentResponse['results']>({
        version: 'v1',
        url: `/aiAgents/${agentUuid}`,
        method: 'GET',
        body: undefined,
    });

const createAgent = async (data: ApiCreateAiAgent) =>
    lightdashApi<ApiCreateAiAgentResponse['results']>({
        version: 'v1',
        url: `/aiAgents`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateAgent = async (data: ApiUpdateAiAgent) =>
    lightdashApi<ApiAiAgentResponse['results']>({
        version: 'v1',
        url: `/aiAgents/${data.uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const listAgentThreads = async (agentUuid: string) =>
    lightdashApi<ApiAiAgentThreadSummaryListResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads`,
        method: 'GET',
        body: undefined,
    });

const getAgentThread = async (agentUuid: string, threadUuid: string) =>
    lightdashApi<ApiAiAgentThreadResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads/${threadUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useAiAgents = (
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentSummaryResponse['results'],
        ApiError
    >,
) => {
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useQuery<ApiAiAgentSummaryResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY],
        queryFn: listAgents,
        onError: (error) => {
            showToastApiError({
                title: t(
                    'features_ai_copilot_agents_hooks.failed_to_fetch_agents',
                ),
                apiError: error.error,
            });
        },
        ...useQueryOptions,
    });
};

export const useAiAgent = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<ApiAiAgentResponse['results'], ApiError>,
) => {
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useQuery<ApiAiAgentResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, agentUuid],
        queryFn: () => getAgent(agentUuid),
        onError: (error) => {
            showToastApiError({
                title: t(
                    'features_ai_copilot_agents_hooks.failed_to_fetch_agent',
                ),
                apiError: error.error,
            });
        },
        ...useQueryOptions,
    });
};

export const useCreateAiAgentMutation = (
    options?: UseMutationOptions<
        ApiCreateAiAgentResponse['results'],
        ApiError,
        ApiCreateAiAgent
    >,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        ApiCreateAiAgentResponse['results'],
        ApiError,
        ApiCreateAiAgent
    >({
        mutationFn: createAgent,
        onSuccess: () => {
            showToastSuccess({
                title: t('features_ai_copilot_agents_hooks.created_agent'),
            });
            void queryClient.invalidateQueries({ queryKey: [AI_AGENTS_KEY] });
            void navigate('/generalSettings/aiAgents');
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t(
                    'features_ai_copilot_agents_hooks.failed_to_create_agent',
                ),
                apiError: error,
            });
        },
        ...options,
    });
};

export const useUpdateAiAgentMutation = (
    options?: UseMutationOptions<
        ApiAiAgentResponse['results'],
        ApiError,
        ApiUpdateAiAgent
    >,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        ApiAiAgentResponse['results'],
        ApiError,
        ApiUpdateAiAgent
    >({
        mutationFn: (data) => updateAgent(data),
        onSuccess: async (data) => {
            showToastSuccess({
                title: t('features_ai_copilot_agents_hooks.updated_agent'),
            });
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY, data.uuid],
            });
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t(
                    'features_ai_copilot_agents_hooks.failed_to_update_agent',
                ),
                apiError: error,
            });
        },
        ...options,
    });
};

const deleteAgent = async (agentUuid: string) =>
    lightdashApi<ApiSuccessEmpty>({
        version: 'v1',
        url: `/aiAgents/${agentUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteAiAgentMutation = (
    options?: UseMutationOptions<ApiSuccessEmpty, ApiError, string>,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<ApiSuccessEmpty, ApiError, string>({
        mutationFn: (agentUuid) => deleteAgent(agentUuid),
        onSuccess: () => {
            showToastSuccess({
                title: t('features_ai_copilot_agents_hooks.deleted_agent'),
            });
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY],
                exact: true,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t(
                    'features_ai_copilot_agents_hooks.failed_to_delete_agent',
                ),
                apiError: error,
            });
        },
        ...options,
    });
};

export const useAiAgentThreads = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadSummaryListResponse['results'],
        ApiError
    >,
) => {
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useQuery<ApiAiAgentThreadSummaryListResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, agentUuid, 'threads'],
        queryFn: () => listAgentThreads(agentUuid),
        onError: (error) => {
            showToastApiError({
                title: t(
                    'features_ai_copilot_agents_hooks.failed_to_fetch_threads',
                ),
                apiError: error.error,
            });
        },
        ...useQueryOptions,
    });
};

export const useAiAgentThread = (
    agentUuid: string,
    threadUuid: string,
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadResponse['results'],
        ApiError
    >,
) => {
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useQuery<ApiAiAgentThreadResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, agentUuid, 'threads', threadUuid],
        queryFn: () => getAgentThread(agentUuid, threadUuid),
        onError: (error) => {
            showToastApiError({
                title: t(
                    'features_ai_copilot_agents_hooks.failed_to_fetch_thread',
                ),
                apiError: error.error,
            });
        },
        ...useQueryOptions,
    });
};
