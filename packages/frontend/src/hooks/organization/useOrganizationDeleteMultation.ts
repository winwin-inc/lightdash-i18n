import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const deleteDashboard = async (id: string) =>
    lightdashApi<null>({
        url: `/org/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteOrganizationMutation = () => {
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();
    return useMutation<null, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            window.location.href = '/register';
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_organization_delete.error'),
                apiError: error,
            });
        },
    });
};
