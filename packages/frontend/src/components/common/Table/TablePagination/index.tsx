import { SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import PaginateControl from '../../PaginateControl';
import { TableFooter } from '../Table.styles';
import { DEFAULT_PAGE_SIZE } from '../constants';
import { useTableContext } from '../useTableContext';

interface ResultCountProps {
    count: number;
}

export const ResultCount: FC<ResultCountProps> = ({ count }) => (
    <Text style={{ marginLeft: 'auto' }} fz="xs">
        {count === 0 ? null : count === 1 ? '1 result' : `${count} results`}
    </Text>
);

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

    return (
        <TableFooter>
            {pagination?.show && data.length > DEFAULT_PAGE_SIZE && (
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

            {!isInfiniteScrollEnabled && table.getPageCount() > 1 ? (
                <PaginateControl
                    currentPage={table.getState().pagination.pageIndex + 1}
                    totalPages={table.getPageCount()}
                    onPreviousPage={table.previousPage}
                    onNextPage={table.nextPage}
                    hasPreviousPage={table.getCanPreviousPage()}
                    hasNextPage={table.getCanNextPage()}
                />
            ) : pagination?.showResultsTotal ? (
                <ResultCount count={totalRowsCount} />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
