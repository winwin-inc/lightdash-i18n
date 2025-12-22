import { Image, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useMount } from 'react-use';

import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../svgs/lightdash-black.svg';

const AuthPopupResult: FC = () => {
    const { t } = useTranslation();
    const { status } = useParams<{ status: string }>();

    useMount(() => {
        // send message to parent window
        const channel = new BroadcastChannel('lightdash-oauth-popup');
        channel.postMessage(status);
        // automatically close the window after 2 seconds
        setTimeout(() => {
            window.close();
        }, 2000);
    });

    return (
        <>
            <title>{t('pages_auth_popup_result.title')}</title>

            <Stack>
                <Image
                    src={LightdashLogo}
                    alt={t('pages_auth_popup_result.logo')}
                    width={130}
                    mx="auto"
                    my="lg"
                />
                {status === 'success' ? (
                    <SuboptimalState
                        title={t('pages_auth_popup_result.success.title')}
                        description={t(
                            'pages_auth_popup_result.success.description',
                        )}
                    />
                ) : (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={t('pages_auth_popup_result.failed.title')}
                        description={t(
                            'pages_auth_popup_result.failed.description',
                        )}
                    />
                )}
            </Stack>
        </>
    );
};

/**
 * Fixed version of AuthPopupResult that is used in Github authentication
 */
export const SuccessAuthPopupResult: FC = () => {
    useMount(() => {
        setTimeout(() => {
            window.close();
        }, 2000);
    });

    return (
        <>
            <title>Authentication - 马上赢X</title>

            <Stack>
                <Image
                    src={LightdashLogo}
                    alt="lightdash logo"
                    width={130}
                    mx="auto"
                    my="lg"
                />

                <SuboptimalState
                    title={'Thank you for authenticating'}
                    description={'This window will close automatically'}
                />
            </Stack>
        </>
    );
};

export default AuthPopupResult;
