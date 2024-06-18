import { getPasswordSchema } from '@lightdash/common';
import { Button, Flex, PasswordInput, Stack } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import useToaster from '../../../hooks/toaster/useToaster';
import {
    useUserHasPassword,
    useUserUpdatePasswordMutation,
} from '../../../hooks/user/usePassword';
import PasswordTextInput from '../../PasswordTextInput';

const passwordSchema = getPasswordSchema();

const validationSchema = (hasCurrentPassword: boolean) => {
    return hasCurrentPassword
        ? z.object({
              // we check validity of current password on the server
              currentPassword: z.string().nonempty(),
              newPassword: passwordSchema,
          })
        : z.object({
              newPassword: passwordSchema,
          });
};

const PasswordPanel: FC = () => {
    const { data: hasPassword } = useUserHasPassword();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    const form = useForm({
        initialValues: {
            currentPassword: '',
            newPassword: '',
        },
        validate: zodResolver(validationSchema(!!hasPassword)),
    });

    const { isLoading: isUpdatingUserPassword, mutate: updateUserPassword } =
        useUserUpdatePasswordMutation({
            onSuccess: () => {
                showToastSuccess({
                    title: t(
                        'components_user_settings_password_panel.tips.success',
                    ),
                });

                window.location.href = '/login';
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'components_user_settings_password_panel.tips.error',
                    ),
                    apiError: error,
                });
            },
        });

    const handleOnSubmit = form.onSubmit(({ currentPassword, newPassword }) => {
        if (!form.isValid()) return;

        if (hasPassword) {
            updateUserPassword({ password: currentPassword, newPassword });
        } else {
            updateUserPassword({ newPassword });
        }
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack mt="md">
                {hasPassword && (
                    <PasswordInput
                        label={t(
                            'components_user_settings_password_panel.form.current_password.label',
                        )}
                        placeholder={t(
                            'components_user_settings_password_panel.form.current_password.placeholder',
                        )}
                        disabled={isUpdatingUserPassword}
                        {...form.getInputProps('currentPassword')}
                    />
                )}
                <PasswordTextInput passwordValue={form.values.newPassword}>
                    <PasswordInput
                        label={t(
                            'components_user_settings_password_panel.form.new_password.label',
                        )}
                        placeholder={t(
                            'components_user_settings_password_panel.form.new_password.placeholder',
                        )}
                        disabled={isUpdatingUserPassword}
                        {...form.getInputProps('newPassword')}
                    />
                </PasswordTextInput>

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdatingUserPassword && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            {t(
                                'components_user_settings_password_panel.cancel',
                            )}
                        </Button>
                    )}

                    <Button
                        type="submit"
                        display="block"
                        loading={isUpdatingUserPassword}
                        disabled={isUpdatingUserPassword}
                    >
                        {t('components_user_settings_password_panel.update')}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default PasswordPanel;
