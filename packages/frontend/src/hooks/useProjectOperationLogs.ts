import {
    type ApiError,
    type ProjectOperationLogList,
    type ProjectOperationLogListItem,
    type ProjectOperationLogPurgeBody,
    type ProjectOperationLogPurgeResult,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

export type ProjectOperationLogFilters = {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
    action?: string;
    actorEmail?: string;
    resourceType?: string;
    q?: string;
};

const buildQuery = (filters: ProjectOperationLogFilters) => {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.action) params.set('action', filters.action);
    if (filters.actorEmail) params.set('actorEmail', filters.actorEmail);
    if (filters.resourceType) params.set('resourceType', filters.resourceType);
    if (filters.q) params.set('q', filters.q);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
};

const listOperationLogs = async (
    projectUuid: string,
    filters: ProjectOperationLogFilters,
) =>
    lightdashApi<ProjectOperationLogList>({
        url: `/projects/${projectUuid}/operation-logs${buildQuery(filters)}`,
        method: 'GET',
        body: undefined,
    });

const getOperationLog = async (
    projectUuid: string,
    operationLogUuid: string,
) =>
    lightdashApi<ProjectOperationLogListItem>({
        url: `/projects/${projectUuid}/operation-logs/${operationLogUuid}`,
        method: 'GET',
        body: undefined,
    });

const purgeOperationLogs = async ({
    projectUuid,
    body,
}: {
    projectUuid: string;
    body: ProjectOperationLogPurgeBody;
}) =>
    lightdashApi<ProjectOperationLogPurgeResult>({
        url: `/projects/${projectUuid}/operation-logs`,
        method: 'DELETE',
        body: JSON.stringify(body),
    });

export const useProjectOperationLogs = (
    projectUuid: string | undefined,
    filters: ProjectOperationLogFilters,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<ProjectOperationLogList, ApiError>({
        queryKey: ['project_operation_logs', projectUuid, filters],
        queryFn: () => {
            if (!projectUuid) {
                throw new Error('projectUuid is required');
            }
            return listOperationLogs(projectUuid, filters);
        },
        enabled: !!projectUuid,
        keepPreviousData: true,
        onError: (result) => setErrorResponse(result),
    });
};

export const useProjectOperationLog = (
    projectUuid: string | undefined,
    operationLogUuid: string | undefined,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<ProjectOperationLogListItem, ApiError>({
        queryKey: [
            'project_operation_log',
            projectUuid,
            operationLogUuid,
        ],
        queryFn: () => {
            if (!projectUuid || !operationLogUuid) {
                throw new Error('projectUuid and operationLogUuid are required');
            }
            return getOperationLog(projectUuid, operationLogUuid);
        },
        enabled: !!projectUuid && !!operationLogUuid,
        onError: (result) => setErrorResponse(result),
    });
};

export const usePurgeProjectOperationLogs = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return useMutation<
        ProjectOperationLogPurgeResult,
        ApiError,
        ProjectOperationLogPurgeBody
    >(
        (body) => {
            if (!projectUuid) {
                throw new Error('projectUuid is required');
            }
            return purgeOperationLogs({ projectUuid, body });
        },
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'project_operation_logs',
                    projectUuid,
                ]);
            },
        },
    );
};
