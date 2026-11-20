import {
    SchedulerJobStatus,
    type AnyType,
    type ApiError,
    type ApiJobStatusResponse,
    type ApiSchedulersResponse,
    type ApiTestSchedulerResponse,
    type CreateSchedulerAndTargets,
    type KnexPaginateArgs,
    type SchedulerAndTargets,
    type SchedulerWithLogs,
} from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { type DestinationType } from './useSchedulerFilters';

const getScheduler = async (uuid: string) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/schedulers/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const getSchedulerLogs = async (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
    searchQuery?: string,
    filters?: {
        statuses?: SchedulerJobStatus[];
        createdByUserUuids?: string[];
        destinations?: DestinationType[];
    },
) => {
    const params = new URLSearchParams({
        page: paginateArgs.page.toString(),
        pageSize: paginateArgs.pageSize.toString(),
    });

    if (searchQuery) {
        params.set('searchQuery', searchQuery);
    }

    if (filters?.statuses && filters.statuses.length > 0) {
        params.set('statuses', filters.statuses.join(','));
    }

    if (filters?.createdByUserUuids && filters.createdByUserUuids.length > 0) {
        params.set('createdByUserUuids', filters.createdByUserUuids.join(','));
    }

    if (filters?.destinations && filters.destinations.length > 0) {
        params.set('destinations', filters.destinations.join(','));
    }

    return lightdashApi({
        url: `/schedulers/${projectUuid}/logs?${params.toString()}`,
        method: 'GET',
        body: undefined,
    }) as unknown as Promise<LogsResponse>;
};

const getPaginatedSchedulers = async (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
    searchQuery?: string,
    sortBy?: string,
    sortDirection?: 'asc' | 'desc',
    filters?: {
        createdByUserUuids?: string[];
        formats?: string[];
        resourceType?: 'chart' | 'dashboard';
        resourceUuids?: string[];
        destinations?: DestinationType[];
    },
) => {
    const urlParams = new URLSearchParams({
        page: String(paginateArgs.page),
        pageSize: String(paginateArgs.pageSize),
        ...(searchQuery ? { searchQuery } : {}),
        ...(sortBy ? { sortBy } : {}),
        ...(sortDirection ? { sortDirection } : {}),
        ...(filters?.createdByUserUuids
            ? { createdByUserUuids: filters.createdByUserUuids.join(',') }
            : {}),
        ...(filters?.formats ? { formats: filters.formats.join(',') } : {}),
        ...(filters?.resourceType
            ? { resourceType: filters.resourceType }
            : {}),
        ...(filters?.resourceUuids
            ? { resourceUuids: filters.resourceUuids.join(',') }
            : {}),
        ...(filters?.destinations
            ? { destinations: filters.destinations.join(',') }
            : {}),
    }).toString();

    return lightdashApi<ApiSchedulersResponse['results']>({
        url: `/schedulers/${projectUuid}/list?${urlParams}`,
        method: 'GET',
        body: undefined,
    });
};

export const getSchedulerJobStatus = async <
    T = ApiJobStatusResponse['results'],
>(
    jobId: string,
) =>
    lightdashApi<T extends ApiJobStatusResponse['results'] ? T : never>({
        url: `/schedulers/job/${jobId}/status`,
        method: 'GET',
        body: undefined,
    });

const sendNowScheduler = async (scheduler: CreateSchedulerAndTargets) =>
    lightdashApi<ApiTestSchedulerResponse['results']>({
        url: `/schedulers/send`,
        method: 'POST',
        body: JSON.stringify(scheduler),
    });

const sendNowSchedulerByUuid = async (
    uuid: string,
    locale: string,
) =>
    lightdashApi<ApiTestSchedulerResponse['results']>({
        url: `/schedulers/${uuid}/send`,
        method: 'POST',
        body: JSON.stringify({ locale }),
    });

export const useScheduler = (
    uuid: string | null,
    useQueryOptions?: UseQueryOptions<SchedulerAndTargets, ApiError>,
) =>
    useQuery<SchedulerAndTargets, ApiError>({
        queryKey: ['scheduler', uuid],
        queryFn: () => getScheduler(uuid!),
        enabled: !!uuid,
        ...useQueryOptions,
    });

type LogsResponse = {
    pagination?: {
        page: number;
        pageSize: number;
        totalPageCount: number;
        totalResults: number;
    };
    data: SchedulerWithLogs;
};

export const useSchedulerLogs = ({
    projectUuid,
    paginateArgs,
    searchQuery,
    filters,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
    searchQuery?: string;
    filters?: {
        statuses?: SchedulerJobStatus[];
        createdByUserUuids?: string[];
        destinations?: DestinationType[];
    };
}) => {
    return useInfiniteQuery<LogsResponse>({
        queryKey: [
            'schedulerLogs',
            projectUuid,
            paginateArgs,
            searchQuery,
            filters,
        ],
        queryFn: async ({ pageParam = 0 }) => {
            return getSchedulerLogs(
                projectUuid,
                {
                    page: (pageParam as number) + 1,
                    pageSize: paginateArgs?.pageSize || 10,
                },
                searchQuery,
                filters,
            );
        },
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length - 1;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages - 1 ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!projectUuid,
    });
};

export const usePaginatedSchedulers = ({
    projectUuid,
    paginateArgs,
    searchQuery,
    sortBy,
    sortDirection,
    filters,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
    searchQuery?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    filters?: {
        createdByUserUuids?: string[];
        formats?: string[];
        resourceType?: 'chart' | 'dashboard';
        resourceUuids?: string[];
    };
}) => {
    return useInfiniteQuery<ApiSchedulersResponse['results']>({
        queryKey: [
            'paginatedSchedulers',
            projectUuid,
            paginateArgs,
            searchQuery,
            sortBy,
            sortDirection,
            filters,
        ],
        queryFn: async ({ pageParam = 0 }) => {
            return getPaginatedSchedulers(
                projectUuid,
                {
                    page: pageParam as number,
                    pageSize: paginateArgs?.pageSize ?? 10,
                },
                searchQuery,
                sortBy,
                sortDirection,
                filters,
            );
        },
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length - 1;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages - 1 ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!projectUuid,
    });
};

/**
 * How long we keep polling a scheduler job (exports) before surfacing a timeout.
 *
 * A job whose process died mid-flight leaves `scheduler_log` stuck on `started` forever
 * (`maxAttempts = 1`, the `job:failed` handler only logs), so without a deadline the UI
 * spins indefinitely and the user has to reload the page.
 */
export const JOB_POLL_TIMEOUT_MS = 20 * 60 * 1000;

export const JOB_POLL_INTERVAL_MS = 2000;

export class JobPollTimeoutError extends Error {
    constructor(jobId: string, timeoutMs: number) {
        super(
            `Export job ${jobId} did not finish within ${Math.round(
                timeoutMs / 60000,
            )} minutes`,
        );
        this.name = 'JobPollTimeoutError';
    }
}

const getJobStatus = async (
    jobId: string,
    onComplete: (response: Record<string, AnyType> | null) => void,
    onError: (error: Error) => void,
    options: PollJobStatusOptions = {},
    startedAt: number = Date.now(),
) => {
    const deadlineMs = options.deadlineMs ?? startedAt + JOB_POLL_TIMEOUT_MS;
    getSchedulerJobStatus(jobId)
        .then((data) => {
            if (data.status === SchedulerJobStatus.COMPLETED) {
                return onComplete(data.details);
            }
            if (data.status === SchedulerJobStatus.ERROR) {
                return onError(
                    new Error(data.details?.error || 'Job failed'),
                );
            }
            // 任务仍在跑动中：把 details（含 progress）透给调用方刷新进度提示
            options.onProgress?.(data.details);
            if (Date.now() > deadlineMs) {
                return onError(
                    new JobPollTimeoutError(jobId, deadlineMs - startedAt),
                );
            }
            return setTimeout(
                () =>
                    getJobStatus(
                        jobId,
                        onComplete,
                        onError,
                        options,
                        startedAt,
                    ),
                JOB_POLL_INTERVAL_MS,
            );
        })
        .catch((error) => {
            return onError(error);
        });
};

export type PollJobStatusOptions = {
    /** 任务仍在跑动时回调，透传 job details（看板导出用 details.progress 刷新进度） */
    onProgress?: (details: Record<string, AnyType> | null) => void;
    /** 自定义轮询截止时间（毫秒），缺省 JOB_POLL_TIMEOUT_MS（20 分钟） */
    deadlineMs?: number;
};

export const pollJobStatus = async (
    jobId: string,
    options: PollJobStatusOptions = {},
) => {
    const startedAt = Date.now();
    return new Promise<Record<string, AnyType> | null>((resolve, reject) =>
        getJobStatus(
            jobId,
            (details) => resolve(details),
            (error) => reject(error),
            options,
            startedAt,
        ),
    );
};

const useSendNowJobStatus = (jobId: string | undefined) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const {
        showToastError,
        showToastInfo,
        showToastSuccess,
        showToastApiError,
    } = useToaster();
    return useQuery<ApiJobStatusResponse['results'] | undefined, ApiError>(
        ['jobStatus', jobId],
        () => {
            if (!jobId) return;

            setTimeout(() => {
                notifications.hide('toast-info-job-status');
            }, 1000);

            return getSchedulerJobStatus(jobId);
        },
        {
            refetchInterval: (data) => {
                if (
                    data?.status === SchedulerJobStatus.COMPLETED ||
                    data?.status === SchedulerJobStatus.ERROR
                )
                    return false;

                return 2000;
            },
            onSuccess: (data) => {
                if (data) {
                    showToastInfo({
                        key: 'toast-info-job-scheduled-delivery-status',
                        title: t(
                            'features_scheduler_hooks.scheduler.process_scheduled_delivery',
                        ),
                        subtitle: t(
                            'features_scheduler_hooks.scheduler.process_scheduled_delivery_subtitle',
                        ),
                        loading: true,
                        autoClose: false,
                        styles: {
                            root: {
                                minHeight: 56,
                                paddingTop: 12,
                                paddingBottom: 12,
                            },
                        },
                    });
                }
                if (data?.status === SchedulerJobStatus.COMPLETED) {
                    showToastSuccess({
                        title: t(
                            'features_scheduler_hooks.scheduler.scheduleed_successfully',
                        ),
                    });

                    return setTimeout(
                        () =>
                            notifications.hide(
                                'toast-info-job-scheduled-delivery-status',
                            ),
                        1000,
                    );
                }
                if (data?.status === SchedulerJobStatus.ERROR) {
                    showToastError({
                        title: t(
                            'features_scheduler_hooks.scheduler.send_scheduled_delivery_failed',
                        ),
                        ...(data?.details?.error && {
                            subtitle: data.details.error,
                        }),
                    });
                    return setTimeout(
                        () =>
                            notifications.hide(
                                'toast-info-job-scheduled-delivery-status',
                            ),
                        1000,
                    );
                }
            },
            onError: async ({ error }) => {
                showToastApiError({
                    title: t(
                        'features_scheduler_hooks.scheduler.polling_job_status_error',
                    ),
                    apiError: error,
                });

                setTimeout(
                    () =>
                        notifications.hide(
                            'toast-info-job-scheduled-delivery-status',
                        ),
                    1000,
                );

                await queryClient.cancelQueries(['jobStatus', jobId]);
            },
            enabled: Boolean(jobId !== undefined),
        },
    );
};

export const useSendNowScheduler = () => {
    const { t } = useTranslation();
    const { showToastInfo, showToastApiError } = useToaster();

    const sendNowMutation = useMutation<
        ApiTestSchedulerResponse['results'],
        ApiError,
        CreateSchedulerAndTargets
    >(
        (res) => {
            showToastInfo({
                key: 'toast-info-job-status',
                title: t(
                    'features_scheduler_hooks.send_now_scheduler.processing_job',
                ),
                subtitle: t(
                    'features_scheduler_hooks.send_now_scheduler.processing_job_subtitle',
                ),
                loading: true,
                autoClose: false,
                styles: {
                    root: { minHeight: 56, paddingTop: 12, paddingBottom: 12 },
                },
            });
            return sendNowScheduler(res);
        },
        {
            mutationKey: ['sendNowScheduler'],
            onSuccess: (res) => {
                pollJobStatus(res.jobId || '')
                    .then((data) => {
                        if (data?.status === SchedulerJobStatus.ERROR) {
                            throw new Error(data?.details?.error);
                        }
                    })
                    .catch((e) => {
                        throw e;
                    });
            },
            onError: (apiError: ApiError) => {
                showToastApiError({
                    key: 'toast-info-job-status',
                    title: t(
                        'features_scheduler_hooks.send_now_scheduler.failed_to_process_job',
                    ),
                    apiError: apiError.error,
                });
            },
        },
    );

    const { data: scheduledDeliveryJobStatus } = useSendNowJobStatus(
        sendNowMutation.data?.jobId,
    );

    const isLoading = useMemo(
        () =>
            sendNowMutation.isLoading ||
            scheduledDeliveryJobStatus?.status === SchedulerJobStatus.STARTED,
        [scheduledDeliveryJobStatus?.status, sendNowMutation.isLoading],
    );

    return {
        ...sendNowMutation,
        isLoading,
    };
};

export const useSendNowSchedulerByUuid = (schedulerUuid: string) => {
    const { t, i18n } = useTranslation();
    const { showToastInfo, showToastApiError } = useToaster();

    const sendNowMutation = useMutation<
        ApiTestSchedulerResponse['results'],
        ApiError,
        void
    >(
        async () => {
            showToastInfo({
                key: 'toast-info-job-status',
                title: t(
                    'features_scheduler_hooks.send_now_scheduler.processing_job',
                ),
                subtitle: t(
                    'features_scheduler_hooks.send_now_scheduler.processing_job_subtitle',
                ),
                loading: true,
                autoClose: false,
                styles: {
                    root: { minHeight: 56, paddingTop: 12, paddingBottom: 12 },
                },
            });
            return sendNowSchedulerByUuid(
                schedulerUuid,
                i18n.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en',
            );
        },
        {
            mutationKey: ['sendNowSchedulerByUuid', schedulerUuid],
            onSuccess: (res) => {
                pollJobStatus(res.jobId || '')
                    .then((data) => {
                        if (data?.status === SchedulerJobStatus.ERROR) {
                            throw new Error(data?.details?.error);
                        }
                    })
                    .catch((e) => {
                        throw e;
                    });
            },
            onError: (apiError: ApiError) => {
                showToastApiError({
                    key: 'toast-info-job-status',
                    title: t(
                        'features_scheduler_hooks.send_now_scheduler.failed_to_send_scheduled_delivery',
                    ),
                    apiError: apiError.error,
                });
            },
        },
    );

    const { data: scheduledDeliveryJobStatus } = useSendNowJobStatus(
        sendNowMutation.data?.jobId,
    );

    const isLoading = useMemo(
        () =>
            sendNowMutation.isLoading ||
            scheduledDeliveryJobStatus?.status === SchedulerJobStatus.STARTED,
        [scheduledDeliveryJobStatus?.status, sendNowMutation.isLoading],
    );

    return {
        ...sendNowMutation,
        isLoading,
    };
};
