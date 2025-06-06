import {
    type ApiError,
    type ChartHistory,
    type ChartVersion,
    type CreateSavedChart,
    type CreateSavedChartVersion,
    type SavedChart,
    type UpdateMultipleSavedChart,
    type UpdateSavedChart,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    type UseMutationOptions,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useToaster from './toaster/useToaster';
import useSearchParams from './useSearchParams';

const createSavedQuery = async (
    projectUuid: string,
    payload: CreateSavedChart,
): Promise<SavedChart> => {
    const timezoneFixPayload: CreateSavedChart = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
        },
    };
    return lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/saved`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const duplicateSavedQuery = async (
    projectUuid: string,
    chartUuid: string,
    data: { chartName: string; chartDesc: string },
): Promise<SavedChart> =>
    lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/saved?duplicateFrom=${chartUuid}`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteSavedQuery = async (id: string) =>
    lightdashApi<null>({
        url: `/saved/${id}`,
        method: 'DELETE',
        body: undefined,
    });

const updateSavedQuery = async (
    id: string,
    data: UpdateSavedChart,
): Promise<SavedChart> => {
    return lightdashApi<SavedChart>({
        url: `/saved/${id}`,
        method: 'PATCH',
        body: JSON.stringify({
            name: data.name,
            description: data.description,
            spaceUuid: data.spaceUuid,
        }),
    });
};

const getSavedQuery = async (id: string): Promise<SavedChart> =>
    lightdashApi<SavedChart>({
        url: `/saved/${id}`,
        method: 'GET',
        body: undefined,
    });

const addVersionSavedQuery = async ({
    uuid,
    payload,
}: {
    uuid: string;
    payload: CreateSavedChartVersion;
}): Promise<SavedChart> => {
    const timezoneFixPayload: CreateSavedChartVersion = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
            timezone: payload.metricQuery.timezone ?? undefined,
        },
    };
    return lightdashApi<SavedChart>({
        url: `/saved/${uuid}/version`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

interface Args {
    id?: string;
    useQueryOptions?: UseQueryOptions<SavedChart, ApiError>;
}

export const useSavedQuery = ({ id, useQueryOptions }: Args = {}) =>
    useQuery<SavedChart, ApiError>({
        queryKey: ['saved_query', id],
        queryFn: () => getSavedQuery(id || ''),
        enabled: id !== undefined,
        retry: false,
        ...useQueryOptions,
    });

const getChartHistoryQuery = async (chartUuid: string): Promise<ChartHistory> =>
    lightdashApi<ChartHistory>({
        url: `/saved/${chartUuid}/history`,
        method: 'GET',
        body: undefined,
    });

export const useChartHistory = (chartUuid: string | undefined) =>
    useQuery<ChartHistory, ApiError>({
        queryKey: ['chart_history', chartUuid],
        queryFn: () => getChartHistoryQuery(chartUuid!),
        enabled: chartUuid !== undefined,
        retry: false,
    });
const getChartVersionQuery = async (
    chartUuid: string,
    versionUuid: string,
): Promise<ChartVersion> =>
    lightdashApi<ChartVersion>({
        url: `/saved/${chartUuid}/version/${versionUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useChartVersion = (
    chartUuid: string | undefined,
    versionUuid?: string,
) =>
    useQuery<ChartVersion, ApiError>({
        queryKey: ['chart_version', chartUuid, versionUuid],
        queryFn: () => getChartVersionQuery(chartUuid!, versionUuid!),
        enabled: versionUuid !== undefined && chartUuid !== undefined,
        retry: false,
    });

const rollbackChartQuery = async (
    chartUuid: string,
    versionUuid: string,
): Promise<null> =>
    lightdashApi<null>({
        url: `/saved/${chartUuid}/rollback/${versionUuid}`,
        method: 'POST',
        body: undefined,
    });
export const useChartVersionRollbackMutation = (
    chartUuid: string | undefined,
    useMutationOptions?: Omit<
        UseMutationOptions<null, ApiError, string, unknown>,
        'mutationFn'
    >,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<null, ApiError, string>(
        (versionUuid: string) =>
            chartUuid && versionUuid
                ? rollbackChartQuery(chartUuid, versionUuid)
                : Promise.reject(),
        {
            mutationKey: ['saved_query_rollback'],
            ...useMutationOptions,
            onSuccess: async (...args) => {
                showToastSuccess({
                    title: t('hooks_saved_query.revert_success'),
                });
                useMutationOptions?.onSuccess?.(...args);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_saved_query.revert_failed'),
                    apiError: error,
                });
            },
        },
    );
};

export const useSavedQueryDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<null, ApiError, string>(
        async (data) => {
            queryClient.removeQueries(['savedChartResults', data]);
            return deleteSavedQuery(data);
        },
        {
            mutationKey: ['saved_query_create'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space']);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                showToastSuccess({
                    title: t('hooks_saved_query.delete_success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_saved_query.delete_error'),
                    apiError: error,
                });
            },
        },
    );
};

const updateMultipleSavedQuery = async (
    projectUuid: string,
    data: UpdateMultipleSavedChart[],
): Promise<SavedChart[]> => {
    return lightdashApi<SavedChart[]>({
        url: `/projects/${projectUuid}/saved`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });
};

export const useUpdateMultipleMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<SavedChart[], ApiError, UpdateMultipleSavedChart[]>(
        (data) => {
            return updateMultipleSavedQuery(projectUuid, data);
        },
        {
            mutationKey: ['saved_query_multiple_update'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                data.forEach((savedChart) => {
                    queryClient.setQueryData(
                        ['saved_query', savedChart.uuid],
                        savedChart,
                    );
                });
                showToastSuccess({
                    title: t('hooks_saved_query.updated_success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_saved_query.updated_error'),
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateMutation = (
    dashboardUuid?: string,
    savedQueryUuid?: string,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        SavedChart,
        ApiError,
        Pick<UpdateSavedChart, 'name' | 'description'>
    >(
        (data) => {
            if (savedQueryUuid) {
                return updateSavedQuery(savedQueryUuid, data);
            }
            throw new Error('Saved chart ID is undefined');
        },
        {
            mutationKey: ['saved_query_create'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries([
                    'space',
                    data.projectUuid,
                ]);

                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                await queryClient.invalidateQueries(['spaces']);
                queryClient.setQueryData(['saved_query', data.uuid], data);
                showToastSuccess({
                    title: t('hooks_saved_query.save_success'),
                    action: dashboardUuid
                        ? {
                              children: t('hooks_saved_query.open_dashboard'),
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${data.projectUuid}/dashboards/${dashboardUuid}`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_saved_query.save_error'),
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateMutation = () => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<SavedChart, ApiError, CreateSavedChart>(
        (data) =>
            projectUuid
                ? createSavedQuery(projectUuid, data)
                : Promise.reject(),
        {
            mutationKey: ['saved_query_create', projectUuid],
            onSuccess: (data) => {
                queryClient.setQueryData(['saved_query', data.uuid], data);
                showToastSuccess({
                    title: t('hooks_saved_query.save_success'),
                });
                void navigate(
                    `/projects/${projectUuid}/saved/${data.uuid}/view`,
                    {
                        replace: true,
                    },
                );
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_saved_query.save_error'),
                    apiError: error,
                });
            },
        },
    );
};

type DuplicateChartMutationOptions = {
    showRedirectButton?: boolean;
    successMessage?: string;
    autoRedirect?: boolean;
};

export const useDuplicateChartMutation = (
    options?: DuplicateChartMutationOptions,
) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        SavedChart,
        ApiError,
        Pick<SavedChart, 'uuid' | 'name' | 'description'>
    >(
        ({ uuid, name, description }) =>
            projectUuid
                ? duplicateSavedQuery(projectUuid, uuid, {
                      chartName: name,
                      chartDesc: description ?? '',
                  })
                : Promise.reject(),
        {
            mutationKey: ['saved_query_create', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                if (
                    !options?.showRedirectButton &&
                    options?.autoRedirect !== false
                ) {
                    void navigate(
                        `/projects/${projectUuid}/saved/${data.uuid}`,
                    );
                }

                showToastSuccess({
                    title:
                        options?.successMessage ||
                        t('hooks_saved_query.duplicated_success'),
                    action: options?.showRedirectButton
                        ? {
                              children: t('hooks_saved_query.open_chart'),
                              icon: IconArrowRight,
                              onClick: () => {
                                  void navigate(
                                      `/projects/${projectUuid}/saved/${data.uuid}`,
                                  );
                              },
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_saved_query.duplicated_error'),
                    apiError: error,
                });
            },
        },
    );
};

export const useAddVersionMutation = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const dashboardUuid = useSearchParams('fromDashboard');

    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        SavedChart,
        ApiError,
        { uuid: string; payload: CreateSavedChartVersion }
    >(addVersionSavedQuery, {
        mutationKey: ['saved_query_version'],
        onSuccess: async (data) => {
            await queryClient.invalidateQueries(['spaces']);
            await queryClient.invalidateQueries([
                'most-popular-and-recently-updated',
            ]);

            queryClient.setQueryData(['saved_query', data.uuid], data);
            await queryClient.resetQueries(['savedChartResults', data.uuid]);

            if (dashboardUuid)
                showToastSuccess({
                    title: t('hooks_saved_query.update_success'),
                    action: {
                        children: t('hooks_saved_query.open_dashboard'),
                        icon: IconArrowRight,
                        onClick: () =>
                            navigate(
                                `/projects/${data.projectUuid}/dashboards/${dashboardUuid}`,
                            ),
                    },
                });
            else {
                showToastSuccess({
                    title: t('hooks_saved_query.update_success'),
                });
                void navigate(
                    `/projects/${data.projectUuid}/saved/${data.uuid}/view`,
                );
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_saved_query.update_error'),
                apiError: error,
            });
        },
    });
};
