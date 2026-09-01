import {
    Button,
    Group,
    Kbd,
    Text,
    Tooltip,
    rgba,
    type MantineSize,
} from '@mantine-8/core';
import { useHotkeys, useOs } from '@mantine-8/hooks';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
import { memo, useCallback, useTransition, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    explorerActions,
    selectIsValidQuery,
    selectQueryLimit,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useMergeSetup } from '../features/mergeQuery/hooks/useMergeSetup';
import useHealth from '../hooks/health/useHealth';
import { useExplorerQuery } from '../hooks/useExplorerQuery';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import RunQuerySettings from './RunQuerySettings';
import MantineIcon from './common/MantineIcon';

export const RefreshButton: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [, startTransition] = useTransition();
    const health = useHealth();
    const maxLimit = health.data?.query.maxLimit ?? 5000;

    const os = useOs();

    // Get state and actions from Redux
    const limit = useExplorerSelector(selectQueryLimit);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const dispatch = useExplorerDispatch();

    // Get query state and actions from hooks
    const { isLoading, fetchResults, cancelQuery } = useExplorerQuery();

    const setRowLimit = useCallback(
        (newLimit: number) => {
            dispatch(explorerActions.setRowLimit(newLimit));
        },
        [dispatch],
    );

    const { t } = useTranslation();

    // A configured merge is what the explorer runs, so this is the control that
    // runs it. Two run buttons for one result is how you end up with a chart
    // showing the answer to a question nobody asked.
    const merge = useMergeSetup();
    const canRunQuery = merge.isMerging ? merge.canRun : isValidQuery;
    // A merge blocks the run for a reason it can name; a silently disabled
    // button makes the user hunt the sidebar for it.
    const mergeBlockedReason =
        merge.isMerging && !merge.canRun ? merge.blockingReason : null;

    const { track } = useTracking();

    const onClick = useCallback(() => {
        if (!canRunQuery) return;
        if (merge.isMerging) {
            merge.handleRun();
        } else {
            fetchResults();
        }
        track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
    }, [fetchResults, track, canRunQuery, merge]);

    useHotkeys([['mod + enter', onClick, { preventDefault: true }]]);

    return (
        <Button.Group>
            <Tooltip
                label={
                    mergeBlockedReason ?? (
                        <Group gap="xxs">
                            <Kbd fw={600}>
                                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                            </Kbd>

                            <Text fw={600}>+</Text>

                            <Kbd fw={600}>Enter</Kbd>
                        </Group>
                    )
                }
                position="bottom"
                withArrow
                withinPortal
                disabled={isLoading || (!canRunQuery && !mergeBlockedReason)}
            >
                <Button
                    size={size}
                    pr={limit ? 'xs' : undefined}
                    // data-disabled keeps the button hoverable so the
                    // tooltip can say why the merge cannot run yet.
                    disabled={!canRunQuery && !mergeBlockedReason}
                    data-disabled={mergeBlockedReason ? true : undefined}
                    aria-disabled={mergeBlockedReason ? true : undefined}
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    loading={isLoading || !!merge.isRunning}
                    onClick={onClick}
                    style={(theme) => ({
                        flex: 1,
                        borderRight: canRunQuery
                            ? `1px solid ${rgba(theme.colors.gray[5], 0.6)}`
                            : undefined,
                        borderTopRightRadius: 0,
                        borderBottomRightRadius: 0,
                        opacity: mergeBlockedReason ? 0.55 : undefined,
                        cursor: mergeBlockedReason
                            ? 'not-allowed'
                            : undefined,
                    })}
                    data-testid="RefreshButton/RunQueryButton"
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
                        style={{
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                        }}
                    >
                        <MantineIcon icon={IconX} size="sm" />
                    </Button>
                </Tooltip>
            ) : (
                <RunQuerySettings
                    disabled={!canRunQuery}
                    size={size}
                    maxLimit={maxLimit}
                    limit={limit}
                    onLimitChange={setRowLimit}
                    showAutoFetchSetting
                    targetProps={{
                        style: {
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                        },
                    }}
                />
            )}
        </Button.Group>
    );
});
