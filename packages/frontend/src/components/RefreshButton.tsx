import {
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
    type MantineSize,
} from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
import { memo, useCallback, useTransition, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useHealth from '../hooks/health/useHealth';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import LimitButton from './LimitButton';
import MantineIcon from './common/MantineIcon';

export const RefreshButton: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [, startTransition] = useTransition();
    const health = useHealth();
    const maxLimit = health.data?.query.maxLimit ?? 5000;

    const os = useOs();
    const limit = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.limit,
    );
    const setRowLimit = useExplorerContext(
        (context) => context.actions.setRowLimit,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const isLoading = useExplorerContext((context) => {
        const isCreatingQuery = context.query.isFetching;
        const isFetchingFirstPage = context.queryResults.isFetchingFirstPage;
        const isFetchingAllRows = context.queryResults.isFetchingAllPages;
        const isQueryError = context.queryResults.error;
        return (
            (isCreatingQuery || isFetchingFirstPage || isFetchingAllRows) &&
            !isQueryError
        );
    });
    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );
    const cancelQuery = useExplorerContext(
        (context) => context.actions.cancelQuery,
    );

    const { t } = useTranslation();

    const canRunQuery = isValidQuery;

    const { track } = useTracking();

    const onClick = useCallback(() => {
        if (canRunQuery) {
            fetchResults();
            track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
        }
    }, [fetchResults, track, canRunQuery]);

    useHotkeys([['mod + enter', onClick, { preventDefault: true }]]);

    return (
        <Button.Group>
            <Tooltip
                label={
                    <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                        <Group spacing="xxs">
                            <Kbd fw={600}>
                                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                            </Kbd>

                            <Text fw={600}>+</Text>

                            <Kbd fw={600}>Enter</Kbd>
                        </Group>
                    </MantineProvider>
                }
                position="bottom"
                withArrow
                withinPortal
                disabled={isLoading || !isValidQuery}
            >
                <Button
                    pr="xxs"
                    size={size}
                    disabled={!isValidQuery}
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    loading={isLoading}
                    onClick={onClick}
                    sx={(theme) => ({
                        flex: 1,
                        borderRight: `1px solid ${theme.fn.rgba(
                            theme.colors.gray[5],
                            0.6,
                        )}`,
                    })}
                >
                    {t('components_refresh_button.run_query')} ({limit})
                </Button>
            </Tooltip>

            {isLoading ? (
                <Tooltip
                    label={t('components_refresh_button.cancel_query')}
                    position="bottom"
                    withArrow
                    withinPortal
                >
                    <Button
                        size={size}
                        p="xs"
                        onClick={() =>
                            startTransition(() => {
                                cancelQuery();
                            })
                        }
                    >
                        <MantineIcon icon={IconX} size="sm" />
                    </Button>
                </Tooltip>
            ) : (
                <LimitButton
                    disabled={!isValidQuery}
                    size={size}
                    maxLimit={maxLimit}
                    limit={limit}
                    onLimitChange={setRowLimit}
                />
            )}
        </Button.Group>
    );
});
