import { type ApiError, type EmailStatusExpiring } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const getEmailStatusQuery = async () => {
    return lightdashApi<EmailStatusExpiring>({
        url: `/user/me/email/status`,
        method: 'GET',
        body: undefined,
    });
};

const sendOneTimePasscodeQuery = async () => {
    return lightdashApi<EmailStatusExpiring>({
        url: `/user/me/email/otp`,
        method: 'PUT',
        body: undefined,
    });
};

const verifyOTPQuery = async (code: string) => {
    return lightdashApi<EmailStatusExpiring>({
        url: `/user/me/email/status?passcode=${code}`,
        method: 'GET',
        body: undefined,
    });
};

export const useEmailStatus = (enabled: boolean) =>
    useQuery<EmailStatusExpiring, ApiError>({
        queryKey: ['email_status'],
        queryFn: () => getEmailStatusQuery(),
        enabled,
    });

export const useOneTimePassword = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<EmailStatusExpiring, ApiError>(
        () => sendOneTimePasscodeQuery(),
        {
            mutationKey: ['send_verification_email'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['email_status']);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_email_verification.not_send'),
                    apiError: error,
                });
            },
        },
    );
};

export const useVerifyEmail = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const { t } = useTranslation();

    return useMutation<EmailStatusExpiring, ApiError, string>(
        (code) => verifyOTPQuery(code),
        {
            mutationKey: ['verify_one_time_password'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['email_status']);

                if (data.isVerified)
                    showToastSuccess({
                        title: t('hooks_email_verification.success'),
                    });
            },
        },
    );
};
