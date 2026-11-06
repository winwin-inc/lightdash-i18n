import { useCallback, useEffect, useRef } from 'react';
import { clampColumnWidth } from '../../../hooks/tableVisualization/columnWidth';
import resizeHandleStyles from './ResizeHandle.module.css';

export { clampColumnWidth } from '../../../hooks/tableVisualization/columnWidth';

type UseColumnResizeProps = {
    /** `null` means "reset to automatic width" */
    onColumnWidthChange?: (columnId: string, width: number | null) => void;
};

type UseColumnResizeReturn = {
    handleResizeStart: (e: React.MouseEvent, columnId: string) => void;
    handleResizeReset: (e: React.MouseEvent, columnId: string) => void;
    resizeHandleClassName: string;
};

type ResizeState = {
    columnId: string;
    startX: number;
    startWidth: number;
    thElement: HTMLElement;
    handleElement: HTMLElement;
};

/**
 * Vertical cell selector for a given column index (1-based).
 * Grouped headers (colSpan > 1) are skipped, they span several columns.
 */
const getColumnCells = (tableEl: HTMLElement, colIndex: number) =>
    Array.from(
        tableEl.querySelectorAll<HTMLTableCellElement>(
            `thead th:nth-child(${colIndex}), tbody td:nth-child(${colIndex}), tbody th:nth-child(${colIndex}), tfoot td:nth-child(${colIndex}), tfoot th:nth-child(${colIndex})`,
        ),
    ).filter((cell) => cell.colSpan <= 1);

const applyWidthToCells = (
    cells: HTMLTableCellElement[],
    widthPx: string | null,
) => {
    for (const cell of cells) {
        if (widthPx === null) {
            cell.style.width = '';
            cell.style.minWidth = '';
            cell.style.maxWidth = '';
        } else {
            cell.style.width = widthPx;
            cell.style.minWidth = widthPx;
            cell.style.maxWidth = widthPx;
        }
    }
};

export const useColumnResize = ({
    onColumnWidthChange,
}: UseColumnResizeProps): UseColumnResizeReturn => {
    const resizeRef = useRef<ResizeState | null>(null);

    // Keep the latest callback without re-binding document listeners.
    const onColumnWidthChangeRef = useRef(onColumnWidthChange);
    onColumnWidthChangeRef.current = onColumnWidthChange;

    const resetInlineWidths = useCallback((state: ResizeState) => {
        const tableEl = state.thElement.closest('table');
        if (!tableEl) {
            return;
        }
        const colIndex =
            (state.thElement as HTMLTableCellElement).cellIndex + 1;
        const colEl = tableEl.querySelector<HTMLElement>(
            `colgroup col:nth-child(${colIndex})`,
        );
        if (colEl) {
            colEl.style.width = '';
        }
        applyWidthToCells(getColumnCells(tableEl, colIndex), null);
    }, []);

    const stopDragging = useCallback((state: ResizeState) => {
        state.handleElement.classList.remove(
            resizeHandleStyles.resizeHandleActive,
        );
        resizeRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const state = resizeRef.current;
            if (!state) return;

            const deltaX = e.clientX - state.startX;
            const newWidth = clampColumnWidth(state.startWidth + deltaX);
            const widthPx = `${newWidth}px`;

            state.thElement.style.width = widthPx;
            state.thElement.style.minWidth = widthPx;
            state.thElement.style.maxWidth = widthPx;

            const tableEl = state.thElement.closest('table');
            if (!tableEl) return;

            const colIndex =
                (state.thElement as HTMLTableCellElement).cellIndex + 1;

            const colEl = tableEl.querySelector<HTMLElement>(
                `colgroup col:nth-child(${colIndex})`,
            );
            if (colEl) {
                colEl.style.width = widthPx;
            }

            // The handle lives inside <th>, so it is already up to date.
            applyWidthToCells(getColumnCells(tableEl, colIndex), widthPx);
        };

        const handleMouseUp = (e: MouseEvent) => {
            const state = resizeRef.current;
            if (!state) return;

            const deltaX = e.clientX - state.startX;
            const newWidth = clampColumnWidth(state.startWidth + deltaX);

            stopDragging(state);

            // Hand over to React: drop the manual inline widths so the persisted
            // value (or the automatic width, on reset) decides the layout.
            resetInlineWidths(state);
            onColumnWidthChangeRef.current?.(state.columnId, newWidth);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || !resizeRef.current) return;
            const state = resizeRef.current;
            stopDragging(state);
            resetInlineWidths(state);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [resetInlineWidths, stopDragging]);

    const handleResizeStart = useCallback(
        (e: React.MouseEvent, columnId: string) => {
            e.preventDefault();
            e.stopPropagation();

            const handleElement = e.currentTarget as HTMLElement;
            const thElement = handleElement.closest('th');
            if (!thElement) return;

            resizeRef.current = {
                columnId,
                startX: e.clientX,
                startWidth: thElement.getBoundingClientRect().width,
                thElement,
                handleElement,
            };

            handleElement.classList.add(resizeHandleStyles.resizeHandleActive);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        },
        [],
    );

    const handleResizeReset = useCallback(
        (e: React.MouseEvent, columnId: string) => {
            e.preventDefault();
            e.stopPropagation();

            const handleElement = e.currentTarget as HTMLElement;
            const thElement = handleElement.closest('th');
            if (thElement) {
                resetInlineWidths({
                    columnId,
                    startX: 0,
                    startWidth: 0,
                    thElement,
                    handleElement,
                });
            }
            onColumnWidthChangeRef.current?.(columnId, null);
        },
        [resetInlineWidths],
    );

    return {
        handleResizeStart,
        handleResizeReset,
        resizeHandleClassName: resizeHandleStyles.resizeHandle,
    };
};
