import {
    Anchor,
    Box,
    Button,
    Card,
    Image,
    Modal,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useIntercom } from 'react-use-intercom';

import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { SuccessIconBounce } from '../components/RegisterForms/ProjectConnectFlow.styles';
import VerifyEmailForm from '../components/RegisterForms/VerifyEmailForm';
import { useEmailStatus } from '../hooks/useEmailVerification';
import useApp from '../providers/App/useApp';
import LightdashLogo from '../svgs/lightdash-black.svg';

const VerificationSuccess: FC<{
    isOpen: boolean;
    onClose: () => void;
    onContinue: () => void;
}> = ({ isOpen, onClose, onContinue }) => {
    const theme = useMantineTheme();
    const { t } = useTranslation();

    return (
        <Modal
            size="sm"
            opened={isOpen}
            onClose={onClose}
            withCloseButton={false}
        >
            <Stack align="center" my="md">
                <Title order={3}>{t('pages_verify_email.great_tip')}</Title>

                <SuccessIconBounce
                    icon={IconCircleCheckFilled}
                    size={64}
                    style={{
                        color: theme.colors.green[6],
                    }}
                />
                <Button onClick={onContinue}>
                    {t('pages_verify_email.continue')}
                </Button>
            </Stack>
        </Modal>
    );
};

const VerifyEmailPage: FC = () => {
    const { t } = useTranslation();
    const { health } = useApp();
    const { data, isInitialLoading: statusLoading } = useEmailStatus(
        !!health.data?.isAuthenticated,
    );
    const { show: showIntercom } = useIntercom();
    const navigate = useNavigate();

    if (health.isInitialLoading || statusLoading) {
        return <PageSpinner />;
    }

    return (
        <Page
            title={t('pages_verify_email.verify_your_email')}
            withCenteredContent
            withNavbar={false}
        >
            <Stack w={400} mt="4xl">
                <Image
                    src={LightdashLogo}
                    alt="lightdash logo"
                    width={130}
                    mx="auto"
                    my="lg"
                />
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    <VerifyEmailForm />
                </Card>
                <Text color="gray.6" ta="center" px="xs">
                    {t('pages_verify_email.should_tip.part_1')}{' '}
                    <Anchor onClick={() => showIntercom()}>
                        {t('pages_verify_email.should_tip.part_2')}
                    </Anchor>
                </Text>
                {data && (
                    <VerificationSuccess
                        isOpen={data.isVerified}
                        onClose={() => {
                            void navigate('/');
                        }}
                        onContinue={() => {
                            void navigate('/');
                        }}
                    />
                )}
            </Stack>
        </Page>
    );
};

export const VerifyEmailModal: FC<{
    opened: boolean;
    onClose: () => void;
    isLoading: boolean;
}> = ({ opened, onClose, isLoading }) => {
    return (
        <Modal opened={opened} onClose={onClose}>
            <Box my="md">
                <VerifyEmailForm isLoading={isLoading} />
            </Box>
        </Modal>
    );
};

export default VerifyEmailPage;
