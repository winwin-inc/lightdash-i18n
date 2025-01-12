import {
    OpenIdIdentityIssuerType,
    type ActivateUserWithInviteCode,
    type ApiError,
    type CreateUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Card,
    Divider,
    Image,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useParams } from 'react-router';

import { lightdashApi } from '../api';
import Page from '../components/common/Page/Page';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import PageSpinner from '../components/PageSpinner';
import CreateUserForm from '../components/RegisterForms/CreateUserForm';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useFlashMessages } from '../hooks/useFlashMessages';
import { useInviteLink } from '../hooks/useInviteLink';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import LightdashLogo from '../svgs/lightdash-black.svg';

interface WelcomeCardProps {
    email: string | undefined;
    setReadyToJoin: (isReady: boolean) => void;
}

const WelcomeCard: FC<WelcomeCardProps> = ({ email, setReadyToJoin }) => {
    const { data: org } = useOrganization();
    const { t } = useTranslation();

    return (
        <>
            <Card
                p="xl"
                radius="xs"
                withBorder
                shadow="xs"
                data-cy="welcome-user"
            >
                <Stack spacing="md" align="center">
                    <Title order={3}>{t('pages_invite.title')}</Title>
                    {email && (
                        <Text fw="600" size="md">
                            {email}
                        </Text>
                    )}
                    <Text color="gray.6" ta="center">
                        {`${t('pages_invite.content.part_1')} ${
                            org?.name
                                ? `${t('pages_invite.content.part_2')} ${
                                      org.name
                                  }`
                                : ''
                        } ${t('pages_invite.content.part_3')}`}
                    </Text>
                    <Button onClick={() => setReadyToJoin(true)}>
                        {t('pages_invite.join_your_team')}
                    </Button>
                </Stack>
            </Card>
            <Text color="gray.6" ta="center">
                {`${t('pages_invite.not_you.part_1')} ${
                    email ? email : t('pages_invite.not_you.part_2')
                }?`}
                <br />
                {t('pages_invite.not_you.part_3')}
            </Text>
        </>
    );
};

const ErrorCard: FC<{ title: string }> = ({ title }) => {
    const { t } = useTranslation();

    return (
        <Card p="xl" radius="xs" withBorder shadow="xs" data-cy="welcome-user">
            <Stack spacing="md" align="center">
                <Title order={3}>{title}</Title>
                <Text color="gray.7" ta="center">
                    {t('pages_invite.error_card.content')}
                </Text>
            </Stack>
        </Card>
    );
};

const createUserQuery = async (data: ActivateUserWithInviteCode) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Invite: FC = () => {
    const { inviteCode } = useParams<{ inviteCode: string }>();
    const { health } = useApp();
    const { showToastError, showToastApiError } = useToaster();
    const flashMessages = useFlashMessages();
    const { t } = useTranslation();

    useEffect(() => {
        if (flashMessages.data?.error) {
            showToastError({
                title: t('pages_invite.toast_authenticate_error.title'),
                subtitle: flashMessages.data.error.join('\n'),
            });
        }
    }, [flashMessages.data, showToastError, t]);
    const { search } = useLocation();
    const { identify } = useTracking();
    const redirectUrl = '/';
    const [isLinkFromEmail, setIsLinkFromEmail] = useState<boolean>(false);
    const { isLoading, mutate, isSuccess } = useMutation<
        LightdashUser,
        ApiError,
        ActivateUserWithInviteCode
    >(createUserQuery, {
        mutationKey: ['create_user'],
        onSuccess: (data) => {
            identify({ id: data.userUuid });
            window.location.href = redirectUrl;
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('pages_invite.toast_user_error.title'),
                apiError: error,
            });
        },
    });
    const inviteLinkQuery = useInviteLink(inviteCode);

    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;

    useEffect(() => {
        const searchParams = new URLSearchParams(search);
        const fromParam = searchParams.get('from');
        if (fromParam === 'email') {
            setIsLinkFromEmail(true);
        }
    }, [search]);

    if (health.isInitialLoading || inviteLinkQuery.isInitialLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Navigate to={{ pathname: redirectUrl }} />;
    }

    const ssoAvailable =
        health.data?.auth.google.enabled ||
        health.data?.auth.okta.enabled ||
        health.data?.auth.oneLogin.enabled ||
        health.data?.auth.azuread.enabled ||
        health.data?.auth.oidc.enabled;
    const ssoLogins = ssoAvailable && (
        <Stack>
            {Object.values(OpenIdIdentityIssuerType).map((providerName) => (
                <ThirdPartySignInButton
                    key={providerName}
                    providerName={providerName}
                    inviteCode={inviteCode}
                    intent="signup"
                    redirect={redirectUrl}
                />
            ))}
        </Stack>
    );
    const passwordLogin = allowPasswordAuthentication && inviteCode && (
        <CreateUserForm
            isLoading={isLoading || isSuccess}
            readOnlyEmail={inviteLinkQuery.data?.email}
            onSubmit={({ firstName, lastName, password }: CreateUserArgs) => {
                mutate({
                    inviteCode,
                    firstName,
                    lastName,
                    password,
                });
            }}
        />
    );
    const logins = (
        <>
            {ssoLogins}
            {ssoLogins && passwordLogin && (
                <Divider
                    my="md"
                    labelPosition="center"
                    label={
                        <Text color="gray.5" size="sm" fw={500}>
                            {t('pages_invite.or')}
                        </Text>
                    }
                />
            )}
            {passwordLogin}
        </>
    );

    return (
        <Page title="Register" withCenteredContent withNavbar={false}>
            <Stack w={400} mt="4xl">
                <Image
                    src={LightdashLogo}
                    alt="lightdash logo"
                    width={130}
                    mx="auto"
                    my="lg"
                />
                {inviteLinkQuery.error ? (
                    <ErrorCard
                        title={
                            inviteLinkQuery.error.error.name === 'ExpiredError'
                                ? t('pages_invite.invite_link_error.title')
                                : inviteLinkQuery.error.error.message
                        }
                    />
                ) : isLinkFromEmail ? (
                    <>
                        <Card p="xl" radius="xs" withBorder shadow="xs">
                            <Title order={3} ta="center" mb="md">
                                {t('pages_invite.is_link_email.title')}
                            </Title>
                            {logins}
                        </Card>
                        <Text color="gray.6" ta="center">
                            {t('pages_invite.is_link_email.content.part_1')}
                            <br />
                            {t(
                                'pages_invite.is_link_email.content.part_2',
                            )}{' '}
                            <Anchor
                                href="https://www.lightdash.com/privacy-policy"
                                target="_blank"
                            >
                                {t('pages_invite.is_link_email.content.part_3')}
                            </Anchor>{' '}
                            {t('pages_invite.is_link_email.content.part_4')}{' '}
                            <Anchor
                                href="https://www.lightdash.com/terms-of-service"
                                target="_blank"
                            >
                                {t('pages_invite.is_link_email.content.part_5')}
                            </Anchor>
                        </Text>
                    </>
                ) : (
                    <WelcomeCard
                        email={inviteLinkQuery.data?.email}
                        setReadyToJoin={setIsLinkFromEmail}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default Invite;
