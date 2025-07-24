import {
    type ApiCreateScimServiceAccountRequest,
    type ApiCreateServiceAccountResponse,
    type ApiError,
    type ServiceAccount,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import useQueryError from '../../../../hooks/useQueryError';

// gets users access tokens
const getScimToken = async () =>
    lightdashApi<ServiceAccount[]>({
        url: `/scim/organization-access-tokens`,
        method: 'GET',
        body: undefined,
    });

const createScimToken = async (data: ApiCreateScimServiceAccountRequest) =>
    lightdashApi<ApiCreateServiceAccountResponse>({
        url: `/scim/organization-access-tokens`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteScimToken = async (tokenUuid: string) =>
    lightdashApi<null>({
        url: `/scim/organization-access-tokens/${tokenUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useScimTokenList = (
    useQueryOptions?: UseQueryOptions<ServiceAccount[], ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<ServiceAccount[], ApiError>({
        queryKey: ['scim_access_tokens'],
        queryFn: () => getScimToken(),
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

export const useCreateScimToken = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiCreateServiceAccountResponse,
        ApiError,
        ApiCreateScimServiceAccountRequest
    >((data) => createScimToken(data), {
        mutationKey: ['create_scim_access_token'],
        retry: 3,
        onSuccess: async () => {
            await queryClient.invalidateQueries(['scim_access_tokens']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('ai_scim_hooks.create_scim_access_token.error'),
                apiError: error,
            });
        },
    });
};

export const useDeleteScimToken = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(deleteScimToken, {
        mutationKey: ['delete_scim_access_token'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['scim_access_tokens']);
            showToastSuccess({
                title: t('ai_scim_hooks.delete_scim_access_token.success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('ai_scim_hooks.delete_scim_access_token.error'),
                apiError: error,
            });
        },
    });
};
