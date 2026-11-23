import {
    DimensionType,
    FieldType,
    ItemsMap,
    MetricQuery,
    MetricType,
    type Item,
} from '@lightdash/common';
import * as Excel from 'exceljs';
import fs from 'fs';
import { ExcelService } from './ExcelService';

/**
 * Focused regression tests for the pivot XLSX header fix: the export must use
 * the grid layout (`pivotResultsAsGrid`) with merged header ranges, and every
 * header row (not just the first) must be bold + gray. Asserts by reading the
 * generated file back with exceljs — no real warehouse/project involved.
 */

const itemMap: ItemsMap = {
    page: {
        name: 'page',
        label: 'Page',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.page',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
    } as Item,
    site: {
        name: 'site',
        label: 'Site',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.site',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
    } as Item,
    revenue: {
        name: 'revenue',
        label: 'Revenue',
        table: 't',
        tableLabel: 't',
        sql: '${TABLE}.revenue',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
    } as Item,
};

const metricQuery: MetricQuery = {
    exploreName: 'test',
    dimensions: ['page', 'site'],
    metrics: ['revenue'],
    tableCalculations: [],
    additionalMetrics: [],
    customDimensions: [],
    filters: {},
    sorts: [],
    limit: 500,
};

// 1 row dimension (page) x 1 pivot dimension (site) x 1 metric
// -> grid header = 2 rows (dimension-name row + pivot values row)
const rawRows = [
    { page: '/home', site: 'blog', revenue: 6 },
    { page: '/docs', site: 'docs', revenue: 2 },
];

const baseArgs = {
    rows: rawRows,
    itemMap,
    metricQuery,
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: false,
        rowTotals: false,
        columnTotals: false,
    },
    onlyRaw: false,
    customLabels: undefined,
    maxColumnLimit: 100,
    pivotDetails: null,
};

const expectHeaderStyle = (worksheet: Excel.Worksheet, address: string) => {
    const cell = worksheet.getCell(address);
    expect(cell.font?.bold).toBe(true);
    expect(cell.font?.italic).not.toBe(true);
    expect(cell.fill?.type).toBe('pattern');
    expect((cell.fill as Excel.FillPattern)?.fgColor?.argb).toBe('FFE0E0E0');
};

// Column-totals footer rows: same gray + bold as the header block, but italic
const expectTotalsStyle = (worksheet: Excel.Worksheet, address: string) => {
    const cell = worksheet.getCell(address);
    expect(cell.font?.bold).toBe(true);
    expect(cell.font?.italic).toBe(true);
    expect(cell.fill?.type).toBe('pattern');
    expect((cell.fill as Excel.FillPattern)?.fgColor?.argb).toBe('FFE0E0E0');
};

const expectNoStyle = (worksheet: Excel.Worksheet, address: string) => {
    const cell = worksheet.getCell(address);
    expect(cell.font?.bold).not.toBe(true);
    expect(cell.font?.italic).not.toBe(true);
    expect(cell.fill).toBeUndefined();
};

describe('ExcelService.downloadPivotTableXlsx (pivot header grid)', () => {
    let filePath: string | undefined;

    afterEach(async () => {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            filePath = undefined;
        }
    });

    it('rowTotals: the dimension-name merge stops before the Total column and totals round-trip', async () => {
        const result = await ExcelService.downloadPivotTableXlsx({
            ...baseArgs,
            pivotConfig: { ...baseArgs.pivotConfig, rowTotals: true },
        });
        filePath = result.filePath;

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);
        expect(worksheet).toBeDefined();

        // 3 header rows + 2 data rows; width = page + blog + docs + Total
        expect(worksheet!.rowCount).toBe(5);

        // Merges: 'Site' over the two data columns only (B1:C1), 'Page'
        // anchored over the whole header block (A1:A3). Column D (Total) is
        // NOT part of any merge.
        const merges = worksheet!.model.merges ?? [];
        expect(merges).toHaveLength(2);
        expect([...merges].sort()).toEqual(['A1:A3', 'B1:C1']);

        // Header content: name row anchors, values row carries 'Total' in D,
        // metric-label row carries 'Total Revenue' in D.
        expect(worksheet!.getCell('A1').value).toBe('Page');
        expect(worksheet!.getCell('B1').value).toBe('Site');
        expect(worksheet!.getCell('B2').value).toBe('blog');
        expect(worksheet!.getCell('C2').value).toBe('docs');
        expect(worksheet!.getCell('D2').value).toBe('Total');
        expect(worksheet!.getCell('B3').value).toBe('Revenue');
        expect(worksheet!.getCell('C3').value).toBe('Revenue');
        expect(worksheet!.getCell('D3').value).toBe('Total Revenue');
        expect(worksheet!.getCell('D1').value).toBeFalsy();

        // Whole header block is bold + gray (merged slaves included)
        ['A1', 'B1', 'C1', 'B2', 'C2', 'D2', 'B3', 'C3', 'D3'].forEach(
            (address) => {
                expectHeaderStyle(worksheet!, address);
            },
        );

        // Data rows: per-row totals land in column D, aligned with the row
        expect(worksheet!.getCell('A4').value).toBe('/home');
        expect(worksheet!.getCell('B4').value).toBe('6');
        expect(worksheet!.getCell('C4').value).toBeFalsy();
        expect(worksheet!.getCell('D4').value).toBe('6');
        expect(worksheet!.getCell('A5').value).toBe('/docs');
        expect(worksheet!.getCell('C5').value).toBe('2');
        expect(worksheet!.getCell('D5').value).toBe('2');
    });

    it('metricsAsRows: 2-row header, the metric label column stays unmerged and data round-trips', async () => {
        const result = await ExcelService.downloadPivotTableXlsx({
            ...baseArgs,
            pivotConfig: { ...baseArgs.pivotConfig, metricsAsRows: true },
        });
        filePath = result.filePath;

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);
        expect(worksheet).toBeDefined();

        // 2 header rows + 2 data rows; width = page + label + blog + docs
        expect(worksheet!.rowCount).toBe(4);

        // Merges: 'Site' over the two data columns (C1:D1) and 'Page' over
        // the header block (A1:A2). The label column B has no merge.
        const merges = worksheet!.model.merges ?? [];
        expect(merges).toHaveLength(2);
        expect([...merges].sort()).toEqual(['A1:A2', 'C1:D1']);

        // Header content
        expect(worksheet!.getCell('A1').value).toBe('Page');
        expect(worksheet!.getCell('B1').value).toBeFalsy();
        expect(worksheet!.getCell('C1').value).toBe('Site');
        expect(worksheet!.getCell('C2').value).toBe('blog');
        expect(worksheet!.getCell('D2').value).toBe('docs');

        // Header rows (1-2) are bold + gray, including the label column cells
        ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'].forEach((address) => {
            expectHeaderStyle(worksheet!, address);
        });

        // Data rows: one row per (page, metric) with the metric label in B
        expect(worksheet!.getCell('A3').value).toBe('/home');
        expect(worksheet!.getCell('B3').value).toBe('Revenue');
        expect(worksheet!.getCell('C3').value).toBe('6');
        expect(worksheet!.getCell('D3').value).toBeFalsy();
        expect(worksheet!.getCell('A4').value).toBe('/docs');
        expect(worksheet!.getCell('B4').value).toBe('Revenue');
        expect(worksheet!.getCell('C4').value).toBeFalsy();
        expect(worksheet!.getCell('D4').value).toBe('2');
    });

    it('writes a 2-row header matrix with merged ranges and bold+gray header rows', async () => {
        const result = await ExcelService.downloadPivotTableXlsx(baseArgs);
        filePath = result.filePath;

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);
        expect(worksheet).toBeDefined();

        // Grid header: dimension-name row + pivot values row + metric label
        // row (a 2-row CSV header becomes 3 rows in the grid) + 2 data rows
        expect(worksheet!.rowCount).toBe(5);

        // Merged header ranges: pivot dimension names over both data columns,
        // and the row-dimension label spanning the whole header block
        const merges = worksheet!.model.merges ?? [];
        expect(merges).toHaveLength(2);
        expect([...merges].sort()).toEqual(['A1:A3', 'B1:C1']);

        // Header content: dimension-name row anchors the merges
        expect(worksheet!.getCell('A1').value).toBe('Page');
        expect(worksheet!.getCell('B1').value).toBe('Site');
        expect(worksheet!.getCell('B2').value).toBe('blog');
        expect(worksheet!.getCell('C2').value).toBe('docs');
        expect(worksheet!.getCell('B3').value).toBe('Revenue');
        expect(worksheet!.getCell('C3').value).toBe('Revenue');

        // Header rows (1-3) are bold + gray, including merged cells
        ['A1', 'B1', 'C1', 'B2', 'C2', 'B3', 'C3'].forEach((address) => {
            expectHeaderStyle(worksheet!, address);
        });

        // Data rows are not styled and match the CSV data rows
        expect(worksheet!.getCell('A4').value).toBe('/home');
        expect(worksheet!.getCell('B4').value).toBe('6');
        expect(worksheet!.getCell('A5').value).toBe('/docs');
        expect(worksheet!.getCell('C5').value).toBe('2');
        ['A4', 'B4', 'C4', 'A5', 'B5', 'C5'].forEach((address) => {
            expect(worksheet!.getCell(address).font?.bold).not.toBe(true);
            expect(worksheet!.getCell(address).fill).toBeUndefined();
        });
    });

    it('columnTotals: appends a styled footer row and leaves merges untouched', async () => {
        const result = await ExcelService.downloadPivotTableXlsx({
            ...baseArgs,
            pivotConfig: { ...baseArgs.pivotConfig, columnTotals: true },
        });
        filePath = result.filePath;

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);
        expect(worksheet).toBeDefined();

        // 3 header rows + 2 data rows + 1 column-totals footer row
        expect(worksheet!.rowCount).toBe(6);

        // The footer row sits at the very end: 'Total' in the row-dimension
        // column, formatted column sums after it (blog=6, docs=2)
        expect(worksheet!.getCell('A6').value).toBe('Total');
        expect(worksheet!.getCell('B6').value).toBe('6');
        expect(worksheet!.getCell('C6').value).toBe('2');

        // Merges are header-only: identical to the no-totals export, the
        // footer row is not part of any merged range
        const merges = worksheet!.model.merges ?? [];
        expect(merges).toHaveLength(2);
        expect([...merges].sort()).toEqual(['A1:A3', 'B1:C1']);

        // Header block stays bold + gray (not italic); footer is bold +
        // italic + gray; data rows stay unstyled
        ['A1', 'B1', 'C1', 'B2', 'C2', 'B3', 'C3'].forEach((address) => {
            expectHeaderStyle(worksheet!, address);
        });
        ['A6', 'B6', 'C6'].forEach((address) => {
            expectTotalsStyle(worksheet!, address);
        });
        ['A4', 'B4', 'C4', 'A5', 'B5', 'C5'].forEach((address) => {
            expectNoStyle(worksheet!, address);
        });
    });

    it('columnTotals + metricsAsRows: footer row per data column block keeps the metric label column', async () => {
        const result = await ExcelService.downloadPivotTableXlsx({
            ...baseArgs,
            pivotConfig: {
                ...baseArgs.pivotConfig,
                metricsAsRows: true,
                columnTotals: true,
            },
        });
        filePath = result.filePath;

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);
        expect(worksheet).toBeDefined();

        // 2 header rows + 2 data rows + 1 footer row; width = page + label
        // + blog + docs
        expect(worksheet!.rowCount).toBe(5);

        // 'Total' in the row-dimension column, metric label kept in B
        expect(worksheet!.getCell('A5').value).toBe('Total');
        expect(worksheet!.getCell('B5').value).toBe('Revenue');
        expect(worksheet!.getCell('C5').value).toBe('6');
        expect(worksheet!.getCell('D5').value).toBe('2');

        // Same merges as the no-totals metricsAsRows export
        const merges = worksheet!.model.merges ?? [];
        expect(merges).toHaveLength(2);
        expect([...merges].sort()).toEqual(['A1:A2', 'C1:D1']);

        // Footer styled, last data row not
        ['A5', 'B5', 'C5', 'D5'].forEach((address) => {
            expectTotalsStyle(worksheet!, address);
        });
        ['A4', 'B4', 'C4', 'D4'].forEach((address) => {
            expectNoStyle(worksheet!, address);
        });
    });

    it('columnTotals with leading filter columns: footer carries leading values and shifts with the grid', async () => {
        const result = await ExcelService.downloadPivotTableXlsx({
            ...baseArgs,
            pivotConfig: { ...baseArgs.pivotConfig, columnTotals: true },
            leadingColumns: [{ header: 'Group', value: 'Group A' }],
        });
        filePath = result.filePath;

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);
        expect(worksheet).toBeDefined();

        expect(worksheet!.rowCount).toBe(6);

        // Footer row: leading column writes the constant value like every
        // non-header row, 'Total' lands in the row-dimension column (B)
        expect(worksheet!.getCell('A6').value).toBe('Group A');
        expect(worksheet!.getCell('B6').value).toBe('Total');
        expect(worksheet!.getCell('C6').value).toBe('6');
        expect(worksheet!.getCell('D6').value).toBe('2');

        // Leading column and footer row stay out of the merges
        const merges = worksheet!.model.merges ?? [];
        expect(merges).toHaveLength(2);
        expect([...merges].sort()).toEqual(['B1:B3', 'C1:D1']);

        // Whole footer row is styled, including the leading cell
        ['A6', 'B6', 'C6', 'D6'].forEach((address) => {
            expectTotalsStyle(worksheet!, address);
        });
    });

    it('keeps leading filter columns unmerged and shifts merge ranges right', async () => {
        const result = await ExcelService.downloadPivotTableXlsx({
            ...baseArgs,
            leadingColumns: [{ header: 'Group', value: 'Group A' }],
        });
        filePath = result.filePath;

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);
        expect(worksheet).toBeDefined();

        // Same grid shape, one extra leading column
        expect(worksheet!.rowCount).toBe(5);

        // Merges shifted by the leading column; leading column A not merged
        const merges = worksheet!.model.merges ?? [];
        expect(merges).toHaveLength(2);
        expect([...merges].sort()).toEqual(['B1:B3', 'C1:D1']);

        // First row: leading header + grid header; other rows: leading values
        expect(worksheet!.getCell('A1').value).toBe('Group');
        expect(worksheet!.getCell('B1').value).toBe('Page');
        expect(worksheet!.getCell('C1').value).toBe('Site');
        expect(worksheet!.getCell('A2').value).toBe('Group A');
        expect(worksheet!.getCell('C2').value).toBe('blog');
        expect(worksheet!.getCell('D2').value).toBe('docs');
        expect(worksheet!.getCell('A5').value).toBe('Group A');
        expect(worksheet!.getCell('B5').value).toBe('/docs');

        // Header rows still bold + gray (leading header included)
        ['A1', 'B1', 'C2', 'D2', 'C3', 'D3'].forEach((address) => {
            expectHeaderStyle(worksheet!, address);
        });

        // ...but the leading filter *values* repeated on the following header
        // rows are not headers, so they stay unstyled
        ['A2', 'A3'].forEach((address) => {
            expect(worksheet!.getCell(address).font?.bold).not.toBe(true);
            expect(worksheet!.getCell(address).fill).toBeUndefined();
        });

        // Merged header anchors are centred: row dimensions vertically (so
        // the label does not sit on the last header row) and the pivot
        // dimension banner horizontally
        expect(worksheet!.getCell('B1').alignment?.vertical).toBe('middle');
        expect(worksheet!.getCell('C1').alignment?.horizontal).toBe('center');

        // Data rows are not styled
        expect(worksheet!.getCell('B4').font?.bold).not.toBe(true);
        expect(worksheet!.getCell('B4').fill).toBeUndefined();
    });
});
