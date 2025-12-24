import { Button, Card, Image, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// 客服信息 - 可以从配置中获取
const CUSTOMER_SERVICE = {
    wechatId: 'joy000boy',
    phone: '17612234299',
    lockUrl: '/customer-service-lock@3x.png',
    qrCodeUrl: '/customer-service-qrcode@3x.png', // 二维码图片路径，需要放在 public/images 目录
};

const NoDashboardPermission = () => {
    const { t } = useTranslation();

    const isMobile = useMediaQuery('(max-width: 768px)');

    const handlePhoneCall = useCallback(() => {
        window.location.href = `tel:${CUSTOMER_SERVICE.phone}`;
    }, []);

    return (
        <Stack
            align="center"
            w="100vw"
            mih="90vh"
            pt={isMobile ? '6vh' : '12vh'}
            pb={isMobile ? '15vh' : '15vh'}
            style={{
                display: 'flex',
                backgroundColor: '#fff',
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
                alt="Customer Service Lock"
            />

            {/* 标题和描述 */}
            <Stack
                spacing="xs"
                align="center"
                style={{ marginTop: isMobile ? -30 : -20 }}
            >
                <Title
                    ta="center"
                    fw={600}
                    style={{
                        color: '#1F1F1F',
                        fontSize: isMobile ? '16px' : '18px',
                    }}
                >
                    {t('pages_no_dashboard_permission.title')}
                </Title>
                <Text
                    ta="center"
                    style={{
                        color: '#9A9A9A',
                        fontSize: isMobile ? '14px' : '16px',
                    }}
                    maw={isMobile ? '100%' : '400px'}
                >
                    {t('pages_no_dashboard_permission.description')}
                </Text>
            </Stack>

            {/* 客服联系卡片 */}
            <Card
                radius="md"
                w="100%"
                maw={isMobile ? '85%' : '380px'}
                mt={isMobile ? '20px' : '40px'}
                withBorder
                style={{
                    borderColor: '#EAEAEA',
                    backgroundColor: '#FCFDFF',
                }}
            >
                <Stack spacing="md" align="center">
                    {/* 扫码提示文字 */}
                    <Text
                        ta="center"
                        fw={600}
                        style={{
                            color: '#1F1F1F',
                            fontSize: isMobile ? '20px' : '24px',
                            letterSpacing: '2px',
                        }}
                    >
                        {isMobile
                            ? t('pages_no_dashboard_permission.scan_mobile')
                            : t('pages_no_dashboard_permission.scan_pc')}
                    </Text>

                    {/* 二维码 */}
                    <Image
                        src={CUSTOMER_SERVICE.qrCodeUrl}
                        alt="Customer Service QR Code"
                        width={isMobile ? 180 : 240}
                        height={isMobile ? 180 : 240}
                        onError={(e) => {
                            // 如果图片加载失败，显示占位符
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            if (target.parentElement) {
                                target.parentElement.innerHTML = `
                                            <div style="
                                                width: 100%;
                                                height: 100%;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                color: #868e96;
                                                font-size: 14px;
                                            ">
                                                二维码图片
                                            </div>
                                        `;
                            }
                        }}
                    />

                    <Text ta="center" fw={500} c="#4E4E4E" fz="14px">
                        {t('pages_no_dashboard_permission.mobile')}
                    </Text>

                    {/* 按钮组 */}
                    {isMobile ? (
                        <Button
                            variant="filled"
                            onClick={handlePhoneCall}
                            style={{
                                width: '70%',
                                height: '40px',
                                borderRadius: '55px',
                                backgroundColor: '#5490FF',
                            }}
                        >
                            {t('pages_no_dashboard_permission.lins.mobile')}
                        </Button>
                    ) : null}
                </Stack>
            </Card>
        </Stack>
    );
};

export default NoDashboardPermission;
