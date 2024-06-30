import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const deleteScheduler = async (uuid: string) =>
    lightdashApi<null>({
        url: `/schedulers/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useSchedulersDeleteMutation = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<null, ApiError, string>(deleteScheduler, {
        mutationKey: ['delete_scheduler'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['chart_schedulers']);
            await queryClient.invalidateQueries(['dashboard_schedulers']);
            showToastSuccess({
                title: t('features_scheduler_hooks.delete_mutation.success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('features_scheduler_hooks.delete_mutation.error'),
                apiError: error,
            });
        },
    });
};
