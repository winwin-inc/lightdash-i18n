import { Group, Loader, Select, SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import PaginateControl from '../../PaginateControl';
import { TableFooter } from '../Table.styles';
import {
    DEFAULT_PAGE_SIZE,
    TABLE_PAGINATION_PAGE_SIZES,
} from '../constants';
import {
    compactSelectStyles,
} from '../paginationCompactStyles';
import { useTableContext } from '../useTableContext';

interface ResultCountProps {
    count: number;
    shown?: number;
    alignEnd?: boolean;
    variant?: 'default' | 'warehouse';
    isLoading?: boolean;
    isError?: boolean;
}

export const ResultCount: FC<ResultCountProps> = ({
    count,
    shown,
    alignEnd = false,
    variant = 'default',
    isLoading = false,
    isError = false,
}) => {
    const { t } = useTranslation();

    if (variant === 'warehouse') {
        if (isLoading) {
            return (
                <Group spacing={6} align="center" noWrap>
                    <Loader size="xs" />
                    <Text fz="xs" c="dimmed" m={0} lh={1}>
                        {t('components_common_table.pagination.loading_count')}
                    </Text>
                </Group>
            );
        }

        if (isError) {
            return (
                <Text fz="xs" c="dimmed" m={0} lh={1}>
                    {t('components_common_table.pagination.count_error')}
                </Text>
            );
        }

        return (
            <Text fz="xs" c="dimmed" m={0} lh={1}>
                {t('components_common_table.pagination.total_data_prefix')}
                <Text span fw={600} c="blue.6">
                    {count.toLocaleString()}
                </Text>
                {t('components_common_table.pagination.total_data_suffix')}
            </Text>
        );
    }

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

    const isServerPagination =
        pagination?.mode === 'server' ||
        Boolean(pagination?.show && pagination?.hideScrollToggle);
    const isChartPagination = Boolean(
        pagination?.show &&
            (isServerPagination || pagination?.hideScrollToggle),
    );
    const pageCount = table.getPageCount();
    const pageSize = table.getState().pagination.pageSize;

    if (isChartPagination) {
        return (
            <TableFooter $compact>
                <Group align="center" noWrap>
                    {pagination?.showResultsTotal ? (
                        <ResultCount
                            count={totalRowsCount}
                            variant="warehouse"
                            isLoading={Boolean(pagination?.isCountLoading)}
                            isError={Boolean(pagination?.isCountError)}
                        />
                    ) : (
                        <div />
                    )}
                </Group>
                <Group spacing={4} noWrap align="center">
                    {pagination?.onPageSizeChange ? (
                        <Group spacing={4} noWrap align="center">
                            <Text
                                fz="xs"
                                c="dimmed"
                                m={0}
                                lh={1}
                                sx={{ whiteSpace: 'nowrap' }}
                            >
                                {t(
                                    'components_common_table.pagination.page_size_prefix',
                                )}
                            </Text>
                            <Select
                                size="xs"
                                w={68}
                                styles={compactSelectStyles}
                                value={String(pageSize)}
                                data={Array.from(
                                    new Set([
                                        ...TABLE_PAGINATION_PAGE_SIZES,
                                        pageSize,
                                    ]),
                                )
                                    .sort((a, b) => a - b)
                                    .map((size) => ({
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
                            <Text
                                fz="xs"
                                c="dimmed"
                                m={0}
                                lh={1}
                                sx={{ whiteSpace: 'nowrap' }}
                            >
                                {t(
                                    'components_common_table.pagination.page_size_suffix',
                                )}
                            </Text>
                        </Group>
                    ) : null}
                    <PaginateControl
                        compact
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

    const showScrollToggle =
        Boolean(pagination?.show) && data.length > DEFAULT_PAGE_SIZE;
    const showClientPager =
        !isInfiniteScrollEnabled && Boolean(pagination?.show) && pageCount > 1;
    const showResultCountOnly =
        !showClientPager && Boolean(pagination?.showResultsTotal);

    if (!showScrollToggle && !showClientPager && !showResultCountOnly) {
        return null;
    }

    return (
        <TableFooter>
            {showScrollToggle ? (
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

            {showClientPager ? (
                <PaginateControl
                    currentPage={table.getState().pagination.pageIndex + 1}
                    totalPages={pageCount}
                    onPreviousPage={table.previousPage}
                    onNextPage={table.nextPage}
                    hasPreviousPage={table.getCanPreviousPage()}
                    hasNextPage={table.getCanNextPage()}
                    onPageChange={(page) => table.setPageIndex(page - 1)}
                />
            ) : showResultCountOnly ? (
                <ResultCount count={totalRowsCount} alignEnd />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
