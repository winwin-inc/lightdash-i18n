import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useProjectUuid } from './useProjectUuid';
import useQueryError from './useQueryError';

const getExplore = async (
    projectUuid: string,
    exploreId: string,
    dashboardUuid?: string,
) => {
    try {
        const url = `/projects/${projectUuid}/explores/${exploreId}${
            dashboardUuid ? `?dashboardUuid=${dashboardUuid}` : ''
        }`;
        return await lightdashApi<ApiExploreResults>({
            url,
            method: 'GET',
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const useExplore = (
    activeTableName: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
    dashboardUuid?: string,
) => {
    const projectUuid = useProjectUuid();
    const setErrorResponse = useQueryError();

    const queryKey = ['tables', activeTableName, projectUuid, dashboardUuid];
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () =>
            getExplore(projectUuid!, activeTableName || '', dashboardUuid),
        enabled: !!activeTableName && !!projectUuid,
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...useQueryOptions,
    });
};
