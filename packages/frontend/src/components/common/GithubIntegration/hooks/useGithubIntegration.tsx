import {
    type ApiError,
    type GitIntegrationConfiguration,
    type GitRepo,
} from '@lightdash/common';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const getGithubConfig = async () =>
    lightdashApi<GitIntegrationConfiguration>({
        url: `/github/config`,
        method: 'GET',
        body: undefined,
    });

export const useGithubConfig = () => {
    const { t } = useTranslation();
    const { showToastApiError } = useToaster();

    return useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['github_installation'],
        queryFn: () => getGithubConfig(),
        retry: false,
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return; // Ignore missing installation errors or unauthorized in demo

            showToastApiError({
                title: t('hooks_github_integration.get_error'),
                apiError: error,
            });
        },
    });
};

const getGithubRepositories = async () =>
    lightdashApi<GitRepo[]>({
        url: `/github/repos/list`,
        method: 'GET',
        body: undefined,
    });

export const useGitHubRepositories = () => {
    const { t } = useTranslation();
    const { showToastApiError } = useToaster();

    return useQuery<GitRepo[], ApiError>({
        queryKey: ['github_branches'],
        queryFn: () => getGithubRepositories(),
        retry: false,
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return; // Ignore missing installation errors or unauthorized in demo

            showToastApiError({
                title: t('hooks_github_integration.get_error'),
                apiError: error,
            });
        },
    });
};
const deleteGithubInstallation = async () =>
    lightdashApi<null>({
        url: `/github/uninstall`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteGithubInstallationMutation = () => {
    const { t } = useTranslation();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError>(
        ['delete_github_installation'],
        () => deleteGithubInstallation(),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['github_branches']);
                showToastSuccess({
                    title: t('hooks_github_integration.delete_success'),
                    subtitle: t(
                        'hooks_github_integration.delete_success_subtitle',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_github_integration.delete_error'),
                    apiError: error,
                });
            },
        },
    );
};
