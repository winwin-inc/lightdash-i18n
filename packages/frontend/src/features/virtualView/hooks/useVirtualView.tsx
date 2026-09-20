import {
    type ApiCreateVirtualView,
    type ApiError,
    type ApiSuccessEmpty,
    type CreateVirtualViewPayload,
    type UpdateVirtualViewPayload,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const createVirtualView = async ({
    projectUuid,
    name,
    sql,
    columns,
}: {
    projectUuid: string;
} & CreateVirtualViewPayload) =>
    lightdashApi<ApiCreateVirtualView['results']>({
        url: `/projects/${projectUuid}/sqlRunner/virtual-view`,
        method: 'POST',
        body: JSON.stringify({
            name,
            sql,
            columns,
        }),
    });

/**
 * Create a virtual view (a.k.a. custom explore) - users can query from them in the Explore view
 */
export const useCreateVirtualView = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    const { t } = useTranslation();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ApiCreateVirtualView['results'],
        ApiError,
        {
            projectUuid: string;
        } & CreateVirtualViewPayload
    >({
        mutationFn: createVirtualView,
        onSuccess: (data) => {
            showToastSuccess({
                title: t('features_virtual_view.create_success'),
                action: {
                    children: t('features_virtual_view.query_action'),
                    icon: IconArrowRight,
                    onClick: () => {
                        window.open(
                            `/projects/${projectUuid}/tables/${data.name}`,
                            '_blank',
                        );
                    },
                },
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('features_virtual_view.create_error'),
                apiError: error,
            });
        },
    });
};

const updateVirtualView = async ({
    exploreName,
    projectUuid,
    name,
    sql,
    columns,
}: {
    exploreName: string;
    projectUuid: string;
} & UpdateVirtualViewPayload) =>
    lightdashApi<ApiCreateVirtualView['results']>({
        url: `/projects/${projectUuid}/sqlRunner/virtual-view/${exploreName}`,
        method: 'PUT',
        body: JSON.stringify({
            name,
            sql,
            columns,
        }),
    });

export const useUpdateVirtualView = (projectUuid: string) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiCreateVirtualView['results'],
        ApiError,
        { projectUuid: string; exploreName: string } & UpdateVirtualViewPayload
    >({
        mutationFn: updateVirtualView,
        onSuccess: async ({ name }) => {
            await queryClient.invalidateQueries({
                queryKey: ['tables', projectUuid, 'filtered'],
            });
            await queryClient.invalidateQueries({
                queryKey: ['tables', name, projectUuid],
            });
            showToastSuccess({
                title: t('features_virtual_view.update_success'),
            });
        },
        onError: () => {
            showToastError({
                title: t('features_virtual_view.update_error'),
            });
        },
    });
};

const deleteVirtualView = async ({
    projectUuid,
    name,
}: {
    projectUuid: string;
    name: string;
}) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/sqlRunner/virtual-view/${name}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteVirtualView = (projectUuid: string) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { projectUuid: string; name: string }
    >({
        mutationFn: deleteVirtualView,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['tables', projectUuid, 'filtered'],
            });

            showToastSuccess({
                title: t('features_virtual_view.delete_success'),
            });

            void navigate(`/projects/${projectUuid}/tables`);
        },
        onError: () => {
            showToastError({
                title: t('features_virtual_view.delete_error'),
            });
        },
    });
};
