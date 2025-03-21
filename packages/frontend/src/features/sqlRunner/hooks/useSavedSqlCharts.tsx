import {
    type ApiCreateSqlChart,
    type ApiError,
    type ApiUpdateSqlChart,
    type CreateSqlChart,
    type SqlChart,
    type UpdateSqlChart,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export type GetSavedSqlChartParams = {
    projectUuid: string;
    slug?: string;
    uuid?: string;
    onSuccess?: (data: SqlChart) => void;
};

export const fetchSavedSqlChart = async ({
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

export const useSavedSqlChart = (
    { projectUuid, slug, uuid }: GetSavedSqlChartParams,
    useQueryParams?: UseQueryOptions<SqlChart, ApiError & { slug?: string }>,
) => {
    return useQuery<SqlChart, ApiError>({
        queryKey: ['sqlRunner', 'savedSqlChart', projectUuid, slug, uuid],
        queryFn: () => fetchSavedSqlChart({ projectUuid, slug, uuid }),
        retry: false,
        enabled: !!slug || !!uuid,
        ...useQueryParams,
    });
};

export const useCreateSqlChartMutation = (projectUuid: string) => {
    const { t } = useTranslation();

    const { showToastSuccess, showToastApiError } = useToaster();
    const navigate = useNavigate();

    return useMutation<ApiCreateSqlChart['results'], ApiError, CreateSqlChart>(
        (data) => createSavedSqlChart(projectUuid, data),
        {
            mutationKey: ['sqlRunner', 'createSqlChart', projectUuid],
            onSuccess: (data) => {
                void navigate(
                    `/projects/${projectUuid}/sql-runner/${data.slug}`,
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
    projectUuid: string | undefined,
    savedSqlUuid: string,
    slug: string,
) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        { savedSqlUuid: string },
        ApiError,
        UpdateSqlChart & { savedSqlUuid?: string }
    >(
        (data) =>
            projectUuid
                ? updateSavedSqlChart(
                      projectUuid,
                      data.savedSqlUuid || savedSqlUuid!,
                      data,
                  )
                : Promise.reject(),
        {
            mutationKey: ['sqlRunner', 'updateSqlChart', savedSqlUuid],
            onSuccess: async () => {
                await queryClient.resetQueries(['savedSqlChart', slug]);
                await queryClient.resetQueries(['savedSqlChartResults', slug]);
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space']);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);
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
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space']);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

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
