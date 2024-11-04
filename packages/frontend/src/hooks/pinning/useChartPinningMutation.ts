import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateChartPinning = async (data: { uuid: string }) =>
    lightdashApi<TogglePinnedItemInfo>({
        url: `/saved/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useChartPinningMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<TogglePinnedItemInfo, ApiError, { uuid: string }>(
        updateChartPinning,
        {
            mutationKey: ['chart_pinning_update'],
            onSuccess: async (savedChart, variables) => {
                await queryClient.invalidateQueries([
                    'saved_query',
                    variables.uuid,
                ]);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries([
                    'space',
                    savedChart.projectUuid,
                    savedChart.spaceUuid,
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);
                if (savedChart.isPinned) {
                    showToastSuccess({
                        title: t(
                            'hooks_pinning.toast_chart_pinned.success.pinned',
                        ),
                    });
                } else {
                    showToastSuccess({
                        title: t(
                            'hooks_pinning.toast_chart_pinned.success.unpinned',
                        ),
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_pinning.toast_chart_pinned.error'),
                    apiError: error,
                });
            },
        },
    );
};
