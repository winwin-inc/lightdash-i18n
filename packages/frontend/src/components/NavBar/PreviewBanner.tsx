import { Center, getDefaultZIndex, Text } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';

export const PreviewBanner = () => {
    const { t } = useTranslation();

    return (
        <Center
            pos="fixed"
            w="100%"
            h={BANNER_HEIGHT}
            bg="blue.6"
            style={{
                zIndex: getDefaultZIndex('app'),
            }}
        >
            <MantineIcon icon={IconTool} color="white" size="sm" />
            <Text color="white" fw={500} fz="xs" mx="xxs">
                {t('components_navbar_preview_banner.content')}
            </Text>
        </Center>
    );
};
