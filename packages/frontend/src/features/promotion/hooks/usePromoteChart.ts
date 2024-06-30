import {
    type ApiError,
    type PromotionChanges,
    type SavedChart,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const promoteChart = async (chartUuid: string): Promise<SavedChart> => {
    return lightdashApi<SavedChart>({
        url: `/saved/${chartUuid}/promote`,
        method: 'POST',
        body: undefined,
    });
};

export const usePromoteMutation = () => {
    const { showToastSuccess, showToastError } = useToaster();
    const { t } = useTranslation();

    return useMutation<SavedChart, ApiError, string>(
        (data) => promoteChart(data),
        {
            mutationKey: ['promote_chart'],
            onSuccess: (data) => {
                showToastSuccess({
                    title: t('feature_promotion.toast_chart_success.promoted'),
                    action: {
                        children: 'Open chart',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                `/projects/${data.projectUuid}/saved/${data.uuid}`,
                                '_blank',
                            );
                        },
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: t(
                        'feature_promotion.toast_chart_error.promote_chart',
                    ),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const getPromoteChartDiff = async (
    chartUuid: string,
): Promise<PromotionChanges> => {
    return lightdashApi<PromotionChanges>({
        url: `/saved/${chartUuid}/promoteDiff`,
        method: 'GET',
        body: undefined,
    });
};

export const usePromoteChartDiffMutation = () => {
    const { showToastError } = useToaster();
    const { t } = useTranslation();

    return useMutation<PromotionChanges, ApiError, string>(
        (data) => getPromoteChartDiff(data),
        {
            mutationKey: ['promote_chart_diff'],
            onSuccess: (data) => {
                return data;
            },
            onError: (error) => {
                showToastError({
                    title: t(
                        'feature_promotion.toast_chart_error.diff_from_chart',
                    ),
                    subtitle: error.error.message,
                });
            },
        },
    );
};
