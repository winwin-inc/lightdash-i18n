import { Group, Text } from '@mantine/core';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    selectFromDashboard,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';

type ContextItemProps = {
    label: string;
    value: string;
    monospace?: boolean;
};

const ContextItem: FC<ContextItemProps> = ({
    label,
    value,
    monospace = false,
}) => (
    <>
        <Text span size="xs" c="dimmed">
            {label}:{' '}
        </Text>
        <Text span size="xs" ff={monospace ? 'monospace' : undefined}>
            {value}
        </Text>
    </>
);

const DashboardContextFilters: FC = memo(() => {
    const { t } = useTranslation();
    const fromDashboard = useExplorerSelector(selectFromDashboard);
    const { data: dashboard } = useDashboardQuery(fromDashboard ?? undefined);

    if (!fromDashboard || !dashboard) {
        return null;
    }

    const dashboardUuid = dashboard.uuid || fromDashboard;

    return (
        <Group
            spacing="xs"
            align="center"
            mx="sm"
            mb="xs"
            sx={{ flexWrap: 'wrap' }}
            data-testid="DashboardContextFilters"
        >
            <Text size="xs" c="dimmed">
                {t('components_explorer_filters_card.dashboard_context_title')}
            </Text>
            <Text size="xs" c="dimmed">
                ·
            </Text>
            <ContextItem
                label={t('components_explorer_filters_card.dashboard_name')}
                value={dashboard.name}
            />
            <Text size="xs" c="dimmed">
                ·
            </Text>
            <ContextItem
                label={t('components_explorer_filters_card.dashboard_slug')}
                value={dashboard.slug}
                monospace
            />
            <Text size="xs" c="dimmed">
                ·
            </Text>
            <ContextItem
                label={t('components_explorer_filters_card.dashboard_uuid')}
                value={dashboardUuid}
                monospace
            />
        </Group>
    );
});

export default DashboardContextFilters;
