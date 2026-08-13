import {
    type ApiError,
    type CreateUserAttribute,
    type UserAttribute,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getUserAttributes = async () =>
    lightdashApi<UserAttribute[]>({
        url: `/org/attributes`,
        method: 'GET',
        body: undefined,
    });

export const useUserAttributes = () => {
    const setErrorResponse = useQueryError();
    return useQuery<UserAttribute[], ApiError>({
        queryKey: ['user_attributes'],
        queryFn: getUserAttributes,
        onError: (result) => setErrorResponse(result),
    });
};

const createUserAttributes = async (data: CreateUserAttribute) =>
    lightdashApi<null>({
        url: `/org/attributes`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateUserAtributesMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<null, ApiError, CreateUserAttribute>(
        createUserAttributes,
        {
            mutationKey: ['user_attributes'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_attributes']);
                showToastSuccess({
                    title: t('hooks_user_attributes.create_success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_user_attributes.create_error'),
                    apiError: error,
                });
            },
        },
    );
};

const updateUserAttributes = async (
    userAttributeUuid: string,
    data: CreateUserAttribute,
) =>
    lightdashApi<null>({
        url: `/org/attributes/${userAttributeUuid}`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateUserAtributesMutation = (userAttributeUuuid?: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<null, ApiError, CreateUserAttribute>(
        (data) => updateUserAttributes(userAttributeUuuid || '', data),

        {
            mutationKey: ['user_attributes'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_attributes']);
                showToastSuccess({
                    title: t('hooks_user_attributes.update_success'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('hooks_user_attributes.update_error'),
                    apiError: error,
                });
            },
        },
    );
};

const deleteUserAttributes = async (uuid: string) =>
    lightdashApi<null>({
        url: `/org/attributes/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useUserAttributesDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();
    return useMutation<null, ApiError, string>(deleteUserAttributes, {
        mutationKey: ['delete_user_attributes'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user_attributes']);
            showToastSuccess({
                title: t('hooks_user_attributes.delete_success'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('hooks_user_attributes.delete_error'),
                apiError: error,
            });
        },
    });
};
