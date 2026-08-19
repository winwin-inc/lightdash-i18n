import { Group, Select, SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import PaginateControl from '../../PaginateControl';
import { TableFooter } from '../Table.styles';
import {
    DEFAULT_PAGE_SIZE,
    TABLE_PAGINATION_PAGE_SIZES,
} from '../constants';
import { useTableContext } from '../useTableContext';

interface ResultCountProps {
    count: number;
    shown?: number;
    alignEnd?: boolean;
}

export const ResultCount: FC<ResultCountProps> = ({
    count,
    shown,
    alignEnd = false,
}) => {
    const { t } = useTranslation();
    if (count === 0) {
        return null;
    }

    const style = alignEnd ? { marginLeft: 'auto' } : undefined;

    if (shown !== undefined && shown !== count) {
        return (
            <Text style={style} fz="xs">
                {t('components_common_table.pagination.showing_of_total', {
                    shown,
                    total: count,
                })}
            </Text>
        );
    }

    return (
        <Text style={style} fz="xs">
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
    const isChartPagination = Boolean(
        isServerPagination || pagination?.hideScrollToggle,
    );
    const pageCount = table.getPageCount();
    const pageSize = table.getState().pagination.pageSize;
    const shownCount = isServerPagination
        ? data.length
        : Math.min(data.length, pageSize);

    if (isChartPagination) {
        return (
            <TableFooter>
                {pagination?.showResultsTotal ? (
                    <ResultCount
                        count={totalRowsCount}
                        shown={shownCount}
                    />
                ) : (
                    <div />
                )}
                <Group spacing="sm" noWrap>
                    {pagination?.onPageSizeChange ? (
                        <Select
                            size="xs"
                            w={90}
                            value={String(pageSize)}
                            data={TABLE_PAGINATION_PAGE_SIZES.map((size) => ({
                                value: String(size),
                                label: String(size),
                            }))}
                            onChange={(value) => {
                                if (value) {
                                    pagination.onPageSizeChange?.(
                                        Number(value),
                                    );
                                }
                            }}
                            aria-label={t(
                                'components_common_table.pagination.page_size',
                            )}
                        />
                    ) : null}
                    <PaginateControl
                        currentPage={
                            table.getState().pagination.pageIndex + 1
                        }
                        totalPages={Math.max(pageCount, 1)}
                        onPreviousPage={table.previousPage}
                        onNextPage={table.nextPage}
                        hasPreviousPage={table.getCanPreviousPage()}
                        hasNextPage={table.getCanNextPage()}
                        onPageChange={(page) =>
                            table.setPageIndex(page - 1)
                        }
                    />
                </Group>
            </TableFooter>
        );
    }

    return (
        <TableFooter>
            {pagination?.show && data.length > DEFAULT_PAGE_SIZE ? (
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
            ) : null}

            {!isInfiniteScrollEnabled && pageCount > 1 ? (
                <PaginateControl
                    currentPage={table.getState().pagination.pageIndex + 1}
                    totalPages={pageCount}
                    onPreviousPage={table.previousPage}
                    onNextPage={table.nextPage}
                    hasPreviousPage={table.getCanPreviousPage()}
                    hasNextPage={table.getCanNextPage()}
                />
            ) : pagination?.showResultsTotal ? (
                <ResultCount count={totalRowsCount} alignEnd />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
