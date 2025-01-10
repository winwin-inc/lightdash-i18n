import { Card, Group, Text } from '@mantine/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import MantineIcon from '../common/MantineIcon';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { t } = useTranslation();

    return (
        <>
            <Text color="dimmed">
                {t('components_settings_usage_analytics.tip')}
            </Text>

            <Card
                component={Link}
                shadow="sm"
                withBorder
                sx={{ cursor: 'pointer' }}
                to={`/projects/${projectUuid}/user-activity`}
            >
                <Group>
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size="xl"
                        color="gray"
                    />
                    <Text fw={600} fz="lg">
                        {t('components_settings_usage_analytics.user_activity')}
                    </Text>
                </Group>
            </Card>
        </>
    );
};

export default SettingsUsageAnalytics;
