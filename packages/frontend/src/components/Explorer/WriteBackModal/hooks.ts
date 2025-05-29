import {
    DbtProjectType,
    type AdditionalMetric,
    type ApiError,
    type CustomDimension,
    type PullRequestCreated,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';

const writeBackCustomDimensions = async (
    projectUuid: string,
    payload: CustomDimension[],
): Promise<PullRequestCreated> => {
    return lightdashApi<PullRequestCreated>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/custom-dimensions`,
        method: 'POST',
        body: JSON.stringify({
            customDimensions: payload,
        }),
    });
};

export const useWriteBackCustomDimensions = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<PullRequestCreated, ApiError, CustomDimension[]>(
        (data) => writeBackCustomDimensions(projectUuid, data),
        {
            mutationKey: ['custom_dimension_write_back', projectUuid],
            onSuccess: (pullRequest) => {
                window.open(pullRequest.prUrl, '_blank'); // always open in new tab by default

                showToastSuccess({
                    title: t(
                        'components_explorer_write_back_modal.tips_write_back_custom_dimension.write_back_success',
                    ),
                    action: {
                        children: t(
                            'components_explorer_write_back_modal.tips_write_back_custom_dimension.open_pr',
                        ),
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(pullRequest.prUrl, '_blank');
                        },
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'components_explorer_write_back_modal.tips_write_back_custom_dimension.failed_to_write_back',
                    ),
                    apiError: error,
                });
            },
        },
    );
};

const writeBackCustomMetrics = async (
    projectUuid: string,
    payload: AdditionalMetric[],
): Promise<PullRequestCreated> => {
    return lightdashApi<PullRequestCreated>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/custom-metrics`,
        method: 'POST',
        body: JSON.stringify({
            customMetrics: payload,
        }),
    });
};

export const useWriteBackCustomMetrics = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<PullRequestCreated, ApiError, AdditionalMetric[]>(
        (data) => writeBackCustomMetrics(projectUuid, data),
        {
            mutationKey: ['custom_metric_write_back', projectUuid],
            onSuccess: (pullRequest) => {
                window.open(pullRequest.prUrl, '_blank'); // always open in new tab by default

                showToastSuccess({
                    title: t(
                        'components_explorer_write_back_modal.tips_write_back_custom_metric.write_back_success',
                    ),
                    action: {
                        children: t(
                            'components_explorer_write_back_modal.tips_write_back_custom_metric.open_pr',
                        ),
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(pullRequest.prUrl, '_blank');
                        },
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'components_explorer_write_back_modal.tips_write_back_custom_metric.failed_to_write_back',
                    ),
                    apiError: error,
                });
            },
        },
    );
};

export const useIsGithubProject = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    return project?.dbtConnection.type === DbtProjectType.GITHUB;
};
