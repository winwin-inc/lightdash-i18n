import {
    type ApiColorPaletteResponse,
    type ApiColorPalettesResponse,
    type ApiCreatedColorPaletteResponse,
    type ApiError,
    type CreateColorPalette,
    type UpdateColorPalette,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const createColorPaletteApi = async (data: CreateColorPalette) =>
    lightdashApi<ApiCreatedColorPaletteResponse['results']>({
        url: `/org/color-palettes`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const getColorPalettesApi = async () =>
    lightdashApi<ApiColorPalettesResponse['results']>({
        url: `/org/color-palettes`,
        method: 'GET',
        body: undefined,
    });

const updateColorPaletteApi = async (
    colorPaletteUuid: string,
    data: UpdateColorPalette,
) =>
    lightdashApi<ApiColorPaletteResponse['results']>({
        url: `/org/color-palettes/${colorPaletteUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteColorPaletteApi = async (colorPaletteUuid: string) =>
    lightdashApi<null>({
        url: `/org/color-palettes/${colorPaletteUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const setActiveColorPaletteApi = async (colorPaletteUuid: string) =>
    lightdashApi<ApiColorPaletteResponse['results']>({
        url: `/org/color-palettes/${colorPaletteUuid}/active`,
        method: 'POST',
        body: undefined,
    });

export const useCreateColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    return useMutation<
        ApiCreatedColorPaletteResponse['results'],
        ApiError,
        CreateColorPalette
    >((data) => createColorPaletteApi(data), {
        mutationKey: ['create_color_palette'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['color_palettes']);
            showToastSuccess({
                title: t('hooks_organization_appearance.create.success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_organization_appearance.create.error'),
                apiError: error,
            });
        },
    });
};

export const useColorPalettes = () => {
    return useQuery<
        ApiColorPalettesResponse['results'],
        ApiError,
        ApiColorPalettesResponse['results']
    >({
        queryKey: ['color_palettes'],
        queryFn: getColorPalettesApi,
        select: (data) =>
            data.sort((a, b) => Number(b.isActive) - Number(a.isActive)),
    });
};

export const useUpdateColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    return useMutation<
        ApiColorPaletteResponse['results'],
        ApiError,
        UpdateColorPalette
    >((data) => updateColorPaletteApi(data.uuid, data), {
        mutationKey: ['update_color_palette'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['color_palettes']);
            showToastSuccess({
                title: t('hooks_organization_appearance.update.success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_organization_appearance.update.error'),
                apiError: error,
            });
        },
    });
};

export const useDeleteColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    return useMutation<null, ApiError, string>(
        (colorPaletteUuid) => deleteColorPaletteApi(colorPaletteUuid),
        {
            mutationKey: ['delete_color_palette'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['color_palettes']);
                showToastSuccess({
                    title: t('hooks_organization_appearance.delete.success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_organization_appearance.delete.error'),
                    apiError: error,
                });
            },
        },
    );
};

export const useSetActiveColorPalette = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    return useMutation<ApiColorPaletteResponse['results'], ApiError, string>(
        (colorPaletteUuid) => setActiveColorPaletteApi(colorPaletteUuid),
        {
            mutationKey: ['set_active_color_palette'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['color_palettes']);
                showToastSuccess({
                    title: t(
                        'hooks_organization_appearance.set_active.success',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_organization_appearance.set_active.error'),
                    apiError: error,
                });
            },
        },
    );
};
