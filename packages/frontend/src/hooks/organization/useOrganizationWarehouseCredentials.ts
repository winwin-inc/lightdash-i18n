import {
    type ApiError,
    type CreateOrganizationWarehouseCredentials,
    type OrganizationWarehouseCredentials,
    type UpdateOrganizationWarehouseCredentials,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getOrganizationWarehouseCredentials = async () =>
    lightdashApi<OrganizationWarehouseCredentials[]>({
        url: `/org/warehouse-credentials`,
        method: 'GET',
        body: undefined,
    });

const createOrganizationWarehouseCredentials = async (
    data: CreateOrganizationWarehouseCredentials,
) =>
    lightdashApi<OrganizationWarehouseCredentials>({
        url: `/org/warehouse-credentials`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateOrganizationWarehouseCredentials = async ({
    uuid,
    data,
}: {
    uuid: string;
    data: UpdateOrganizationWarehouseCredentials;
}) =>
    lightdashApi<OrganizationWarehouseCredentials>({
        url: `/org/warehouse-credentials/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteOrganizationWarehouseCredentials = async (uuid: string) =>
    lightdashApi<undefined>({
        url: `/org/warehouse-credentials/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOrganizationWarehouseCredentials = (
    useQueryOptions?: UseQueryOptions<
        OrganizationWarehouseCredentials[],
        ApiError
    >,
) =>
    useQuery<OrganizationWarehouseCredentials[], ApiError>({
        queryKey: ['organization-warehouse-credentials'],
        queryFn: getOrganizationWarehouseCredentials,
        ...useQueryOptions,
    });

export const useCreateOrganizationWarehouseCredentials = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();
    return useMutation<
        OrganizationWarehouseCredentials,
        ApiError,
        CreateOrganizationWarehouseCredentials
    >(createOrganizationWarehouseCredentials, {
        mutationKey: ['organization-warehouse-credentials', 'create'],
        onSuccess: async () => {
            await queryClient.refetchQueries({
                queryKey: ['organization-warehouse-credentials'],
            });
            showToastSuccess({
                title: t('hooks_org_warehouse_credentials.create_success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_org_warehouse_credentials.create_error'),
                apiError: error,
            });
        },
    });
};

export const useUpdateOrganizationWarehouseCredentials = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();
    return useMutation<
        OrganizationWarehouseCredentials,
        ApiError,
        { uuid: string; data: UpdateOrganizationWarehouseCredentials }
    >(updateOrganizationWarehouseCredentials, {
        mutationKey: ['organization-warehouse-credentials', 'update'],
        onSuccess: async () => {
            await queryClient.refetchQueries({
                queryKey: ['organization-warehouse-credentials'],
            });
            showToastSuccess({
                title: t('hooks_org_warehouse_credentials.update_success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_org_warehouse_credentials.update_error'),
                apiError: error,
            });
        },
    });
};

export const useDeleteOrganizationWarehouseCredentials = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();
    return useMutation<undefined, ApiError, string>(
        deleteOrganizationWarehouseCredentials,
        {
            mutationKey: ['organization-warehouse-credentials', 'delete'],
            onSuccess: async () => {
                await queryClient.invalidateQueries({
                    queryKey: ['organization-warehouse-credentials'],
                });
                showToastSuccess({
                    title: t(
                        'hooks_org_warehouse_credentials.delete_success',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_org_warehouse_credentials.delete_error'),
                    apiError: error,
                });
            },
        },
    );
};
