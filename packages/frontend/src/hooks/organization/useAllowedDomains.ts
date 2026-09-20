import {
    type AllowedEmailDomains,
    type ApiError,
    type UpdateAllowedEmailDomains,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getAllowedEmailDomainsQuery = async () =>
    lightdashApi<AllowedEmailDomains>({
        url: `/org/allowedEmailDomains`,
        method: 'GET',
        body: undefined,
    });

const updateAllowedEmailDomainsQuery = async (
    data: UpdateAllowedEmailDomains,
) =>
    lightdashApi<AllowedEmailDomains>({
        url: `/org/allowedEmailDomains`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useAllowedEmailDomains = () =>
    useQuery<AllowedEmailDomains, ApiError>({
        queryKey: ['allowed_email_domains'],
        queryFn: getAllowedEmailDomainsQuery,
    });

export const useUpdateAllowedEmailDomains = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();
    return useMutation<
        AllowedEmailDomains,
        ApiError,
        UpdateAllowedEmailDomains
    >(updateAllowedEmailDomainsQuery, {
        mutationKey: ['allowed_email_domains_update'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['allowed_email_domains']);
            showToastSuccess({
                title: t('hooks_allowed_domains.update_success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_allowed_domains.update_error'),
                apiError: error,
            });
        },
    });
};
