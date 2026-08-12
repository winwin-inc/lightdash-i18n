import { type ApiError, type TablesConfiguration } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getProjectTablesConfigurationQuery = async (projectUuid: string) =>
    lightdashApi<TablesConfiguration>({
        url: `/projects/${projectUuid}/tablesConfiguration`,
        method: 'GET',
        body: undefined,
    });

const updateProjectTablesConfigurationQuery = async (
    projectUuid: string,
    data: TablesConfiguration,
) =>
    lightdashApi<TablesConfiguration>({
        url: `/projects/${projectUuid}/tablesConfiguration`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useProjectTablesConfiguration = (projectUuid: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<TablesConfiguration, ApiError>({
        queryKey: ['tables_configuration_update', projectUuid],
        queryFn: () => getProjectTablesConfigurationQuery(projectUuid),
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateProjectTablesConfiguration = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    return useMutation<TablesConfiguration, ApiError, TablesConfiguration>(
        (data) => updateProjectTablesConfigurationQuery(projectUuid, data),
        {
            mutationKey: ['tables_configuration_update', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['tables']);
                queryClient.setQueryData(
                    ['tables_configuration_update', projectUuid],
                    data,
                );
                showToastSuccess({
                    title: t(
                        'hooks_project_tables_configuration.save_success',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'hooks_project_tables_configuration.save_error',
                    ),
                    apiError: error,
                });
            },
        },
    );
};
