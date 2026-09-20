import {
    type ApiError,
    type CreateInviteLink,
    type InviteLink,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const createInviteQuery = async (
    data: CreateInviteLink,
): Promise<InviteLink> => {
    const response = await lightdashApi<InviteLink>({
        url: `/invite-links`,
        method: 'POST',
        body: JSON.stringify(data),
    });
    return {
        ...response,
        expiresAt: new Date(response.expiresAt),
    };
};

const createInviteWith3DayExpiryQuery = async (
    createInvite: Omit<CreateInviteLink, 'expiresAt'>,
): Promise<InviteLink> => {
    const dateIn3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const response = await createInviteQuery({
        ...createInvite,
        expiresAt: dateIn3Days,
    });
    return response;
};

const inviteLinkQuery = async (inviteCode: string) =>
    lightdashApi<InviteLink>({
        url: `/invite-links/${inviteCode}`,
        method: 'GET',
        body: undefined,
    });

export const useInviteLink = (inviteCode: string | undefined) =>
    useQuery<InviteLink, ApiError>({
        queryKey: ['invite_link', inviteCode],
        queryFn: () => inviteLinkQuery(inviteCode!),
        enabled: inviteCode !== undefined,
    });

export const useCreateInviteLinkMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { t } = useTranslation();
    return useMutation<
        InviteLink,
        ApiError,
        Omit<CreateInviteLink, 'expiresAt'>
    >(createInviteWith3DayExpiryQuery, {
        mutationKey: ['invite_link'],
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_invite_link.create_error'),
                apiError: error,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(['onboarding-status']);
            await queryClient.refetchQueries(['organization_users']);
            showToastSuccess({
                title: t('hooks_invite_link.create_success'),
            });
        },
    });
};
