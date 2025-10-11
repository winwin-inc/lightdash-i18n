import {
    type ApiCreatePreviewResults,
    type ApiError,
    type DbtProjectEnvironmentVariable,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../api';
import useActiveJob from '../providers/ActiveJob/useActiveJob';
import useToaster from './toaster/useToaster';

const createPreviewProject = async ({
    projectUuid,
    name,
    dbtConnectionOverrides,
    warehouseConnectionOverrides,
}: {
    projectUuid: string;
    name: string;
    dbtConnectionOverrides?: {
        branch?: string;
        environment?: DbtProjectEnvironmentVariable[];
        manifest?: string;
    };
    warehouseConnectionOverrides?: { schema?: string };
}) =>
    lightdashApi<ApiCreatePreviewResults>({
        url: `/projects/${projectUuid}/createPreview`,
        method: 'POST',
        body: JSON.stringify({
            name,
            copyContent: true, // TODO add this option to the UI
            dbtConnectionOverrides,
            warehouseConnectionOverrides,
        }),
    });

export const useCreatePreviewMutation = () => {
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<
        ApiCreatePreviewResults,
        ApiError,
        {
            projectUuid: string;
            name: string;
            dbtConnectionOverrides?: {
                branch?: string;
                environment?: DbtProjectEnvironmentVariable[];
                manifest?: string;
            };
            warehouseConnectionOverrides?: { schema?: string };
        }
    >((data) => createPreviewProject(data), {
        mutationKey: ['preview_project_create'],
        onSuccess: async ({ projectUuid, compileJobUuid }) => {
            await queryClient.invalidateQueries(['projects']);
            setActiveJobId(compileJobUuid);
            showToastSuccess({
                title: t('hooks_project_preview.preview'),
                action: {
                    children: t('hooks_project_preview.open'),
                    icon: IconArrowRight,
                    onClick: () => {
                        const url = `${window.origin}/projects/${projectUuid}/home`;
                        window.open(url, '_blank');
                    },
                },
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_project_preview.failed'),
                apiError: error,
            });
        },
    });
};
