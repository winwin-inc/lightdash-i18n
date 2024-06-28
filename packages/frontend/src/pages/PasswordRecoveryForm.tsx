import { getEmailSchema } from '@lightdash/common';
import {
    Anchor,
    Button,
    Center,
    List,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';

type RecoverPasswordForm = { email: string };

export const PasswordRecoveryForm: FC = () => {
    const { t } = useTranslation();
    const { health } = useApp();
    const form = useForm<RecoverPasswordForm>({
        initialValues: {
            email: '',
        },
        validate: zodResolver(
            z.object({
                email: getEmailSchema(),
            }),
        ),
    });

    const { isLoading, isSuccess, mutate, reset } =
        usePasswordResetLinkMutation();

    return (
        <div>
            {!isSuccess ? (
                <>
                    <Title order={3} ta="center" mb="sm">
                        {t('pages_password_recovery_form.forgot_password')}
                    </Title>
                    <Text ta="center" mb="md" color="dimmed">
                        {t('pages_password_recovery_form.reset_tip')}
                    </Text>
                    <form
                        name="password-recovery"
                        onSubmit={form.onSubmit((values) => mutate(values))}
                    >
                        <Stack spacing="lg">
                            <TextInput
                                label={t(
                                    'pages_password_recovery_form.form.email.label',
                                )}
                                name="email"
                                placeholder={t(
                                    'pages_password_recovery_form.form.email.placeholder',
                                )}
                                required
                                {...form.getInputProps('email')}
                                disabled={isLoading || isSuccess}
                            />

                            <Button type="submit" loading={isLoading}>
                                {t(
                                    'pages_password_recovery_form.form.send_reset_email',
                                )}
                            </Button>
                            {!health.data?.isAuthenticated && (
                                <Center>
                                    <Anchor component={Link} to="/login">
                                        {t(
                                            'pages_password_recovery_form.form.back_to_sign_in',
                                        )}
                                    </Anchor>
                                </Center>
                            )}
                        </Stack>
                    </form>
                </>
            ) : (
                <>
                    <Title order={3} ta="center" mb="sm">
                        {t('pages_password_recovery_form.check_your_inbox')}
                    </Title>
                    <Text ta="center" mb="lg" color="dimmed">
                        {t('pages_password_recovery_form.check_tip')}
                    </Text>

                    <List size="sm" spacing="xs">
                        <List.Item>
                            {t(
                                'pages_password_recovery_form.lists.spam_folder',
                            )}
                        </List.Item>
                        <List.Item>
                            {t(
                                'pages_password_recovery_form.lists.reset.part_1',
                            )}{' '}
                            <Anchor
                                component={Link}
                                to="/recover-password"
                                onClick={reset}
                            >
                                {t(
                                    'pages_password_recovery_form.lists.reset.part_2',
                                )}
                            </Anchor>{' '}
                            {t(
                                'pages_password_recovery_form.lists.reset.part_3',
                            )}
                            <br />{' '}
                            {t(
                                'pages_password_recovery_form.lists.reset.part_4',
                            )}
                        </List.Item>
                    </List>

                    <Center mt="lg">
                        <Anchor component={Link} to="/login">
                            {t('pages_password_recovery_form.back_to_sign_in')}
                        </Anchor>
                    </Center>
                </>
            )}
        </div>
    );
};
