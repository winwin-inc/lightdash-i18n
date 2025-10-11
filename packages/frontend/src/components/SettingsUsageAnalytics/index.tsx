import { FeatureFlags } from '@lightdash/common';
import { Card, Group, Stack, Text } from '@mantine/core';
import { IconArchive, IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import MantineIcon from '../common/MantineIcon';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { t } = useTranslation();

    const isUnusedContentDashboardEnabled = useFeatureFlagEnabled(
        FeatureFlags.UnusedContentDashboard,
    );

    return (
        <>
            <Text color="dimmed">
                {t('components_settings_usage_analytics.tip')}
            </Text>

            <Stack spacing="md">
                <Card
                    component={Link}
                    shadow="sm"
                    withBorder
                    style={{ cursor: 'pointer' }}
                    to={`/projects/${projectUuid}/user-activity`}
                >
                    <Group>
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            size="xl"
                            color="gray"
                        />
                        <Text fw={600} fz="lg">
                            {t(
                                'components_settings_usage_analytics.user_activity',
                            )}
                        </Text>
                    </Group>
                </Card>

                {isUnusedContentDashboardEnabled && (
                    <Card
                        component={Link}
                        shadow="sm"
                        withBorder
                        style={{ cursor: 'pointer' }}
                        to={`/projects/${projectUuid}/unused-content`}
                    >
                        <Group>
                            <MantineIcon
                                icon={IconArchive}
                                size="xl"
                                color="gray"
                            />
                            <Text fw={600} fz="lg">
                                {t(
                                    'components_settings_usage_analytics.least_viewed_content',
                                )}
                            </Text>
                        </Group>
                    </Card>
                )}
            </Stack>
        </>
    );
};

export default SettingsUsageAnalytics;
