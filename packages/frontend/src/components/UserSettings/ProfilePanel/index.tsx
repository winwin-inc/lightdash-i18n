import { getEmailSchema, type ApiError } from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import useToaster from '../../../hooks/toaster/useToaster';
import {
    useEmailStatus,
    useOneTimePassword,
} from '../../../hooks/useEmailVerification';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import { VerifyEmailModal } from '../../../pages/VerifyEmail';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';

const validationSchema = z.object({
    firstName: z.string().nonempty(),
    lastName: z.string().nonempty(),
    email: getEmailSchema().or(z.undefined()),
});

type FormValues = z.infer<typeof validationSchema>;

const ProfilePanel: FC = () => {
    const {
        user: { data: userData, isLoading: isLoadingUser },
        health,
    } = useApp();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation();

    const form = useForm<FormValues>({
        validate: zodResolver(validationSchema),
    });

    useEffect(() => {
        if (!userData) return;

        const initialValues = {
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userData]);

    const isEmailServerConfigured = health.data?.hasEmailClient;
    const { data, isInitialLoading: statusLoading } = useEmailStatus(
        !!health.data?.isAuthenticated,
    );
    const {
        mutate: sendVerificationEmail,
        error: sendVerificationEmailError,
        isLoading: emailLoading,
    } = useOneTimePassword();

    const [showVerifyEmailModal, setShowVerifyEmailModal] =
        useState<boolean>(false);

    const { isLoading: isUpdatingUser, mutate: updateUser } =
        useUserUpdateMutation({
            onSuccess: () => {
                showToastSuccess({
                    title: t(
                        'components_user_settings_profile_panel.tips.success',
                    ),
                });
            },
            onError: ({ error }: ApiError) => {
                showToastApiError({
                    title: t(
                        'components_user_settings_profile_panel.tips.error',
                    ),
                    apiError: error,
                });
            },
        });

    useEffect(() => {
        if (
            sendVerificationEmailError ||
            data?.isVerified ||
            !isEmailServerConfigured
        ) {
            setShowVerifyEmailModal(false);
        }
    }, [data?.isVerified, isEmailServerConfigured, sendVerificationEmailError]);

    const handleOnSubmit = form.onSubmit((formValues) => {
        if (!form.isValid()) return;
        updateUser(formValues);
    });

    const isLoading = isLoadingUser || isUpdatingUser || !form.initialized;

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack mt="md">
                <TextInput
                    placeholder={t(
                        'components_user_settings_profile_panel.form.first_name.placeholder',
                    )}
                    label={t(
                        'components_user_settings_profile_panel.form.first_name.label',
                    )}
                    type="text"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('firstName')}
                />

                <TextInput
                    placeholder={t(
                        'components_user_settings_profile_panel.form.last_name.placeholder',
                    )}
                    label={t(
                        'components_user_settings_profile_panel.form.last_name.label',
                    )}
                    type="text"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('lastName')}
                />

                <TextInput
                    placeholder={t(
                        'components_user_settings_profile_panel.form.email.placeholder',
                    )}
                    label={t(
                        'components_user_settings_profile_panel.form.email.label',
                    )}
                    type="email"
                    required
                    disabled={isLoading}
                    inputWrapperOrder={[
                        'label',
                        'input',
                        'error',
                        'description',
                    ]}
                    {...form.getInputProps('email')}
                    rightSection={
                        isEmailServerConfigured && data?.isVerified ? (
                            <Tooltip
                                label={t(
                                    'components_user_settings_profile_panel.form.email.tooltip',
                                )}
                            >
                                <MantineIcon
                                    size="lg"
                                    icon={IconCircleCheck}
                                    color="green.6"
                                />
                            </Tooltip>
                        ) : (
                            <MantineIcon
                                size="lg"
                                icon={IconAlertCircle}
                                color="gray.6"
                            />
                        )
                    }
                    descriptionProps={{ mt: 'xs' }}
                    description={
                        isEmailServerConfigured && !data?.isVerified ? (
                            <Text c="dimmed">
                                {t(
                                    'components_user_settings_profile_panel.form.email.description.part_1',
                                )}{' '}
                                <Anchor
                                    component="span"
                                    onClick={() => {
                                        if (!data?.otp) {
                                            sendVerificationEmail();
                                        }
                                        setShowVerifyEmailModal(true);
                                    }}
                                >
                                    {t(
                                        'components_user_settings_profile_panel.form.email.description.part_2',
                                    )}
                                </Anchor>
                                .
                            </Text>
                        ) : null
                    }
                />

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdatingUser && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            {t('components_user_settings_profile_panel.cancel')}
                        </Button>
                    )}
                    <Button
                        type="submit"
                        loading={isLoading}
                        disabled={!form.isDirty()}
                    >
                        {t('components_user_settings_profile_panel.update')}
                    </Button>
                </Flex>

                <VerifyEmailModal
                    opened={showVerifyEmailModal}
                    onClose={() => {
                        setShowVerifyEmailModal(false);
                    }}
                    isLoading={statusLoading || emailLoading}
                />
            </Stack>
        </form>
    );
};

export default ProfilePanel;
