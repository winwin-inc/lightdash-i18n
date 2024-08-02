import {
    type ApiCreateSqlChart,
    type ApiError,
    type ApiUpdateSqlChart,
    type CreateSqlChart,
    type SqlChart,
    type UpdateSqlChart,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export type GetSavedSqlChartParams = {
    projectUuid: string;
    slug?: string;
    uuid?: string;
    onSuccess?: (data: SqlChart) => void;
};

const fetchSavedSqlChart = async ({
    projectUuid,
    slug,
    uuid,
}: GetSavedSqlChartParams) =>
    lightdashApi<SqlChart>({
        url: uuid
            ? `/projects/${projectUuid}/sqlRunner/saved/${uuid}`
            : `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}`,
        method: 'GET',
        body: undefined,
    });

const createSavedSqlChart = async (projectUuid: string, data: CreateSqlChart) =>
    lightdashApi<ApiCreateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateSavedSqlChart = async (
    projectUuid: string,
    savedSqlUuid: string,
    data: UpdateSqlChart,
) =>
    lightdashApi<ApiUpdateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useSavedSqlChart = ({
    projectUuid,
    slug,
    uuid,
    onSuccess,
}: GetSavedSqlChartParams) => {
    return useQuery<SqlChart, ApiError>({
        queryKey: ['sqlRunner', 'savedSqlChart', projectUuid, slug, uuid],
        queryFn: () => fetchSavedSqlChart({ projectUuid, slug, uuid }),
        retry: false,
        enabled: !!slug || !!uuid,
        onSuccess: (data) => {
            if (onSuccess) onSuccess(data);
        },
    });
};

export const useCreateSqlChartMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const history = useHistory();
    const { t } = useTranslation();

    return useMutation<ApiCreateSqlChart['results'], ApiError, CreateSqlChart>(
        (data) => createSavedSqlChart(projectUuid, data),
        {
            mutationKey: ['sqlRunner', 'createSqlChart', projectUuid],
            onSuccess: (data) => {
                history.replace(
                    `/projects/${projectUuid}/sql-runner-new/saved/${data.slug}`,
                );

                showToastSuccess({
                    title: t('features_sql_runner_charts.created.success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('features_sql_runner_charts.created.failed'),
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateSqlChartMutation = (
    projectUuid: string,
    savedSqlUuid: string,
) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<{ savedSqlUuid: string }, ApiError, UpdateSqlChart>(
        (data) => updateSavedSqlChart(projectUuid, savedSqlUuid!, data),
        {
            mutationKey: ['sqlRunner', 'updateSqlChart', savedSqlUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['sqlRunner']);
                showToastSuccess({
                    title: t('features_sql_runner_charts.updated.success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('features_sql_runner_charts.updated.success'),
                    apiError: error,
                });
            },
        },
    );
};

const deleteSavedSqlChart = async (projectUuid: string, savedSqlUuid: string) =>
    lightdashApi<ApiUpdateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteSqlChartMutation = (
    projectUuid: string,
    savedSqlUuid: string,
) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<{ savedSqlUuid: string }, ApiError>(
        () => deleteSavedSqlChart(projectUuid, savedSqlUuid),
        {
            mutationKey: ['sqlRunner', 'deleteSqlChart', savedSqlUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['sqlRunner']);
                showToastSuccess({
                    title: t('features_sql_runner_charts.deleted.success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('features_sql_runner_charts.deleted.success'),
                    apiError: error,
                });
            },
        },
    );
};
