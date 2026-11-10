import {
    type ApiError,
    type Dashboard,
    type PromotionChanges,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const promoteDashboard = async ({
    dashboardUuid,
    confirmConflicts,
    syncDashboardName,
}: {
    dashboardUuid: string;
    confirmConflicts: boolean;
    syncDashboardName: boolean;
}): Promise<Dashboard> => {
    const params = new URLSearchParams({
        confirmConflicts: String(confirmConflicts),
        syncDashboardName: String(syncDashboardName),
    });
    return lightdashApi<Dashboard>({
        url: `/dashboards/${dashboardUuid}/promote?${params.toString()}`,
        method: 'POST',
        body: undefined,
    });
};

export const usePromoteDashboardMutation = () => {
    const { t } = useTranslation();
    const { showToastSuccess, showToastError } = useToaster();

    return useMutation<
        Dashboard,
        ApiError,
        {
            dashboardUuid: string;
            confirmConflicts: boolean;
            syncDashboardName: boolean;
        }
    >((data) => promoteDashboard(data), {
            mutationKey: ['promote_dashboard'],
            onSuccess: (data) => {
                showToastSuccess({
                    title: t(
                        'feature_promotion.toast_dashboard_success.promoted',
                    ),
                    action: {
                        children: t('hooks_dashboard.open_dashboard'),
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                `/projects/${data.projectUuid}/dashboards/${data.uuid}`,
                                '_blank',
                            );
                        },
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: t(
                        'feature_promotion.toast_dashboard_error.promote_dashboard',
                    ),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const getPromoteDashboardDiff = async (
    chartUuid: string,
): Promise<PromotionChanges> => {
    return lightdashApi<PromotionChanges>({
        url: `/dashboards/${chartUuid}/promoteDiff`,
        method: 'GET',
        body: undefined,
    });
};

export const usePromoteDashboardDiffMutation = () => {
    const { showToastError } = useToaster();
    const { t } = useTranslation();

    return useMutation<PromotionChanges, ApiError, string>(
        (data) => getPromoteDashboardDiff(data),
        {
            mutationKey: ['promote_dashboard_diff'],
            onSuccess: (data) => {
                return data;
            },
            onError: (error) => {
                showToastError({
                    title: t(
                        'feature_promotion.toast_dashboard_error.diff_from_dashboard',
                    ),
                    subtitle: error.error.message,
                });
            },
        },
    );
};
