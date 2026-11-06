import {
    type ApiError,
    type ApiImportAppCodeResponse,
    type ImportAppCodeRequestBody,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type ImportAppCodeParams = {
    projectUuid: string;
    body: ImportAppCodeRequestBody;
};

const importAppCode = async ({
    projectUuid,
    body,
}: ImportAppCodeParams): Promise<ApiImportAppCodeResponse['results']> =>
    lightdashApi<ApiImportAppCodeResponse['results']>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/upload`,
        body: JSON.stringify(body),
    });

export const useImportAppCode = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiImportAppCodeResponse['results'],
        ApiError,
        ImportAppCodeParams
    >({
        mutationFn: importAppCode,
        onSuccess: (result, variables) => {
            void queryClient.invalidateQueries({ queryKey: ['content'] });
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
            void queryClient.invalidateQueries({
                queryKey: ['app', variables.projectUuid, result.appUuid],
            });
            showToastSuccess({
                title:
                    result.action === 'unchanged'
                        ? t('features_apps_upload.toast_unchanged')
                        : result.action === 'append'
                          ? t('features_apps_upload.toast_append')
                          : t('features_apps_upload.toast_created'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('features_apps_upload.toast_failed'),
                apiError: error,
            });
        },
    });
};
