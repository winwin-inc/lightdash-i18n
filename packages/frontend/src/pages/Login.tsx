import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import Page from '../components/common/Page/Page';
import LoginLanding from '../features/users/components/LoginLanding';

const Login: FC<{ minimal?: boolean }> = ({ minimal = false }) => {
    const { t } = useTranslation();

    return minimal ? (
        <Stack m="xl">
            <LoginLanding />
        </Stack>
    ) : (
        <Page
            title={t('pages_login.title')}
            withCenteredContent
            withNavbar={false}
        >
            <Stack w={400} mt="4xl">
                <LoginLanding />
            </Stack>
        </Page>
    );
};

export default Login;
