import { getItemMap } from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { memo, useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    selectAdditionalMetrics,
    selectColumnOrder,
    selectIsEditMode,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import { resolveMergeColumnOrder } from '../../../features/mergeQuery/utils/resolveMergeColumnOrder';
import { useColumns } from '../../../hooks/useColumns';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import type {
    useGetReadyQueryResults,
    useInfiniteQueryResults,
} from '../../../hooks/useQueryResults';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import Table from '../../common/Table';
import { JsonViewerModal } from '../../JsonViewerModal';
import CellContextMenu from './CellContextMenu';
import ColumnHeaderContextMenu from './ColumnHeaderContextMenu';
import {
    EmptyStateExploreLoading,
    EmptyStateNoColumns,
    EmptyStateNoTableData,
    MissingRequiredParameters,
    NoTableSelected,
} from './ExplorerResultsNonIdealStates';

const getQueryStatus = (
    query: ReturnType<typeof useGetReadyQueryResults>,
    queryResults: ReturnType<typeof useInfiniteQueryResults>,
): 'loading' | 'error' | 'idle' | 'success' => {
    const isCreatingQuery = query.isFetching;
    const isFetchingFirstPage = queryResults.isFetchingFirstPage;

    // Don't return queryResults.status because we changed from mutation to query so 'loading' has a different meaning
    if (queryResults.error || query.error) {
        return 'error';
    } else if (isCreatingQuery || isFetchingFirstPage) {
        return 'loading';
    } else if (query.status === 'loading' || !query.isFetched) {
        return 'idle';
    } else if (query.status === 'success') {
        return 'success';
    } else {
        return 'error';
    }
};

export const ExplorerResults = memo(() => {
    const { t } = useTranslation();

    const columns = useColumns();
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const activeTableName = useExplorerSelector(selectTableName);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    // Get chart config for column properties
    const chartConfig = useExplorerContext(
        (context) => context.state.unsavedChartVersion.chartConfig,
    );
    const columnProperties =
        chartConfig.type === 'table' && chartConfig.config?.columns
            ? chartConfig.config.columns
            : undefined;

    // Get query state from new hook
    const {
        query,
        queryResults,
        unpivotedQuery,
        unpivotedQueryResults,
        missingRequiredParameters,
    } = useExplorerQuery();

    const merge = useMergeSafe();
    const mergeResults = merge?.mergeResults ?? null;

    const dimensions =
        mergeResults?.metricQuery.dimensions ??
        query.data?.metricQuery?.dimensions ??
        [];
    const metrics =
        mergeResults?.metricQuery.metrics ??
        query.data?.metricQuery?.metrics ??
        [];
    const explorerColumnOrder = useExplorerSelector(selectColumnOrder);
    const resultsColumnOrder = mergeResults
        ? resolveMergeColumnOrder(mergeResults.columnOrder, explorerColumnOrder)
        : explorerColumnOrder;

    const hasPivotConfig = useExplorerContext(
        (context) => !!context.state.unsavedChartVersion.pivotConfig,
    );

    const resultsData = useMemo(() => {
        // A configured merge is the explorer's result, so the table reads it
        // instead of the query it was built from.
        if (mergeResults) {
            const unpivotedRunError = merge?.unpivotedRunError;
            const unpivotedRunErrors = merge?.unpivotedRunErrors ?? [];
            if (unpivotedRunError || unpivotedRunErrors.length > 0) {
                return {
                    rows: [],
                    totalResults: 0,
                    isFetchingRows: false,
                    fetchMoreRows: () => {},
                    status: 'error' as const,
                    apiError:
                        unpivotedRunError ??
                        ({
                            status: 'error',
                            error: {
                                name: 'Error',
                                statusCode: 400,
                                message: unpivotedRunErrors
                                    .map((error) => error.message)
                                    .join(' '),
                                data: {},
                            },
                        } as const),
                };
            }
            const rawResults =
                mergeResults.unpivotedResults ?? mergeResults.results;
            return {
                rows: rawResults.rows,
                totalResults: rawResults.totalResults,
                isFetchingRows: rawResults.isFetchingRows && !rawResults.error,
                fetchMoreRows: rawResults.fetchMoreRows,
                status: rawResults.error
                    ? ('error' as const)
                    : ('success' as const),
                apiError: rawResults.error ?? undefined,
            };
        }

        if (
            merge?.isMerging &&
            (merge.runError || merge.runErrors.length > 0)
        ) {
            return {
                rows: [],
                totalResults: 0,
                isFetchingRows: false,
                fetchMoreRows: () => {},
                status: 'error' as const,
                apiError:
                    merge.runError ??
                    ({
                        status: 'error',
                        error: {
                            name: 'Error',
                            statusCode: 400,
                            message: merge.runErrors
                                .map((error) => error.message)
                                .join(' '),
                            data: {},
                        },
                    } as const),
            };
        }

        if (merge?.isMerging && (merge.isRunning || merge.wasRestored)) {
            return {
                rows: [],
                totalResults: undefined,
                isFetchingRows: true,
                fetchMoreRows: () => {},
                status: 'loading' as const,
                apiError: undefined,
            };
        }

        const hasUnpivotedQuery = !!unpivotedQuery?.data?.queryUuid;

        // Use unpivoted rows for the results table whenever a companion
        // unpivoted query exists (main query may be pivoted for charts even
        // when UseSqlPivotResults is off).
        const shouldUseUnpivotedData = hasPivotConfig && hasUnpivotedQuery;

        if (shouldUseUnpivotedData) {
            return {
                rows: unpivotedQueryResults.rows,
                totalResults: unpivotedQueryResults.totalResults,
                isFetchingRows:
                    unpivotedQueryResults.isFetchingRows &&
                    !unpivotedQueryResults.error,
                fetchMoreRows: unpivotedQueryResults.fetchMoreRows,
                status: getQueryStatus(unpivotedQuery, unpivotedQueryResults),
                apiError: unpivotedQuery.error ?? unpivotedQueryResults.error,
            };
        }

        const finalStatus = getQueryStatus(query, queryResults);
        const result = {
            rows: queryResults.rows,
            totalResults: queryResults.totalResults,
            isFetchingRows: queryResults.isFetchingRows && !queryResults.error,
            fetchMoreRows: queryResults.fetchMoreRows,
            status: finalStatus,
            apiError: query.error ?? queryResults.error,
        };

        return result;
    }, [
        mergeResults,
        merge?.isMerging,
        merge?.isRunning,
        merge?.wasRestored,
        merge?.runError,
        merge?.runErrors,
        merge?.unpivotedRunError,
        merge?.unpivotedRunErrors,
        hasPivotConfig,
        query,
        queryResults,
        unpivotedQuery,
        unpivotedQueryResults,
    ]);

    const {
        rows,
        totalResults: totalRows,
        isFetchingRows,
        fetchMoreRows,
        status,
        apiError,
    } = resultsData;

    const setColumnOrder = useExplorerContext(
        (context) => context.actions.setColumnOrder,
    );
    const { data: exploreData, isInitialLoading: isExploreLoading } =
        useExplore(activeTableName, {
            refetchOnMount: false,
        });
    const [isExpandModalOpened, setIsExpandModalOpened] = useState(false);
    const [expandData, setExpandData] = useState<{
        name: string;
        jsonObject: Record<string, unknown>;
    }>({
        name: 'unknown',
        jsonObject: {},
    });

    const handleCellExpand = (name: string, data: Record<string, unknown>) => {
        setExpandData({
            name: name,
            jsonObject: data,
        });
        setIsExpandModalOpened(true);
    };

    const itemsMap = useMemo(() => {
        if (mergeResults) return mergeResults.fields;
        if (exploreData) {
            return getItemMap(
                exploreData,
                additionalMetrics,
                tableCalculations,
            );
        }
        return undefined;
    }, [mergeResults, exploreData, additionalMetrics, tableCalculations]);

    const cellContextMenu = useCallback(
        (props: any) => (
            <CellContextMenu
                isEditMode={isEditMode}
                {...props}
                itemsMap={itemsMap}
                onExpand={handleCellExpand}
            />
        ),
        [isEditMode, itemsMap],
    );

    const IdleState: FC = useCallback(() => {
        const description =
            dimensions.length <= 0 ? (
                <>
                    {t(
                        'components_explorer_results_card_explorer_results.has_dimensions.part_1',
                    )}{' '}
                    <Text span color="blue.9">
                        {t(
                            'components_explorer_results_card_explorer_results.has_dimensions.part_2',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_explorer_results.has_dimensions.part_3',
                    )}
                </>
            ) : metrics.length <= 0 ? (
                <>
                    {t(
                        'components_explorer_results_card_explorer_results.has_metrics.part_1',
                    )}{' '}
                    <Text span color="yellow.9">
                        {t(
                            'components_explorer_results_card_explorer_results.has_metrics.part_2',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_explorer_results.has_metrics.part_3',
                    )}
                </>
            ) : (
                <>
                    {t('components_explorer_results_card_explorer_results.tip')}
                </>
            );

        return <EmptyStateNoTableData description={description} />;
    }, [dimensions.length, metrics.length, t]);

    const pagination = useMemo(
        () => ({
            show: true,
            showResultsTotal: true,
        }),
        [],
    );
    const footer = useMemo(
        () => ({
            show: true,
        }),
        [],
    );

    if (!activeTableName) return <NoTableSelected />;

    if (columns.length === 0) return <EmptyStateNoColumns />;

    if (isExploreLoading) return <EmptyStateExploreLoading />;

    if (missingRequiredParameters && missingRequiredParameters.length > 0)
        return (
            <MissingRequiredParameters
                missingRequiredParameters={missingRequiredParameters}
            />
        );

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box px="xs" py="lg" data-testid="results-table-container">
                <Table
                    status={status}
                    errorDetail={apiError?.error}
                    data={rows || []}
                    totalRowsCount={totalRows || 0}
                    isFetchingRows={isFetchingRows}
                    fetchMoreRows={fetchMoreRows}
                    columns={columns}
                    columnOrder={resultsColumnOrder}
                    onColumnOrderChange={setColumnOrder}
                    cellContextMenu={cellContextMenu}
                    headerContextMenu={
                        isEditMode ? ColumnHeaderContextMenu : undefined
                    }
                    idleState={IdleState}
                    pagination={pagination}
                    footer={footer}
                    showSubtotals={false}
                    columnProperties={columnProperties}
                />
                <JsonViewerModal
                    heading={`Field: ${expandData.name}`}
                    jsonObject={expandData.jsonObject}
                    opened={isExpandModalOpened}
                    onClose={() => setIsExpandModalOpened(false)}
                />
            </Box>
        </TrackSection>
    );
});
