import { Box, Image, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import LightdashLogo from '../../svgs/lightdash-black.svg';
import MantineLinkButton from '../common/MantineLinkButton';

const MobileView = () => {
    const { t } = useTranslation();

    return (
        <Box w="100vw" h="100vh" sx={{ background: '#ebf1f5' }}>
            <Stack align="center" spacing="xl" justify="start" p="5xl">
                <Image
                    src={LightdashLogo}
                    alt="lightdash logo"
                    maw="8xl"
                    my="lg"
                />
                <Box
                    component="span"
                    sx={{
                        fontSize: '2.5rem',
                        display: 'block',
                    }}
                >
                    &#128586;
                </Box>
                <Title ta="center" order={4}>
                    {t('components_mobile.content.part_1')}
                </Title>
                <Text ta="center" color="gray.6">
                    {t('components_mobile.content.part_2')}
                </Text>
                <MantineLinkButton href="/">
                    {t('components_mobile.back_to_home_page')}
                </MantineLinkButton>
            </Stack>
        </Box>
    );
};

export default MobileView;
