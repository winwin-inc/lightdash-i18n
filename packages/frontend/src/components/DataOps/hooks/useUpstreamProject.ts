import { type ApiError, type UpdateMetadata } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const updateProject = async (id: string, data: UpdateMetadata) =>
    lightdashApi<null>({
        url: `/projects/${id}/metadata`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateMutation = (id: string) => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<null, ApiError, UpdateMetadata>(
        (data) => updateProject(id, data),
        {
            mutationKey: ['project_update', id],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', id]);
                showToastSuccess({
                    title: t('components_data_pos.toast_success.title'),
                    subtitle: t('components_data_pos.toast_success.subtitle'),
                });
            },
            onError: (error) => {
                showToastError({
                    title: t('components_data_pos.toast_error.title'),
                    subtitle: error.error.message,
                });
            },
        },
    );
};
