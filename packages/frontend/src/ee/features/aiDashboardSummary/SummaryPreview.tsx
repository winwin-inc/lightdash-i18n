import { type DashboardSummary } from '@lightdash/common';
import { ActionIcon, Alert, Flex, Stack, Text, Tooltip } from '@mantine/core';
import { IconExclamationCircle, IconRefresh } from '@tabler/icons-react';
import ReactMarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

type SummaryPreviewProps = {
    summary: DashboardSummary;
    dashboardVersionId: number;
    handleSummaryRegen: () => void;
};

const SummaryPreview: FC<SummaryPreviewProps> = ({
    summary,
    dashboardVersionId,
    handleSummaryRegen,
}) => {
    const { t } = useTranslation();

    const relativeDate = useTimeAgo(summary.createdAt);

    return (
        <Stack align="flex-end">
            {dashboardVersionId !== summary.dashboardVersionId && (
                <Alert
                    color="orange"
                    w="100%"
                    icon={
                        <MantineIcon icon={IconExclamationCircle} size="lg" />
                    }
                >
                    {t('ai_dashboard_summary_preview.dashboard_has_changed')}
                </Alert>
            )}
            <ReactMarkdownPreview
                source={summary.summary}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
            />
            <Flex align="center" justify="space-between" mt="md" w="100%">
                <Text color="gray.7" fz="xs">{`${t(
                    'ai_dashboard_summary_preview.generated',
                )} ${relativeDate}`}</Text>
                <Tooltip
                    label={t('ai_dashboard_summary_preview.regenerate_summary')}
                    position="left"
                >
                    <ActionIcon onClick={handleSummaryRegen} color="violet">
                        <MantineIcon icon={IconRefresh} />
                    </ActionIcon>
                </Tooltip>
            </Flex>
        </Stack>
    );
};

export default SummaryPreview;
