import { Image, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const FORBIDDEN_IMAGE_URL = '/customer-service-lock@3x.png';

const ForbiddenPanel: FC<{ subject?: string }> = () => {
    const { t } = useTranslation();
    const isMobile = useMediaQuery('(max-width: 768px)');

    return (
        <Stack
            align="center"
            w="100%"
            h="90vh"
            pt={isMobile ? '16vh' : '20vh'}
            style={{ boxSizing: 'border-box' }}
        >
            {/* 锁图标 */}
            <Image
                style={{
                    width: isMobile ? 228 : 318,
                    height: isMobile ? 154 : 213,
                }}
                src={FORBIDDEN_IMAGE_URL}
                alt="Forbidden"
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
                    {t('components_forbidden_panel.title')}
                </Title>
                <Text
                    ta="center"
                    style={{
                        color: '#9A9A9A',
                        fontSize: isMobile ? '14px' : '14px',
                    }}
                    maw={isMobile ? '100%' : '400px'}
                >
                    {t('components_forbidden_panel.description')}
                </Text>
            </Stack>
        </Stack>
    );
};

export default ForbiddenPanel;
