import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateDashboardPinning = async (data: { uuid: string }) =>
    lightdashApi<TogglePinnedItemInfo>({
        url: `/dashboards/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useDashboardPinningMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<TogglePinnedItemInfo, ApiError, { uuid: string }>(
        updateDashboardPinning,
        {
            mutationKey: ['dashboard_pinning_update'],
            onSuccess: async (dashboard, variables) => {
                await queryClient.invalidateQueries([
                    'saved_dashboard_query',
                    variables.uuid,
                ]);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'space',
                    dashboard.projectUuid,
                    dashboard.spaceUuid,
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);

                if (dashboard.pinnedListUuid) {
                    showToastSuccess({
                        title: t(
                            'hooks_pinning.toast_dashboard_pinned.success.pinned',
                        ),
                    });
                } else {
                    showToastSuccess({
                        title: t(
                            'hooks_pinning.toast_dashboard_pinned.success.unpinned',
                        ),
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_pinning.toast_dashboard_pinned.error'),
                    apiError: error,
                });
            },
        },
    );
};
