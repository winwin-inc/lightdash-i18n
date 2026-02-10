import { LightdashMode } from '@lightdash/common';
import { Badge, Box, Divider, Group } from '@mantine-8/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useApp from '../providers/App/useApp';
import { TrackSection } from '../providers/Tracking/TrackingProvider';
import { SectionName } from '../types/Events';
import {
    FOOTER_HEIGHT,
    FOOTER_MARGIN,
    PAGE_CONTENT_WIDTH,
} from './common/Page/constants';

const AboutFooter: FC<{ minimal?: boolean; maxWidth?: number }> = ({
    minimal,
    maxWidth = PAGE_CONTENT_WIDTH,
}) => {
    const { health: healthState } = useApp();
    const { t } = useTranslation();

    const showUpdateBadge =
        healthState.data?.latest.version &&
        healthState.data.version !== healthState.data.latest.version &&
        healthState.data?.mode === LightdashMode.DEFAULT;

    return (
        <TrackSection name={SectionName.PAGE_FOOTER}>
            <Box mt={FOOTER_MARGIN} h={FOOTER_HEIGHT} component="footer">
                <Divider color="gray.2" w="100%" mb="-1px" />

                <Group
                    h="100%"
                    miw={minimal ? '100%' : maxWidth}
                    maw={maxWidth}
                    justify="space-between"
                    mx="auto"
                    c="gray.7"
                    fw="500"
                    p="xs"
                >
                    <Group gap="xs">
                        {!minimal && `${t('app.title')} - `}
                        {healthState.isInitialLoading
                            ? null
                            : healthState.data &&
                              `v${healthState.data.version}`}
                        {showUpdateBadge && (
                            <Badge variant="light" radius="xs" size="xs">
                                {t('components_about_footer.new_version')}
                            </Badge>
                        )}
                    </Group>
                </Group>
            </Box>
        </TrackSection>
    );
};

export default AboutFooter;
