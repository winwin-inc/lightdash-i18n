import { type ApiError, type UserCategoryList } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useProjectUuid } from './useProjectUuid';
import useQueryError from './useQueryError';

const getUserCategories = async (
    projectUuid: string,
    dashboardUuid?: string,
) => {
    const url = `/projects/${projectUuid}/dashboard-categories${
        dashboardUuid ? `?dashboardUuid=${dashboardUuid}` : ''
    }`;
    return lightdashApi<UserCategoryList>({
        url,
        method: 'GET',
        body: undefined,
    });
};

export const useUserCategories = (options?: {
    dashboardUuid?: string;
    useQueryOptions?: UseQueryOptions<UserCategoryList, ApiError>;
}) => {
    const projectUuid = useProjectUuid();
    const setErrorResponse = useQueryError();
    const { dashboardUuid, useQueryOptions } = options || {};

    return useQuery<UserCategoryList, ApiError>({
        queryKey: ['user-categories', projectUuid, dashboardUuid],
        queryFn: () => getUserCategories(projectUuid ?? '', dashboardUuid),
        retry: false,
        onError: (result) => {
            setErrorResponse(result);
        },
        ...useQueryOptions,
        // Merge enabled condition: require projectUuid AND respect external enabled option
        enabled: !!projectUuid && (useQueryOptions?.enabled ?? true),
    });
};
