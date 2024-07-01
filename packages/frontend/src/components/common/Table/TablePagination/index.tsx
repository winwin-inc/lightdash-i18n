import { Button, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../MantineIcon';
import { TableFooter } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../types';

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
    const { table, data, pagination } = useTableContext();

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
                    value={
                        table.getState().pagination.pageSize ===
                        DEFAULT_PAGE_SIZE
                            ? 'pages'
                            : 'scroll'
                    }
                    onChange={(value) => {
                        table.setPageSize(
                            value === 'pages'
                                ? DEFAULT_PAGE_SIZE
                                : MAX_PAGE_SIZE,
                        );
                    }}
                />
            )}

            {table.getPageCount() > 1 ? (
                <Group>
                    <Text color="gray.7" size="xs">
                        {t('components_common_table.pagination.page')}{' '}
                        <Text span fw={600} color="black">
                            {table.getState().pagination.pageIndex + 1}
                        </Text>{' '}
                        {t('components_common_table.pagination.of')}{' '}
                        <Text span fw={600} color="black">
                            {table.getPageCount()}
                        </Text>
                    </Text>

                    <Button.Group>
                        <Button
                            size="xs"
                            variant="outline"
                            color="gray.7"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <MantineIcon icon={IconChevronLeft} />
                        </Button>

                        <Button
                            size="xs"
                            variant="outline"
                            color="gray.7"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            <MantineIcon icon={IconChevronRight} />
                        </Button>
                    </Button.Group>
                </Group>
            ) : pagination?.showResultsTotal ? (
                <ResultCount
                    count={table.getPreGroupedRowModel().rows.length}
                />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
