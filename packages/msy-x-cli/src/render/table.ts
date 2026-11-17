import { cellToString } from './csv';

/** 单元格显示上限：超出截断并加省略号（§7.5） */
const MAX_CELL_WIDTH = 40;

/** 列最小可用宽度；低于此宽度宁可裁列 */
const MIN_COLUMN_WIDTH = 3;

/** 每列固定开销：`| ` + ` |` = 3；整表末尾还有一个 `|` */
const OVERHEAD_PER_COLUMN = 3;

const BORDER_OVERHEAD = 1;

const ELLIPSIS = '…';

export type RenderTableOptions = {
    /** 终端宽度；缺省取 process.stdout.columns，仍取不到用 100 */
    width?: number | null;
};

const truncateCell = (value: string, maxWidth: number): string => {
    const chars = Array.from(value);
    if (chars.length <= maxWidth) {
        return value;
    }
    return `${chars.slice(0, Math.max(maxWidth - 1, 0)).join('')}${ELLIPSIS}`;
};

const terminalWidth = (fallback?: number | null): number => {
    if (typeof fallback === 'number' && fallback > 0) {
        return fallback;
    }
    const { columns } = process.stdout;
    return typeof columns === 'number' && columns > 0 ? columns : 100;
};

/** 行内所有键的并集，按首次出现顺序；webUrl 字段存在时移到最后一列（§7.5） */
const layoutColumns = (rows: Array<Record<string, unknown>>): string[] => {
    const columns: string[] = [];
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!columns.includes(key)) {
                columns.push(key);
            }
        }
    }
    if (columns.includes('webUrl')) {
        return [
            ...columns.filter((column) => column !== 'webUrl'),
            'webUrl',
        ];
    }
    return columns;
};

/**
 * ASCII 表格（`+ - |`）。空结果返回 `(no rows)`。
 * 单列上限 40 字符；终端宽度不够时按列均分裁宽，仍不够则从末尾裁列
 * （裁列提示由调用方写 stderr，本函数只返回字符串）。
 */
export const renderTable = (
    rows: Array<Record<string, unknown>>,
    options: RenderTableOptions = {},
): string => {
    if (rows.length === 0) {
        return '(no rows)';
    }

    const maxWidth = terminalWidth(options.width);
    let columns = layoutColumns(rows);

    // 均分后每列可得的宽度上限；装不下最小宽度就从末尾裁列，至少保留 1 列
    const widthCap = (columnCount: number): number =>
        Math.floor((maxWidth - BORDER_OVERHEAD) / columnCount) -
        OVERHEAD_PER_COLUMN;
    while (columns.length > 1 && widthCap(columns.length) < MIN_COLUMN_WIDTH) {
        columns = columns.slice(0, -1);
    }
    const cap = Math.max(widthCap(columns.length), MIN_COLUMN_WIDTH);

    const cellWidths = columns.map((column) => {
        const natural = rows.reduce((max, row) => {
            const cell = truncateCell(
                cellToString(row[column]),
                Math.min(MAX_CELL_WIDTH, cap),
            );
            return Math.max(max, Array.from(cell).length);
        }, Array.from(column).length);
        return Math.min(natural, MAX_CELL_WIDTH, cap);
    });

    const padCell = (value: string, width: number) =>
        truncateCell(value, width).padEnd(width, ' ');

    const border = `+${cellWidths
        .map((width) => '-'.repeat(width + 2))
        .join('+')}+`;
    const formatLine = (cells: string[]) =>
        `| ${cells
            .map((cell, i) => padCell(cell, cellWidths[i]))
            .join(' | ')} |`;

    const header = columns;
    const lines: string[] = [border, formatLine(header), border];
    for (const row of rows) {
        lines.push(formatLine(columns.map((column) => cellToString(row[column]))));
    }
    lines.push(border);
    return lines.join('\n');
};
