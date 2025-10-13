import { Box, Paper, Skeleton, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiAgentAdminEmbedToken } from '../../hooks/useAiAgentAdmin';

export const AnalyticsEmbedDashboard: FC = () => {
    const { t } = useTranslation();

    const { data: embedData, isLoading: isEmbedLoading } =
        useAiAgentAdminEmbedToken();

    if (!embedData) {
        return (
            <Paper h={450}>
                <Text c="gray.6">
                    {t(
                        'ai_agent_form_setup_admin.analytics_embed_dashboard.unable_to_load_analytics_dashboard',
                    )}
                </Text>
            </Paper>
        );
    }

    return (
        <Box h={500}>
            {isEmbedLoading ? (
                <Skeleton h={450} />
            ) : (
                <iframe
                    src={embedData.url}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{
                        border: 'none',
                    }}
                    title={t(
                        'ai_agent_form_setup_admin.analytics_embed_dashboard.analytics_dashboard',
                    )}
                />
            )}
        </Box>
    );
};
