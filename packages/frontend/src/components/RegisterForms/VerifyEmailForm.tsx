import {
    Alert,
    Anchor,
    Button,
    PinInput,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { isNotEmpty, useForm } from '@mantine/form';
import { IconAlertCircle } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { useTranslation } from 'react-i18next';

import {
    useEmailStatus,
    useOneTimePassword,
    useVerifyEmail,
} from '../../hooks/useEmailVerification';
import useApp from '../../providers/App/useApp';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';

const VerifyEmailForm: FC<{ isLoading?: boolean }> = ({ isLoading }) => {
    const { t } = useTranslation();

    const { health, user } = useApp();
    const { mutate: verifyCode, isLoading: verificationLoading } =
        useVerifyEmail();
    const { data, isInitialLoading: statusLoading } = useEmailStatus(
        !!health.data?.isAuthenticated,
    );
    const { mutate: sendVerificationEmail, isLoading: emailLoading } =
        useOneTimePassword();
    const form = useForm<{ code: string }>({
        initialValues: {
            code: '',
        },
        validate: {
            code: isNotEmpty(
                t('components_register_form_verify_email.validate.field'),
            ),
        },
    });
    const { setFieldError, clearFieldError } = form;
    const errorMessage = form.errors.code;
    const expirationTime = data?.otp?.expiresAt || new Date();
    const loadingState =
        statusLoading || emailLoading || health.isInitialLoading || isLoading;

    useEffect(() => {
        if (data?.otp && data?.otp.numberOfAttempts > 0) {
            const remainingAttempts = 5 - data.otp.numberOfAttempts;
            const message = data.otp.isExpired
                ? t('components_register_form_verify_email.expired_tip.part_1')
                : data.otp.numberOfAttempts < 5
                ? `${t(
                      'components_register_form_verify_email.expired_tip.part_2',
                  )} ${remainingAttempts} ${t(
                      'components_register_form_verify_email.expired_tip.part_3',
                      {
                          suffix: remainingAttempts > 1 ? 's' : '',
                      },
                  )}`
                : t('components_register_form_verify_email.expired_tip.part_4');
            setFieldError('code', message);
        } else {
            clearFieldError('code');
        }
    }, [data, setFieldError, clearFieldError, t]);

    if (loadingState) {
        return <LoadingState title="" />;
    }

    return (
        // FIXME: update hardcoded widths with Mantine widths
        <Stack spacing="md" justify="center" align="center" w={300} mx="auto">
            <Title order={3}>
                {t('components_register_form_verify_email.form.title')}
            </Title>
            <Text color="gray.6" ta="center">
                {t('components_register_form_verify_email.form.content.part_1')}{' '}
                <b>
                    {user?.data?.email ||
                        t(
                            'components_register_form_verify_email.form.content.part_2',
                        )}
                </b>
            </Text>
            <form
                name="verifyEmail"
                onSubmit={form.onSubmit((values: { code: string }) =>
                    verifyCode(values.code),
                )}
            >
                <Stack spacing="xs" justify="center" align="center" mt="md">
                    <PinInput
                        aria-label="One-time password"
                        name="code"
                        length={6}
                        oneTimeCode
                        disabled={
                            data?.otp?.isMaxAttempts || data?.otp?.isExpired
                        }
                        {...form.getInputProps('code')}
                        data-testid="pin-input"
                        autoFocus
                    />
                    <Text ta="center" color="red.7">
                        {errorMessage?.toString()}
                    </Text>
                </Stack>
                <Countdown
                    key={expirationTime?.toString()}
                    date={expirationTime}
                    renderer={({ minutes, seconds, completed }) => {
                        if (completed) {
                            return (
                                <Alert
                                    icon={
                                        <MantineIcon icon={IconAlertCircle} />
                                    }
                                    color="orange.8"
                                    radius="xs"
                                >
                                    {t(
                                        'components_register_form_verify_email.form.expired.part_1',
                                    )}{' '}
                                    <Text span fw={500}>
                                        {t(
                                            'components_register_form_verify_email.form.expired.part_2',
                                        )}
                                    </Text>{' '}
                                    {t(
                                        'components_register_form_verify_email.form.expired.part_3',
                                    )}
                                </Alert>
                            );
                        }
                        if (data?.otp?.isMaxAttempts) {
                            return <></>;
                        }
                        return (
                            // FIXME: update hardcoded widths with Mantine widths
                            <Stack spacing="xs" mt="md" w={250} align="center">
                                <Button
                                    fullWidth
                                    loading={verificationLoading}
                                    type="submit"
                                >
                                    {t(
                                        'components_register_form_verify_email.form.submit',
                                    )}
                                </Button>
                                <Text color="gray.6" ta="center">
                                    {t(
                                        'components_register_form_verify_email.form.one_time_password',
                                    )}{' '}
                                    <b>
                                        {zeroPad(minutes)}:{zeroPad(seconds)}
                                    </b>{' '}
                                    {t(
                                        'components_register_form_verify_email.form.one_time_password_suffix',
                                    )}
                                </Text>
                            </Stack>
                        );
                    }}
                />
            </form>
            <Anchor
                size="sm"
                component="button"
                onClick={() => {
                    form.reset();
                    sendVerificationEmail();
                }}
            >
                {t(
                    'components_register_form_verify_email.form.resend_verification_email',
                )}
            </Anchor>
        </Stack>
    );
};

export default VerifyEmailForm;
