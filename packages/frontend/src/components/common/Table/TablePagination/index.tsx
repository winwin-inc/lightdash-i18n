import { Group, SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import PaginateControl from '../../PaginateControl';
import { TableFooter } from '../Table.styles';
import { DEFAULT_PAGE_SIZE } from '../constants';
import { useTableContext } from '../useTableContext';

interface ResultCountProps {
    count: number;
    shown?: number;
    truncated?: boolean;
    maxBrowsableRows?: number;
}

export const ResultCount: FC<ResultCountProps> = ({
    count,
    shown,
    truncated,
    maxBrowsableRows,
}) => {
    const { t } = useTranslation();
    if (count === 0) {
        return null;
    }

    if (shown !== undefined && shown !== count) {
        return (
            <Text style={{ marginLeft: 'auto' }} fz="xs">
                {t('components_common_table.pagination.showing_of_total', {
                    shown,
                    total: count,
                })}
                {truncated && maxBrowsableRows
                    ? t(
                          'components_common_table.pagination.browse_limit_hint',
                          { limit: maxBrowsableRows },
                      )
                    : null}
            </Text>
        );
    }

    return (
        <Text style={{ marginLeft: 'auto' }} fz="xs">
            {count === 1
                ? t('components_common_table.pagination.one_result')
                : t('components_common_table.pagination.n_results', { count })}
        </Text>
    );
};

const TablePagination: FC = () => {
    const { t } = useTranslation();
    const {
        table,
        data,
        pagination,
        totalRowsCount,
        isInfiniteScrollEnabled,
        setIsInfiniteScrollEnabled,
    } = useTableContext();

    const isServerPagination = pagination?.mode === 'server';
    const pageCount = table.getPageCount();
    const showPageControls =
        !isInfiniteScrollEnabled && (isServerPagination || pageCount > 1);
    const shownCount = isServerPagination
        ? data.length
        : Math.min(
              data.length,
              table.getState().pagination.pageSize,
          );

    return (
        <TableFooter>
            {pagination?.show &&
                !isServerPagination &&
                data.length > DEFAULT_PAGE_SIZE && (
                    <SegmentedControl
                        data={[
                            {
                                label: t(
                                    'components_common_table.pagination.pages',
                                ),
                                value: 'pages',
                            },
                            {
                                label: t(
                                    'components_common_table.pagination.scroll',
                                ),
                                value: 'scroll',
                            },
                        ]}
                        value={isInfiniteScrollEnabled ? 'scroll' : 'pages'}
                        onChange={(value) => {
                            setIsInfiniteScrollEnabled(value === 'scroll');
                        }}
                    />
                )}

            <Group spacing="sm" style={{ marginLeft: 'auto' }}>
                {showPageControls ? (
                    <PaginateControl
                        currentPage={
                            table.getState().pagination.pageIndex + 1
                        }
                        totalPages={Math.max(pageCount, 1)}
                        onPreviousPage={table.previousPage}
                        onNextPage={table.nextPage}
                        hasPreviousPage={table.getCanPreviousPage()}
                        hasNextPage={table.getCanNextPage()}
                    />
                ) : null}
                {pagination?.showResultsTotal ? (
                    <ResultCount
                        count={totalRowsCount}
                        shown={
                            isServerPagination || showPageControls
                                ? shownCount
                                : undefined
                        }
                        truncated={pagination.truncatedTotal}
                        maxBrowsableRows={pagination.maxBrowsableRows}
                    />
                ) : null}
            </Group>
        </TableFooter>
    );
};

export default TablePagination;
