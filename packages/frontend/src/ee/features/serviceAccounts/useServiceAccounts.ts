import { type ApiError, type ServiceAccount } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const CACHE_KEY = 'service-accounts';
type CreateServiceAccountResult = ServiceAccount & { token: string };

export const useServiceAccounts = () => {
    const { t } = useTranslation();

    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const listAccounts = useQuery<ServiceAccount[]>({
        queryKey: [CACHE_KEY],
        queryFn: () =>
            lightdashApi<ServiceAccount[]>({
                method: 'GET',
                url: '/service-accounts',
            }),
    });

    const createAccount = useMutation<
        CreateServiceAccountResult,
        ApiError,
        ServiceAccount
    >({
        mutationKey: [CACHE_KEY],
        mutationFn: (newAccount: ServiceAccount) => {
            return lightdashApi<CreateServiceAccountResult>({
                method: 'POST',
                url: '/service-accounts',
                body: JSON.stringify(newAccount),
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({
                title: t('features_service_accounts_hooks.service_account_created'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('features_service_accounts_hooks.failed_to_create_service_account'),
                apiError: error,
            });
        },
    });

    const deleteAccount = useMutation<undefined, ApiError, string>({
        mutationFn: async (uuid: string) => {
            await lightdashApi<undefined>({
                method: 'DELETE',
                url: `/service-accounts/${uuid}`,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({
                title: t('features_service_accounts_hooks.service_account_deleted'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('features_service_accounts_hooks.failed_to_delete_service_account'),
                apiError: error,
            });
        },
    });

    return useMemo(() => {
        return {
            listAccounts,
            createAccount,
            deleteAccount,
        };
    }, [listAccounts, createAccount, deleteAccount]);
};
