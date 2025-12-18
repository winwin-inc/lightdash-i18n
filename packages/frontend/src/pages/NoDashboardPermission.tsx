import { Button, Card, Group, Image, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../hooks/toaster/useToaster';

// 客服信息 - 可以从配置中获取
const CUSTOMER_SERVICE = {
    wechatId: 'joy000boy',
    phone: '17612234299',
    lockUrl: '/customer-service-lock@3x.png',
    qrCodeUrl: '/customer-service-qrcode@3x.png', // 二维码图片路径，需要放在 public/images 目录
};

const NoDashboardPermission = () => {
    const { t } = useTranslation();

    const [isCopied, setIsCopied] = useState(false);

    const isMobile = useMediaQuery('(max-width: 768px)');
    const { showToastSuccess } = useToaster();

    const handleCopyWeChatId = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(CUSTOMER_SERVICE.wechatId);
            setIsCopied(true);
            showToastSuccess({
                title: t('pages_no_dashboard_permission.copied'),
            });
            setTimeout(() => setIsCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy WeChat ID:', error);
        }
    }, [t, showToastSuccess]);

    const handlePhoneCall = useCallback(() => {
        window.location.href = `tel:${CUSTOMER_SERVICE.phone}`;
    }, []);

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
                alt="Customer Service Lock"
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
                    {t('pages_no_dashboard_permission.title')}
                </Title>
                <Text
                    ta="center"
                    style={{
                        color: '#9A9A9A',
                        fontSize: isMobile ? '14px' : '14px',
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
                maw={isMobile ? '90%' : '420px'}
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
                        fw={500}
                        style={{
                            color: '#1F1F1F',
                            fontSize: isMobile ? '16px' : '18px',
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

                    {/* 按钮组 */}
                    {isMobile ? (
                        <Group
                            mt="xs"
                            w="100%"
                            spacing={0}
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                        >
                            <Button
                                variant="outline"
                                onClick={handlePhoneCall}
                                style={{
                                    width: 129,
                                    height: 40,
                                    borderRadius: 55,
                                    color: '#5490FF',
                                    borderColor: '#5490FF',
                                    transition: 'none',
                                }}
                                sx={{
                                    '&:active': {
                                        transform: 'none',
                                        backgroundColor: 'transparent',
                                    },
                                    '&:focus': { outline: 'none' },
                                    '&:focus-visible': { outline: 'none' },
                                }}
                            >
                                {t('pages_no_dashboard_permission.lins.mobile')}
                            </Button>
                            <Button
                                variant="filled"
                                onClick={handleCopyWeChatId}
                                style={{
                                    width: 129,
                                    height: 40,
                                    borderRadius: 55,
                                    backgroundColor: '#5490FF',
                                    marginLeft: isMobile ? 24 : 32,
                                }}
                            >
                                {isCopied
                                    ? t('pages_no_dashboard_permission.copied')
                                    : t(
                                          'pages_no_dashboard_permission.lins.copy',
                                      )}
                            </Button>
                        </Group>
                    ) : null}
                </Stack>
            </Card>
        </Stack>
    );
};

export default NoDashboardPermission;
