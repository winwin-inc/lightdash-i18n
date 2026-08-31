import { Button, Stack } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ExploreEmptyQueryState } from '../../Explorer/ResultsCard/ExplorerResultsNonIdealStates';
import { EmptyState } from '../EmptyState';
import { useTableContext } from './useTableContext';

/**
 * Empty body for warehouse-paginated tables: when COUNT says there are rows
 * beyond this page's offset but the page query returned none, show the same
 * empty copy as a normal empty query, plus a short link back to page 1.
 */
const TableEmptyState: FC = () => {
    const { t } = useTranslation();
    const { data, pagination, totalRowsCount } = useTableContext();
    const isServerPagination =
        pagination?.mode === 'server' ||
        Boolean(pagination?.show && pagination?.hideScrollToggle);
    const pageIndex = pagination?.pageIndex ?? 0;
    const pageSize = pagination?.pageSize ?? 0;
    const offset = pageIndex * pageSize;
    const hasBrowsableRowsBeyondPage =
        isServerPagination &&
        data.length === 0 &&
        typeof totalRowsCount === 'number' &&
        totalRowsCount > offset &&
        pageIndex > 0;

    if (hasBrowsableRowsBeyondPage) {
        return (
            <EmptyState
                title={t(
                    'components_explorer_results_card_non_ideal_state.explore_empty_query_state.title',
                )}
                description={
                    <Stack spacing="sm" align="center">
                        {t(
                            'components_explorer_results_card_non_ideal_state.explore_empty_query_state.description',
                        )}
                        {pagination?.onPageChange ? (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => pagination.onPageChange?.(0)}
                            >
                                {t(
                                    'components_common_table.pagination.pagination_empty_page.back_to_first_page',
                                )}
                            </Button>
                        ) : null}
                    </Stack>
                }
            />
        );
    }

    return <ExploreEmptyQueryState />;
};

export default TableEmptyState;
