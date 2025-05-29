import {
    SchedulerJobStatus,
    type ApiDownloadCsv,
    type ApiError,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { useTranslation } from 'react-i18next';

import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getCsvFileUrl } from '../../../api/csv';
import useToaster from '../../../hooks/toaster/useToaster';

const useExportToGoogleSheetStart = ({
    getGsheetLink,
}: {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
}) => {
    const { t } = useTranslation();
    const { showToastApiError, showToastInfo } = useToaster();

    return useMutation<ApiScheduledDownloadCsv | undefined, ApiError>(
        ['google-sheets-start'],
        getGsheetLink,
        {
            onMutate: () => {
                showToastInfo({
                    title: t('features_export.toast_info.title'),
                    subtitle: t('features_export.toast_info.subtitle'),
                    loading: true,
                    key: 'exporting-gsheets',
                    autoClose: false,
                });
            },
            onError: ({ error }) => {
                notifications.hide('exporting-gsheets');
                showToastApiError({
                    title: t('features_export.toast_error.upload'),
                    apiError: error,
                });
            },
        },
    );
};

export const useExportToGoogleSheet = ({
    getGsheetLink,
}: {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
}) => {
    const { t } = useTranslation();
    const { showToastApiError } = useToaster();

    const exportToGoogleSheetStartMutation = useExportToGoogleSheetStart({
        getGsheetLink,
    });
    const {
        data: startGoogleSheetExportData,
        reset: resetStartGoogleSheetExport,
    } = exportToGoogleSheetStartMutation;

    const exportToGoogleSheetQuery = useQuery<
        ApiDownloadCsv | undefined,
        ApiError
    >({
        queryKey: [`google-sheets`, startGoogleSheetExportData?.jobId],
        queryFn: () =>
            startGoogleSheetExportData
                ? getCsvFileUrl(startGoogleSheetExportData)
                : Promise.reject({
                      error: new Error(
                          t('features_export.tips.create_scheduler'),
                      ),
                  }),
        retry: (failureCount, { error }) => {
            if (failureCount === 5) {
                resetStartGoogleSheetExport();
                showToastApiError({
                    title: t('features_export.toast_error.export'),
                    apiError: error,
                });
                return false;
            }
            return true;
        },
        refetchInterval: (data) => {
            if (data?.url) return false;
            return 2000;
        },
        onSuccess: (data) => {
            if (data?.url && data.status === SchedulerJobStatus.COMPLETED) {
                window.open(data.url, '_blank');
                notifications.hide('exporting-gsheets');
            }
        },
        onError: () => {
            notifications.hide('exporting-gsheets');
        },
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        enabled: !!startGoogleSheetExportData,
    });

    return {
        startExporting: exportToGoogleSheetStartMutation.mutate,
        isExporting:
            !!exportToGoogleSheetStartMutation.data &&
            !exportToGoogleSheetQuery.data?.url,
    };
};
