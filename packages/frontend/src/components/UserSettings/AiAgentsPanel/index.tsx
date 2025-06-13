import { CommercialFeatureFlags } from '@lightdash/common';
import {
    Box,
    Card,
    Loader,
    MantineProvider,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { OrganizationAiAgents } from '../../../ee/features/aiCopilot/components/OrganizationAiAgents';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const AiAgentsPanel: FC = () => {
    const { t } = useTranslation();

    const { data: aiCopilotFlag, isLoading } = useFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );

    if (isLoading) {
        return <Loader />;
    }

    const isAiCopilotEnabled = aiCopilotFlag?.enabled;

    if (!isAiCopilotEnabled) {
        return (
            <SettingsGridCard>
                <Stack gap="sm">
                    <Box>
                        <Title order={4}>
                            {t(
                                'components_user_settings_ai_agents_panel.title',
                            )}
                        </Title>
                    </Box>
                </Stack>

                <Text>
                    {t('components_user_settings_ai_agents_panel.description')}
                </Text>
            </SettingsGridCard>
        );
    }

    return (
        <MantineProvider>
            <Card withBorder shadow="subtle">
                <Stack gap="sm">
                    <Title order={4}>
                        {t('components_user_settings_ai_agents_panel.title')}
                    </Title>

                    <Text size="xs" c="dimmed">
                        {t(
                            'components_user_settings_ai_agents_panel.create_and_manage_agents',
                        )}
                    </Text>
                </Stack>

                <OrganizationAiAgents />
            </Card>
        </MantineProvider>
    );
};

export default AiAgentsPanel;
