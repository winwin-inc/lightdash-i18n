import { Card, Image, Stack } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import useApp from '../providers/App/useApp';
import LightdashLogo from '../svgs/lightdash-black.svg';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';

const PasswordRecovery: FC = () => {
    const { t } = useTranslation();
    const { health } = useApp();

    if (health.isInitialLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Navigate to={{ pathname: '/' }} />;
    }

    return (
        <Page
            title={t('pages_password_recovery.recover_password')}
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
                    <PasswordRecoveryForm />
                </Card>
            </Stack>
        </Page>
    );
};

export default PasswordRecovery;
