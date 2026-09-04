import { useLayoutEffect, useRef, type FC } from 'react';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../useTableContext';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

/** Subpixel / border rounding often leaves 1px fake overflow on short pages. */
const SCROLL_OVERFLOW_TOLERANCE_PX = 2;

interface ScrollableTableProps {
    minimal?: boolean;
    showSubtotals?: boolean;
    $shouldExpand?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({
    minimal = true,
    showSubtotals = true,
    $shouldExpand = false,
}) => {
    const { footer, pagination, data } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const isChartPagination = Boolean(
        pagination?.show &&
            (pagination?.mode === 'server' || pagination?.hideScrollToggle),
    );

    // Warehouse-paginated tables: hide vertical scrollbar when the current
    // page fits (avoids a tiny scrollbar at pageSize 10 in dashboard tiles).
    useLayoutEffect(() => {
        const el = tableContainerRef.current;
        if (!el) {
            return undefined;
        }

        if (!isChartPagination) {
            el.style.overflowY = '';
            return undefined;
        }

        const syncOverflow = () => {
            const needsScroll =
                el.scrollHeight > el.clientHeight + SCROLL_OVERFLOW_TOLERANCE_PX;
            el.style.overflowY = needsScroll ? 'auto' : 'hidden';
        };

        syncOverflow();

        const observer = new ResizeObserver(syncOverflow);
        observer.observe(el);
        const tableEl = el.querySelector('table');
        if (tableEl) {
            observer.observe(tableEl);
        }

        return () => {
            observer.disconnect();
            el.style.overflowY = '';
        };
    }, [isChartPagination, data.length, pagination?.pageSize]);

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $fill={$shouldExpand}
        >
            <Table $showFooter={!!footer?.show}>
                <TableHeader minimal={minimal} showSubtotals={showSubtotals} />
                <TableBody
                    tableContainerRef={tableContainerRef}
                    minimal={minimal}
                />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
