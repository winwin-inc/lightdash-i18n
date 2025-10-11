import { type ApiError, type GitRepo } from '@lightdash/common';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const getGitlabRepositories = async (): Promise<GitRepo[]> =>
    lightdashApi<GitRepo[]>({
        url: `/gitlab/repos/list`,
        method: 'GET',
        body: undefined,
    });

export const useGitlabRepositories = () => {
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useQuery<GitRepo[], ApiError>({
        queryKey: ['gitlab_repositories'],
        queryFn: () => getGitlabRepositories(),
        retry: false,
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return; // Ignore missing installation errors or unauthorized in demo

            showToastApiError({
                title: t(
                    'hooks_use_gitlab_installation.failed_to_get_gitlab_repositories',
                ),
                apiError: error,
            });
        },
    });
};

const deleteGitlabInstallation = async (): Promise<void> =>
    lightdashApi<undefined>({
        url: `/gitlab/uninstall`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteGitlabInstallationMutation = () => {
    const { showToastApiError, showToastSuccess } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    return useMutation<void, ApiError, void>({
        mutationFn: deleteGitlabInstallation,
        onSuccess: async () => {
            await queryClient.invalidateQueries(['gitlab_installation']);
            await queryClient.invalidateQueries(['gitlab_repositories']);
            showToastSuccess({
                title: t(
                    'hooks_use_gitlab_installation.success_deleted_gitlab_installation',
                ),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t(
                    'hooks_use_gitlab_installation.failed_to_delete_gitlab_installation',
                ),
                apiError: error,
            });
        },
    });
};
