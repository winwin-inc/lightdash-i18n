import {
    Anchor,
    Button,
    Card,
    Center,
    Image,
    PasswordInput,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import {
    usePasswordResetLink,
    usePasswordResetMutation,
} from '../hooks/usePasswordReset';
import useApp from '../providers/App/useApp';
import LightdashLogo from '../svgs/lightdash-black.svg';

type ResetPasswordForm = { password: string };

const PasswordReset: FC = () => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { code } = useParams<{ code: string }>();
    const { health } = useApp();
    const { isInitialLoading, error } = usePasswordResetLink(code);
    const passwordResetMutation = usePasswordResetMutation();

    const form = useForm<ResetPasswordForm>({
        initialValues: {
            password: '',
        },
    });

    if (health.isInitialLoading || isInitialLoading) {
        return <PageSpinner />;
    }

    return (
        <Page
            title={t('pages_password_reset.reset_password')}
            withCenteredContent
            withNavbar={false}
        >
            {/* FIXME: use Mantine sizes for width */}
            <Stack w={400} mt="4xl">
                <Image
                    src={LightdashLogo}
                    alt="lightdash logo"
                    width={130}
                    mx="auto"
                    my="lg"
                />
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    {error ? (
                        <ErrorState error={error.error} hasMarginTop={false} />
                    ) : (
                        <>
                            {!passwordResetMutation.isSuccess ? (
                                <>
                                    <Title order={3} ta="center" mb="md">
                                        {t(
                                            'pages_password_reset.reset_your_password',
                                        )}
                                    </Title>
                                    <form
                                        name="password-reset"
                                        onSubmit={form.onSubmit(
                                            ({ password }) =>
                                                code &&
                                                passwordResetMutation.mutate({
                                                    code,
                                                    newPassword: password,
                                                }),
                                        )}
                                    >
                                        <Stack spacing="lg">
                                            <PasswordInput
                                                label={t(
                                                    'pages_password_reset.form.password.label',
                                                )}
                                                name="password"
                                                placeholder={t(
                                                    'pages_password_reset.form.password.placeholder',
                                                )}
                                                disabled={
                                                    passwordResetMutation.isLoading
                                                }
                                                required
                                                {...form.getInputProps(
                                                    'password',
                                                )}
                                            />

                                            <Button
                                                type="submit"
                                                loading={
                                                    passwordResetMutation.isLoading
                                                }
                                            >
                                                {t(
                                                    'pages_password_reset.form.save',
                                                )}
                                            </Button>

                                            <Center>
                                                <Anchor
                                                    component={Link}
                                                    to="/login"
                                                >
                                                    {t(
                                                        'pages_password_reset.form.cancel',
                                                    )}
                                                </Anchor>
                                            </Center>
                                        </Stack>
                                    </form>
                                </>
                            ) : (
                                <>
                                    <Title order={3} ta="center" mb="md">
                                        {t(
                                            'pages_password_reset.success.title',
                                        )}
                                    </Title>
                                    <Text ta="center" mb="lg" color="dimmed">
                                        {t(
                                            'pages_password_reset.content.part_1',
                                        )}
                                        <br />{' '}
                                        {t(
                                            'pages_password_reset.content.part_2',
                                        )}
                                    </Text>

                                    <Button
                                        fullWidth
                                        onClick={() => navigate('/login')}
                                    >
                                        {t('pages_password_reset.login_in')}
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                </Card>
            </Stack>
        </Page>
    );
};

export default PasswordReset;
