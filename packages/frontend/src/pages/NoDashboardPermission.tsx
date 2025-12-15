import {
    Box,
    Button,
    Card,
    Group,
    Image,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../hooks/toaster/useToaster';

const isMobile = window.innerWidth < 768;

// 客服信息 - 可以从配置中获取
const CUSTOMER_SERVICE = {
    wechatId: 'joy000boy',
    phone: '17612234299',
    lockUrl: '/customer-service-lock@3x.png',
    qrCodeUrl: '/customer-service-qrcode@3x.png', // 二维码图片路径，需要放在 public/images 目录
};

const NoDashboardPermission = () => {
    const { t } = useTranslation();
    const { showToastSuccess } = useToaster();
    const [isCopied, setIsCopied] = useState(false);

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
        <Box
            w="100vw"
            h="100vh"
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isMobile ? 'sm' : 'xl',
            }}
        >
            <Stack
                align="center"
                spacing={isMobile ? 'xl' : 'lg'}
                justify="center"
                w="100%"
                maw={isMobile ? '100%' : '500px'}
            >
                {/* 锁图标 */}
                <Image
                    style={{ width: 350, height: 235 }}
                    src={CUSTOMER_SERVICE.lockUrl}
                    alt="Customer Service Lock"
                />

                {/* 标题和描述 */}
                <Stack
                    spacing="xs"
                    align="center"
                    style={{ marginTop: '-60px' }}
                >
                    <Title
                        ta="center"
                        order={isMobile ? 4 : 2}
                        fw={600}
                        c="gray.9"
                        style={{ fontSize: isMobile ? '18px' : '22px' }}
                    >
                        {t('pages_no_dashboard_permission.title')}
                    </Title>
                    <Text
                        ta="center"
                        c="gray.6"
                        style={{ fontSize: isMobile ? '14px' : '16px' }}
                        maw={isMobile ? '100%' : '400px'}
                    >
                        {t('pages_no_dashboard_permission.description')}
                    </Text>
                </Stack>

                {/* 客服联系卡片 */}
                <Card
                    shadow="sm"
                    padding={isMobile ? 'lg' : 'xl'}
                    radius="md"
                    w="100%"
                    maw={isMobile ? '80%' : '420px'}
                    mt={isMobile ? '20px' : '60px'}
                    style={{ background: '#FCFDFF', borderColor: '#EAEAEA' }}
                >
                    <Stack spacing="md" align="center">
                        {/* 扫码提示文字 */}
                        <Text
                            ta="center"
                            style={{ fontSize: isMobile ? '16px' : '18px' }}
                            fw={500}
                            c="gray.8"
                        >
                            {t('pages_no_dashboard_permission.scan')}
                        </Text>

                        {/* 二维码 */}
                        <Box
                            sx={{
                                width: isMobile ? '200px' : '240px',
                                height: isMobile ? '200px' : '240px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: '#f8f9fa',
                                borderRadius: '8px',
                                border: '1px solid #e9ecef',
                            }}
                        >
                            <Image
                                src={CUSTOMER_SERVICE.qrCodeUrl}
                                alt="Customer Service QR Code"
                                width={isMobile ? 180 : 220}
                                height={isMobile ? 180 : 220}
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
                        </Box>

                        {/* 按钮组 */}
                        {isMobile ? (
                            <Group spacing="md" w="100%">
                                <Button
                                    variant="outline"
                                    onClick={handlePhoneCall}
                                    style={{
                                        width: 129,
                                        height: 40,
                                        borderRadius: 55,
                                        color: '#5490FF',
                                        borderColor: '#5490FF',
                                    }}
                                >
                                    {t(
                                        'pages_no_dashboard_permission.lins.mobile',
                                    )}
                                </Button>
                                <Button
                                    variant="filled"
                                    onClick={handleCopyWeChatId}
                                    style={{
                                        width: 129,
                                        height: 40,
                                        borderRadius: 55,
                                        backgroundColor: '#5490FF',
                                    }}
                                >
                                    {isCopied
                                        ? t(
                                              'pages_no_dashboard_permission.copied',
                                          )
                                        : t(
                                              'pages_no_dashboard_permission.lins.copy',
                                          )}
                                </Button>
                            </Group>
                        ) : null}
                    </Stack>
                </Card>
            </Stack>
        </Box>
    );
};

export default NoDashboardPermission;
