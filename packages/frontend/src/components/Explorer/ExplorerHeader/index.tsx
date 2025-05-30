import { FeatureFlags } from '@lightdash/common';
import { Badge, Box, Group, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { memo, useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import MantineIcon from '../../common/MantineIcon';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import TimeZonePicker from '../../common/TimeZonePicker';
import SaveChartButton from '../SaveChartButton';

const ExplorerHeader: FC = memo(() => {
    const { t } = useTranslation();

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const showLimitWarning = useExplorerContext(
        (context) =>
            context.queryResults.totalResults &&
            context.queryResults.totalResults >=
                context.state.unsavedChartVersion.metricQuery.limit,
    );
    const limit = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.limit,
    );

    const selectedTimezone = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.timezone,
    );
    const setTimeZone = useExplorerContext(
        (context) => context.actions.setTimeZone,
    );

    const { getHasDashboardChanges } = useDashboardStorage();

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    const urlToShare = useMemo(() => {
        if (unsavedChartVersion) {
            const urlArgs = getExplorerUrlFromCreateSavedChartVersion(
                projectUuid,
                unsavedChartVersion,
                true,
            );
            return {
                pathname: urlArgs.pathname,
                search: `?${urlArgs.search}`,
            };
        }
    }, [unsavedChartVersion, projectUuid]);

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (getHasDashboardChanges()) {
                const message = t('components_explorer_header.unsaved_changes');
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => {
            window.removeEventListener('beforeunload', checkReload);
        };
    }, [getHasDashboardChanges, t]);

    // FEATURE FLAG: this component doesn't appear when the feature flag is disabled
    const userTimeZonesEnabled = useFeatureFlagEnabled(
        FeatureFlags.EnableUserTimezones,
    );

    return (
        <Group position="apart">
            <Box>
                <RefreshDbtButton />
            </Box>

            <Group spacing="xs">
                {showLimitWarning && (
                    <Tooltip
                        width={400}
                        label={t(
                            'components_explorer_header.tooltip_limit.label',
                            {
                                limit,
                            },
                        )}
                        multiline
                        position={'bottom'}
                    >
                        <Badge
                            leftSection={
                                <MantineIcon
                                    icon={IconAlertCircle}
                                    size={'sm'}
                                />
                            }
                            color="yellow"
                            variant="outline"
                            tt="none"
                            sx={{ cursor: 'help' }}
                        >
                            {t(
                                'components_explorer_header.tooltip_limit.content',
                            )}
                        </Badge>
                    </Tooltip>
                )}

                {userTimeZonesEnabled && (
                    <TimeZonePicker
                        onChange={setTimeZone}
                        value={selectedTimezone}
                    />
                )}

                <RefreshButton size="xs" />

                {!savedChart && userCanCreateCharts && (
                    <SaveChartButton isExplorer />
                )}
                <ShareShortLinkButton
                    disabled={!isValidQuery}
                    url={urlToShare}
                />
            </Group>
        </Group>
    );
});

export default ExplorerHeader;
