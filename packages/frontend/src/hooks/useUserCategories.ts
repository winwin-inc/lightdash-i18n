import { type ApiError, type UserCategoryList } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useProjectUuid } from './useProjectUuid';
import useQueryError from './useQueryError';

const getUserCategories = async (projectUuid: string) =>
    lightdashApi<UserCategoryList>({
        url: `/projects/${projectUuid}/dashboard-categories`,
        method: 'GET',
        body: undefined,
    });

export const useUserCategories = (
    useQueryOptions?: UseQueryOptions<UserCategoryList, ApiError>,
) => {
    const projectUuid = useProjectUuid();
    const setErrorResponse = useQueryError();

    return useQuery<UserCategoryList, ApiError>({
        queryKey: ['user-categories', projectUuid],
        queryFn: () => getUserCategories(projectUuid ?? ''),
        retry: false,
        onError: (result) => {
            setErrorResponse(result);
        },
        ...useQueryOptions,
        // Merge enabled condition: require projectUuid AND respect external enabled option
        enabled: !!projectUuid && (useQueryOptions?.enabled ?? true),
    });
};
