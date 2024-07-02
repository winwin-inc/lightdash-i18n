import { Center, Text } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { BANNER_HEIGHT } from '.';
import MantineIcon from '../common/MantineIcon';

export const PreviewBanner = () => {
    const { t } = useTranslation();

    return (
        <Center pos="fixed" w="100%" h={BANNER_HEIGHT} bg="blue.6">
            <MantineIcon icon={IconTool} color="white" size="sm" />
            <Text color="white" fw={500} fz="xs" mx="xxs">
                {t('components_navbar_preview_banner.content')}
            </Text>
        </Center>
    );
};
