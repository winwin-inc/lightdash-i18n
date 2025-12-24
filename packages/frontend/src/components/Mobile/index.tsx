import { Button, Card, Image, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

// 客服信息 - 可以从配置中获取
const CUSTOMER_SERVICE = {
    lockUrl: '/customer-service-lock@3x.png',
};

const MobileView = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const isMobile = useMediaQuery('(max-width: 768px)');

    const handleBackToHome = () => {
        void navigate('/');
    };

    return (
        <Stack
            align="center"
            w="100vw"
            mih="100vh"
            pt={isMobile ? '8vh' : '12vh'}
            pb={isMobile ? '10vh' : '15vh'}
            style={{
                display: 'flex',
                justifyContent: 'center',
                backgroundColor: '#fff',
                overflowY: 'auto',
                overflowX: 'hidden',
            }}
        >
            {/* 锁图标 */}
            <Image
                style={{
                    width: isMobile ? 228 : 318,
                    height: isMobile ? 154 : 213,
                    scale: isMobile ? 1 : 0.8,
                }}
                src={CUSTOMER_SERVICE.lockUrl}
                alt="Mobile Unsupported Lock"
            />

            {/* 标题和描述 */}
            <Stack
                spacing="xs"
                align="center"
                style={{ marginTop: isMobile ? -30 : 0 }}
            >
                <Title
                    ta="center"
                    fw={600}
                    style={{
                        color: '#1F1F1F',
                        fontSize: isMobile ? '18px' : '22px',
                    }}
                >
                    {t('components_mobile.content.part_1')}
                </Title>
                <Text
                    ta="center"
                    style={{
                        color: '#9A9A9A',
                        fontSize: isMobile ? '14px' : '14px',
                    }}
                    maw={isMobile ? '100%' : '400px'}
                >
                    {t('components_mobile.content.part_2')}
                </Text>
            </Stack>

            {/* 操作卡片 */}
            <Card
                radius="md"
                w="100%"
                maw={isMobile ? '80%' : '420px'}
                mt={isMobile ? '20px' : '40px'}
            >
                <Stack spacing="md" align="center">
                    <Button
                        variant="filled"
                        onClick={handleBackToHome}
                        fullWidth
                        style={{
                            height: 40,
                            borderRadius: 55,
                            backgroundColor: '#5490FF',
                        }}
                    >
                        {t('components_mobile.back_to_home_page')}
                    </Button>
                </Stack>
            </Card>
        </Stack>
    );
};

export default MobileView;
