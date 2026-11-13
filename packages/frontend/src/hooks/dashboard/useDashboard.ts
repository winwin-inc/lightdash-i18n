import {
    formatDate,
    DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE,
    DASHBOARD_EXPORT_SIZE_LIMIT_MESSAGE,
    NO_CHARTS_TO_EXPORT_MESSAGE,
    type ApiError,
    type ApiJobScheduledResponse,
    type CreateDashboard,
    type CreateDashboardWithCharts,
    type Dashboard,
    type DashboardAvailableFilters,
    type DashboardTile,
    type ExportContentRequest,
    type ExportJobProgress,
    type SavedChartsInfoForDashboardAvailableFilters,
    type UpdateDashboard,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { lightdashApi } from '../../api';
import {
    JobPollTimeoutError,
    pollJobStatus,
} from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../toaster/useToaster';
import useQueryError from '../useQueryError';
import useDashboardStorage from './useDashboardStorage';

export const getDashboard = async (id: string) =>
    lightdashApi<Dashboard>({
        url: `/dashboards/${id}`,
        method: 'GET',
        body: undefined,
    });

const createDashboard = async (projectUuid: string, data: CreateDashboard) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const createDashboardWithCharts = async (
    projectUuid: string,
    data: CreateDashboardWithCharts,
) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards/with-charts`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const duplicateDashboard = async (
    projectUuid: string,
    dashboardUuid: string,
    data: { dashboardName: string; dashboardDesc: string },
): Promise<Dashboard> =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards?duplicateFrom=${dashboardUuid}`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateDashboard = async (id: string, data: UpdateDashboard) =>
    lightdashApi<Dashboard>({
        url: `/dashboards/${id}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteDashboard = async (id: string) =>
    lightdashApi<null>({
        url: `/dashboards/${id}`,
        method: 'DELETE',
        body: undefined,
    });

const postDashboardsAvailableFilters = async (
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
) =>
    lightdashApi<DashboardAvailableFilters>({
        url: `/dashboards/availableFilters`,
        method: 'POST',
        body: JSON.stringify(savedChartUuidsAndTileUuids),
    });

const postEmbedDashboardsAvailableFilters = async (
    projectUuid: string,
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
) =>
    lightdashApi<DashboardAvailableFilters>({
        url: `/embed/${projectUuid}/dashboard/availableFilters`,
        method: 'POST',
        body: JSON.stringify(savedChartUuidsAndTileUuids),
    });

const exportDashboard = async (
    id: string,
    gridWidth: number | undefined,
    queryFilters: string,
    selectedTabs: string[] | null,
) =>
    lightdashApi<string>({
        url: `/dashboards/${id}/export`,
        method: 'POST',
        body: JSON.stringify({ queryFilters, gridWidth, selectedTabs }),
    });

export const useDashboardsAvailableFilters = (
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
    projectUuid?: string,
    embedToken?: string,
) =>
    useQuery<DashboardAvailableFilters, ApiError>(
        ['dashboards', 'availableFilters', ...savedChartUuidsAndTileUuids],
        () =>
            embedToken && projectUuid
                ? postEmbedDashboardsAvailableFilters(
                      projectUuid,
                      savedChartUuidsAndTileUuids,
                  )
                : postDashboardsAvailableFilters(savedChartUuidsAndTileUuids),
        {
            enabled: savedChartUuidsAndTileUuids.length > 0,
        },
    );

export const useDashboardQuery = (
    id?: string,
    useQueryOptions?: UseQueryOptions<Dashboard, ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard, ApiError>({
        queryKey: ['saved_dashboard_query', id],
        queryFn: () => getDashboard(id || ''),
        enabled: !!id,
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

/**
 * Checks if the dashboard version is up to date and returns the latest dashboard if it is not
 * Helpful for refreshing the dashboard when the user wants to make changes to the dashboard
 * This is to avoid one user or multiple users overwriting each other's changes
 * @param dashboardUuid The dashboard uuid
 * @returns The latest dashboard or null if the dashboard is up to date
 */
export const useDashboardVersionRefresh = (dashboardUuid: string) => {
    const queryClient = useQueryClient();

    return useMutation<Dashboard | null, ApiError, Dashboard | undefined>({
        mutationKey: ['dashboard_version_refresh', dashboardUuid],
        mutationFn: async (currentDashboard) => {
            try {
                if (!currentDashboard) {
                    throw new Error('Current dashboard is undefined');
                }

                const latestDashboard = await getDashboard(dashboardUuid);

                const currentTime = new Date(
                    currentDashboard.updatedAt,
                ).getTime();
                const latestTime = new Date(
                    latestDashboard.updatedAt,
                ).getTime();

                const isUpToDate = latestTime <= currentTime;

                if (isUpToDate) {
                    return null;
                }

                queryClient.setQueryData(
                    ['saved_dashboard_query', dashboardUuid],
                    latestDashboard,
                );

                return latestDashboard;
            } catch (error) {
                console.warn('Failed to check dashboard timestamp:', error);
                return null;
            }
        },
    });
};

export const useExportDashboard = () => {
    const { showToastSuccess, showToastApiError, showToastInfo } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        string,
        ApiError,
        {
            dashboard: Dashboard;
            gridWidth: number | undefined;
            queryFilters: string;
            isPreview?: boolean;
            selectedTabs: string[] | null;
        }
    >(
        (data) =>
            exportDashboard(
                data.dashboard.uuid,
                data.gridWidth,
                data.queryFilters,
                data.selectedTabs,
            ),
        {
            mutationKey: ['export_dashboard'],
            onMutate: (data) => {
                showToastInfo({
                    key: 'dashboard_export_toast',
                    title: data.isPreview
                        ? t('hooks_dashboard.generate_preview_for', {
                              name: data.dashboard.name,
                          })
                        : t('hooks_dashboard.is_being_exported', {
                              name: data.dashboard.name,
                          }),
                    autoClose: false,
                    loading: true,
                });
            },
            onSuccess: async (url, data) => {
                if (url) {
                    if (!data.isPreview) window.open(url, '_blank');
                    showToastSuccess({
                        key: 'dashboard_export_toast',
                        title: data.isPreview
                            ? t('hooks_dashboard.success')
                            : t('hooks_dashboard.success_export', {
                                  name: data.dashboard.name,
                              }),
                    });
                }
            },
            onError: ({ error }, data) => {
                showToastApiError({
                    key: 'dashboard_export_toast',
                    title: data.isPreview
                        ? t('hooks_dashboard.failed_preview', {
                              name: data.dashboard.name,
                          })
                        : t('hooks_dashboard.failed_export', {
                              name: data.dashboard.name,
                          }),
                    apiError: error,
                });
            },
        },
    );
};

/**
 * 导出产物可能是单个文件（xlsx/csv）或多文件 zip，后端在 job details 里
 * 用 fileType 标出真实类型；下载链接的 download 属性必须带上扩展名，
 * 否则保存下来的文件名取决于浏览器推断。
 */
const getExportDownloadFileName = (
    dashboardName: string,
    details: Record<string, unknown> | null | undefined,
    fallbackExtension: 'csv' | 'xlsx',
): string => {
    const fileType =
        typeof details?.fileType === 'string' ? details.fileType : undefined;
    const extension =
        fileType === 'zip' || fileType === 'csv' || fileType === 'xlsx'
            ? fileType
            : fallbackExtension;
    return `${dashboardName}-${formatDate(Date.now())}.${extension}`;
};

const exportDashboardContent = async (
    id: string,
    body: ExportContentRequest,
) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/dashboards/${id}/exports`,
        method: 'POST',
        body: JSON.stringify(body),
    });

/**
 * 看板导出可能比通用任务慢（每个 Tab 每张图都要跑查询），
 * 轮询时长放宽到 35 分钟（通用任务仍是 20 分钟）。
 * 注意 pollJobStatus 的 deadlineMs 是绝对时间戳，不是时长。
 */
const DASHBOARD_EXPORT_POLL_TIMEOUT_MS = 35 * 60 * 1000;

/** 把轮询/任务错误换成可读文案；未识别的错误原样透出 */
const getDashboardExportErrorSubtitle = (
    error: Error,
    t: (key: string, options?: Record<string, unknown>) => string,
): string => {
    if (error instanceof JobPollTimeoutError) {
        return t('hooks_dashboard.export_timeout');
    }
    // 后端行数上限错误带 "(N rows, limit M)" 后缀，解析成数字给本地化文案
    if (error.message.includes(DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE)) {
        const match = error.message.match(/\((\d+) rows, limit (\d+)\)/);
        if (match) {
            return t('hooks_dashboard.export_row_limit_exceeded', {
                rows: Number(match[1]).toLocaleString(),
                limit: Number(match[2]).toLocaleString(),
            });
        }
    }
    // 产物体积超限：后端带 "(N MB, limit M MB)" 后缀
    if (error.message.includes(DASHBOARD_EXPORT_SIZE_LIMIT_MESSAGE)) {
        const match = error.message.match(/\((\d+) MB, limit (\d+) MB\)/);
        if (match) {
            return t('hooks_dashboard.export_size_limit_exceeded', {
                size: match[1],
                limit: match[2],
            });
        }
    }
    // 后端「所选 Tab 下没有可导出图表」是英文硬编码错误，换成可读文案
    if (error.message.includes(NO_CHARTS_TO_EXPORT_MESSAGE)) {
        return t('hooks_dashboard.no_charts_to_export');
    }
    return error.message;
};

export const useExportDashboardContent = () => {
    const {
        showToastSuccess,
        showToastError,
        showToastApiError,
        showToastInfo,
    } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        {
            dashboard: Dashboard;
            request: ExportContentRequest;
        }
    >(
        (data) => exportDashboardContent(data.dashboard.uuid, data.request),
        {
            mutationKey: ['export_dashboard_content'],
            onMutate: (data) => {
                showToastInfo({
                    key: 'dashboard_export_toast',
                    title: t('hooks_dashboard.is_being_exported', {
                        name: data.dashboard.name,
                    }),
                    autoClose: false,
                    loading: true,
                });
            },
            onSuccess: async (job, data) => {
                // Wait until validation is complete；跑动中用 details.progress 刷新同一个 toast
                pollJobStatus(job.jobId, {
                    deadlineMs: Date.now() + DASHBOARD_EXPORT_POLL_TIMEOUT_MS,
                    onProgress: (details) => {
                        const progress = details?.progress as
                            | ExportJobProgress
                            | undefined;
                        if (
                            !progress ||
                            typeof progress.done !== 'number' ||
                            typeof progress.total !== 'number'
                        )
                            return;
                        const subtitleParts = [
                            t('hooks_dashboard.export_progress', {
                                done: progress.done,
                                total: progress.total,
                            }),
                        ];
                        if (progress.currentTabName) {
                            subtitleParts.push(
                                t('hooks_dashboard.export_progress_tab', {
                                    name: progress.currentTabName,
                                }),
                            );
                        }
                        if (progress.currentChartName) {
                            subtitleParts.push(
                                t('hooks_dashboard.export_progress_chart', {
                                    name: progress.currentChartName,
                                }),
                            );
                        }
                        showToastInfo({
                            key: 'dashboard_export_toast',
                            title: t('hooks_dashboard.is_being_exported', {
                                name: data.dashboard.name,
                            }),
                            subtitle: subtitleParts.join(' · '),
                            loading: true,
                            autoClose: false,
                        });
                    },
                })
                    .then(async (details) => {
                        if (details?.url) {
                            const link = document.createElement('a');
                            link.href = details.url;
                            link.setAttribute(
                                'download',
                                getExportDownloadFileName(
                                    data.dashboard.name,
                                    details,
                                    'xlsx',
                                ),
                            );
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                            showToastSuccess({
                                key: 'dashboard_export_toast',
                                title: t('hooks_dashboard.success_export', {
                                    name: data.dashboard.name,
                                }),
                                // 任一图触顶时产物不完整，成功提示里补一句
                                subtitle:
                                    details.truncated === true
                                        ? t('hooks_dashboard.export_truncated')
                                        : undefined,
                            });
                        } else {
                            showToastError({
                                key: 'dashboard_export_toast',
                                title: t('hooks_dashboard.missing_file_url', {
                                    name: data.dashboard.name,
                                }),
                                subtitle: t(
                                    'hooks_dashboard.something_went_wrong',
                                ),
                            });
                        }
                    })
                    .catch((error: Error) => {
                        showToastError({
                            key: 'dashboard_export_toast',
                            title: t('hooks_dashboard.failed_export', {
                                name: data.dashboard.name,
                            }),
                            subtitle: getDashboardExportErrorSubtitle(
                                error,
                                t,
                            ),
                        });
                    });
            },
            onError: ({ error }, data) => {
                showToastApiError({
                    key: 'dashboard_export_toast',
                    title: t('hooks_dashboard.failed_export', {
                        name: data.dashboard.name,
                    }),
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateDashboard = (
    id?: string,
    showRedirectButton: boolean = false,
) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { clearDashboardStorage } = useDashboardStorage();
    const { t } = useTranslation();

    return useMutation<Dashboard, ApiError, UpdateDashboard>(
        (data) => {
            if (id === undefined) {
                throw new Error('Dashboard id is undefined');
            }

            return updateDashboard(id, data);
        },
        {
            mutationKey: ['dashboard_update'],
            onSuccess: async (_, variables) => {
                clearDashboardStorage();
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);

                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.resetQueries(['saved_dashboard_query', id]);
                await queryClient.invalidateQueries(['content']);
                const onlyUpdatedName: boolean =
                    Object.keys(variables).length === 1 &&
                    Object.keys(variables).includes('name');
                showToastSuccess({
                    title: t('hooks_dashboard.success_update', {
                        name: onlyUpdatedName ? 'name ' : '',
                    }),
                    action: showRedirectButton
                        ? {
                              children: t('hooks_dashboard.open_dashboard'),
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${projectUuid}/dashboards/${id}`,
                                  ),
                          }
                        : undefined,
                    autoClose: 10000,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_dashboard.failed_to_update'),
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateMutation = (
    projectUuid: string | undefined,
    showRedirectButton: boolean = false,
    { showToastOnSuccess = true }: { showToastOnSuccess?: boolean } = {},
) => {
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    return useMutation<Dashboard, ApiError, CreateDashboard>(
        (data) =>
            projectUuid ? createDashboard(projectUuid, data) : Promise.reject(),
        {
            mutationKey: ['dashboard_create', projectUuid],
            onSuccess: async (result) => {
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                if (showToastOnSuccess) {
                    showToastSuccess({
                        title: t('hooks_dashboard.success_create'),
                        action: showRedirectButton
                            ? {
                                  children: t('hooks_dashboard.open_dashboard'),
                                  icon: IconArrowRight,
                                  onClick: () =>
                                      navigate(
                                          `/projects/${projectUuid}/dashboards/${result.uuid}`,
                                      ),
                              }
                            : undefined,
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_dashboard.failed_to_create'),
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateDashboardWithChartsMutation = (
    projectUuid: string | undefined,
    { showToastOnSuccess = true }: { showToastOnSuccess?: boolean } = {},
) => {
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    return useMutation<Dashboard, ApiError, CreateDashboardWithCharts>(
        (data) =>
            projectUuid
                ? createDashboardWithCharts(projectUuid, data)
                : Promise.reject(),
        {
            mutationKey: ['dashboard_create_with_charts', projectUuid],
            onSuccess: async (result) => {
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                if (showToastOnSuccess) {
                    showToastSuccess({
                        title: t('hooks_dashboard.success_create'),
                        action: {
                            children: t('hooks_dashboard.open_dashboard'),
                            onClick: () =>
                                navigate(
                                    `/projects/${projectUuid}/dashboards/${result.uuid}`,
                                ),
                        },
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_dashboard.failed_to_create'),
                    apiError: error,
                });
            },
        },
    );
};

type DuplicateDashboardMutationOptions = {
    showRedirectButton: boolean;
};

export const useDuplicateDashboardMutation = (
    options?: DuplicateDashboardMutationOptions,
) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        Dashboard,
        ApiError,
        Pick<Dashboard, 'uuid' | 'name' | 'description'>
    >(
        ({ uuid, name, description }) =>
            projectUuid
                ? duplicateDashboard(projectUuid, uuid, {
                      dashboardName: name,
                      dashboardDesc: description ?? '',
                  })
                : Promise.reject(),
        {
            mutationKey: ['dashboard_create', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);
                showToastSuccess({
                    title: t('hooks_dashboard.success_duplicate'),
                    action: options?.showRedirectButton
                        ? {
                              children: t('hooks_dashboard.open_dashboard'),
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${projectUuid}/dashboards/${data.uuid}`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_dashboard.failed_to_duplicate'),
                    apiError: error,
                });
            },
        },
    );
};

export const useDashboardDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<null, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            await queryClient.invalidateQueries(['dashboards']);
            await queryClient.invalidateQueries(['space']);

            await queryClient.invalidateQueries([
                'dashboards-containing-chart',
            ]);
            await queryClient.invalidateQueries(['pinned_items']);
            await queryClient.invalidateQueries([
                'most-popular-and-recently-updated',
            ]);
            await queryClient.invalidateQueries(['content']);
            showToastSuccess({
                title: t('hooks_dashboard.success_delete'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_dashboard.failed_to_delete'),
                apiError: error,
            });
        },
    });
};

export const appendNewTilesToBottom = <T extends Pick<DashboardTile, 'y'>>(
    existingTiles: T[] | undefined,
    newTiles: T[],
): T[] => {
    const tilesY =
        existingTiles &&
        existingTiles.map(function (tile) {
            return tile.y;
        });
    const maxY =
        tilesY && tilesY.length > 0 ? Math.max.apply(Math, tilesY) : -1;
    const reorderedTiles = newTiles.map((tile) => ({
        ...tile,
        y: maxY + 1,
    })); //add to the bottom

    return [...(existingTiles ?? []), ...reorderedTiles];
};
