import { pivotQueryResults } from '@lightdash/common/src/pivot/pivotQueryResults';
import {
    METRIC_QUERY_1DIM_2METRIC,
    METRIC_QUERY_2DIM_2METRIC,
    RESULT_ROWS_1DIM_2METRIC,
    RESULT_ROWS_2DIM_2METRIC,
} from '@lightdash/common/src/pivot/pivotQueryResults.mock';
import { FieldType, MetricType } from '@lightdash/common/src/types/field';
import { type PivotData } from '@lightdash/common/src/types/pivot';

import {
    DEFAULT_COLUMN_MAX_WIDTH,
    pivotDataToVTable,
    type VTableColumnDef,
    type VTableColumnGroup,
} from './pivotDataToVTable';

const isColumnGroup = (
    col: VTableColumnDef | VTableColumnGroup,
): col is VTableColumnGroup => 'columns' in col;

const getDataColumnGroups = (
    columns: (VTableColumnDef | VTableColumnGroup)[],
): (VTableColumnDef | VTableColumnGroup)[] => {
    return columns.filter(
        (col) =>
            isColumnGroup(col) ||
            (!col.field.startsWith('#') && col.field !== '__pivot_spacer__'),
    );
};

const getTopLevelGroupTitles = (
    dataColumns: (VTableColumnDef | VTableColumnGroup)[],
): string[] => dataColumns.filter(isColumnGroup).map((group) => group.title);

const getLeafDataColumnFields = (
    columns: (VTableColumnDef | VTableColumnGroup)[],
): string[] => {
    const fields: string[] = [];
    const walk = (col: VTableColumnDef | VTableColumnGroup) => {
        if (isColumnGroup(col)) {
            col.columns.forEach(walk);
            return;
        }
        if (
            col.field !== '__pivot_spacer__' &&
            col.field !== '#' &&
            !col.field.startsWith('label-')
        ) {
            fields.push(col.field);
        }
    };
    columns.forEach(walk);
    return fields;
};

const getLeafDataColumns = (
    columns: (VTableColumnDef | VTableColumnGroup)[],
): VTableColumnDef[] => {
    const leafColumns: VTableColumnDef[] = [];
    const walk = (col: VTableColumnDef | VTableColumnGroup) => {
        if (isColumnGroup(col)) {
            col.columns.forEach(walk);
            return;
        }
        if (
            col.field !== '__pivot_spacer__' &&
            col.field !== '#' &&
            !col.field.startsWith('label-')
        ) {
            leafColumns.push(col);
        }
    };
    columns.forEach(walk);
    return leafColumns;
};

const getDimensionColumns = (
    columns: (VTableColumnDef | VTableColumnGroup)[],
): VTableColumnDef[] =>
    columns.filter(
        (col): col is VTableColumnDef =>
            !isColumnGroup(col) &&
            col.field !== '__pivot_spacer__' &&
            !col.field.includes('__'),
    );

const getMetricValueLeafColumns = (
    columns: (VTableColumnDef | VTableColumnGroup)[],
): VTableColumnDef[] =>
    getLeafDataColumns(columns).filter((col) => col.field.includes('__'));

describe('pivotDataToVTable', () => {
    const pivotData = pivotQueryResults({
        pivotConfig: {
            pivotDimensions: ['page'],
            metricsAsRows: false,
        },
        metricQuery: METRIC_QUERY_1DIM_2METRIC,
        rows: RESULT_ROWS_1DIM_2METRIC,
        options: { maxColumns: 60 },
        getFieldLabel: (fieldId) => fieldId,
        getField: () => undefined,
    });

    const baseOptions = {
        getFieldLabel: (fieldId: string) => fieldId,
        hideRowNumbers: true,
    };

    const twoDimensionPivotData = pivotQueryResults({
        pivotConfig: {
            pivotDimensions: ['page'],
            metricsAsRows: false,
        },
        metricQuery: METRIC_QUERY_2DIM_2METRIC,
        rows: RESULT_ROWS_2DIM_2METRIC,
        options: { maxColumns: 60 },
        getFieldLabel: (fieldId) => fieldId,
        getField: () => undefined,
    });

    const threeDimensionPivotData = pivotQueryResults({
        pivotConfig: {
            pivotDimensions: ['page'],
            metricsAsRows: false,
        },
        metricQuery: {
            ...METRIC_QUERY_2DIM_2METRIC,
            dimensions: ['page', 'site', 'region'],
        },
        rows: RESULT_ROWS_2DIM_2METRIC.map((row) => ({
            ...row,
            region: { value: { raw: 'global', formatted: 'Global' } },
        })),
        options: { maxColumns: 60 },
        getFieldLabel: (fieldId) => fieldId,
        getField: () => undefined,
    });

    it('默认将透视维度作为顶层分组表头', () => {
        const { columns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotMetricHeaderPosition: 'bottom',
        });

        const dataColumns = getDataColumnGroups(columns);
        expect(getTopLevelGroupTitles(dataColumns)).toEqual([
            '/home',
            '/about',
            '/first-post',
        ]);
    });

    it('指标作为顶层表头时，按指标合并分组', () => {
        const { columns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotMetricHeaderPosition: 'top',
        });

        const dataColumns = getDataColumnGroups(columns);
        expect(getTopLevelGroupTitles(dataColumns)).toEqual([
            'views',
            'devices',
        ]);

        const viewsGroup = dataColumns.find(
            (col): col is VTableColumnGroup =>
                isColumnGroup(col) && col.title === 'views',
        );
        expect(viewsGroup?.columns.map((col) => col.title)).toEqual([
            '/home',
            '/about',
            '/first-post',
        ]);
    });

    it('指标作为顶层表头时，叶子列顺序按指标优先排列', () => {
        const { columns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotMetricHeaderPosition: 'top',
        });

        const leafFields = getLeafDataColumnFields(columns);

        expect(leafFields).toEqual([
            'page__views__0',
            'page__views__2',
            'page__views__4',
            'page__devices__1',
            'page__devices__3',
            'page__devices__5',
        ]);
    });

    it('仅对数据列应用单元格对齐方式', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
            cellAlignment: 'right',
        });

        expect(getDimensionColumns(columns).map((col) => col.style)).toEqual([
            { textAlign: 'left' },
        ]);
        expect(
            getDimensionColumns(columns).map((col) => col.headerStyle),
        ).toEqual([{ textAlign: 'left' }]);
        expect(
            getMetricValueLeafColumns(columns).map((col) => col.style),
        ).toEqual(Array.from({ length: 6 }, () => ({ textAlign: 'right' })));
        expect(
            getMetricValueLeafColumns(columns).map((col) => col.headerStyle),
        ).toEqual(Array.from({ length: 6 }, () => ({ textAlign: 'right' })));
    });

    it('对行维度列应用行维度对齐配置', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
            pivotRowDimensionAlignment: 'center',
            cellAlignment: 'right',
        });

        expect(getDimensionColumns(columns).map((col) => col.style)).toEqual([
            { textAlign: 'center' },
        ]);
        expect(
            getDimensionColumns(columns).map((col) => col.headerStyle),
        ).toEqual([{ textAlign: 'center' }]);
        expect(
            getMetricValueLeafColumns(columns).map((col) => col.style),
        ).toEqual(Array.from({ length: 6 }, () => ({ textAlign: 'right' })));
    });

    it('行维度列默认左对齐', () => {
        const { columns } = pivotDataToVTable(
            twoDimensionPivotData,
            baseOptions,
        );

        expect(getDimensionColumns(columns).map((col) => col.style)).toEqual([
            { textAlign: 'left' },
        ]);
        expect(
            getDimensionColumns(columns).map((col) => col.headerStyle),
        ).toEqual([{ textAlign: 'left' }]);
    });

    it('数据列默认左对齐', () => {
        const { columns } = pivotDataToVTable(pivotData, baseOptions);

        expect(
            getMetricValueLeafColumns(columns).map((col) => col.style),
        ).toEqual(Array.from({ length: 6 }, () => ({ textAlign: 'left' })));
        expect(
            getMetricValueLeafColumns(columns).map((col) => col.headerStyle),
        ).toEqual(Array.from({ length: 6 }, () => ({ textAlign: 'left' })));
    });

    it('默认布局不强制行维度列最小宽度', () => {
        const { columns } = pivotDataToVTable(
            twoDimensionPivotData,
            baseOptions,
        );

        expect(getDimensionColumns(columns).map((col) => col.minWidth)).toEqual(
            [undefined],
        );
    });

    it('指标作为顶层表头且只有一个行维度时，保护行维度列宽', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
            pivotMetricHeaderPosition: 'top',
        });

        expect(getDimensionColumns(columns).map((col) => col.minWidth)).toEqual(
            [160],
        );
    });

    it('多个行维度时不强制行维度列最小宽度', () => {
        const { columns } = pivotDataToVTable(threeDimensionPivotData, {
            ...baseOptions,
            pivotMetricHeaderPosition: 'top',
        });

        expect(getDimensionColumns(columns).map((col) => col.minWidth)).toEqual(
            [undefined, undefined],
        );
    });

    it('默认数据列使用默认 maxWidth 封顶（内容自适应）', () => {
        const { columns: defaultColumns } = pivotDataToVTable(
            pivotData,
            baseOptions,
        );

        expect(
            getMetricValueLeafColumns(defaultColumns).map(
                (col) => col.maxWidth,
            ),
        ).toEqual(Array.from({ length: 6 }, () => DEFAULT_COLUMN_MAX_WIDTH));
        expect(
            getMetricValueLeafColumns(defaultColumns).map(
                (col) => col.minWidth,
            ),
        ).toEqual(Array.from({ length: 6 }, () => 88));
    });

    it('显式设置数据列最大宽度时覆盖默认上限', () => {
        const { columns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotColumnMaxWidth: 240,
        });

        expect(
            getMetricValueLeafColumns(columns).map((col) => col.maxWidth),
        ).toEqual(Array.from({ length: 6 }, () => 240));
        expect(
            getMetricValueLeafColumns(columns).map((col) => col.minWidth),
        ).toEqual(Array.from({ length: 6 }, () => 88));
    });

    it('显式设置行维度列最大宽度时覆盖默认上限', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
            pivotDimensionColumnMaxWidth: 300,
        });

        expect(getDimensionColumns(columns).map((col) => col.maxWidth)).toEqual(
            [300],
        );
    });

    it('未配置行维度列最大宽度时使用默认上限', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
        });

        expect(getDimensionColumns(columns).map((col) => col.maxWidth)).toEqual(
            [DEFAULT_COLUMN_MAX_WIDTH],
        );
    });

    it('行维度列 maxWidth 小于默认 minWidth 保护值时，minWidth 随 maxWidth 下调', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
            pivotMetricHeaderPosition: 'top',
            pivotDimensionColumnMaxWidth: 120,
        });

        expect(getDimensionColumns(columns)).toEqual([
            expect.objectContaining({ maxWidth: 120, minWidth: 120 }),
        ]);
    });

    it('最大宽度为 0 或未设置时回退到默认上限', () => {
        const { columns: zeroColumns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotColumnMaxWidth: 0,
        });
        const { columns: unsetColumns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotColumnMaxWidth: undefined,
        });

        expect(
            getMetricValueLeafColumns(zeroColumns).map((col) => col.maxWidth),
        ).toEqual(Array.from({ length: 6 }, () => DEFAULT_COLUMN_MAX_WIDTH));
        expect(
            getMetricValueLeafColumns(unsetColumns).map((col) => col.maxWidth),
        ).toEqual(Array.from({ length: 6 }, () => DEFAULT_COLUMN_MAX_WIDTH));
    });

    it('读取 columnProperties.frozen 计算 frozenColCount', () => {
        const indexFieldId =
            threeDimensionPivotData.retrofitData.pivotColumnInfo.find(
                (col) => col.columnType === 'indexValue',
            )?.fieldId;
        expect(indexFieldId).toBeTruthy();

        const { frozenColCount } = pivotDataToVTable(threeDimensionPivotData, {
            ...baseOptions,
            hideRowNumbers: false,
            columnProperties: {
                [indexFieldId!]: { frozen: true },
            },
        });

        // row number (#) + first frozen index column
        expect(frozenColCount).toBeGreaterThanOrEqual(2);
    });

    it('showRowGrouping 开启且无小计时返回行合并信息', () => {
        const { rowSpanMerges } = pivotDataToVTable(threeDimensionPivotData, {
            ...baseOptions,
            showRowGrouping: true,
            showSubtotals: false,
            columnOrder: ['site', 'region', 'page'],
        });

        expect(rowSpanMerges).not.toBeNull();
        expect(rowSpanMerges!.size).toBeGreaterThan(0);
    });

    it('showSubtotals 开启时不进入 grouping-only 行合并', () => {
        const { rowSpanMerges } = pivotDataToVTable(threeDimensionPivotData, {
            ...baseOptions,
            showRowGrouping: true,
            showSubtotals: true,
            columnOrder: ['site', 'region', 'page'],
        });

        expect(rowSpanMerges).toBeNull();
    });
});

describe('pivotDataToVTable 列宽持久化', () => {
    const pivotData = pivotQueryResults({
        pivotConfig: { pivotDimensions: ['page'], metricsAsRows: false },
        metricQuery: METRIC_QUERY_1DIM_2METRIC,
        rows: RESULT_ROWS_1DIM_2METRIC,
        options: { maxColumns: 60 },
        getFieldLabel: (fieldId) => fieldId,
        getField: () => undefined,
    });
    const baseOptions = {
        getFieldLabel: (fieldId: string) => fieldId,
        hideRowNumbers: true,
    };

    const leavesOf = (cols: (VTableColumnDef | VTableColumnGroup)[]) =>
        getMetricValueLeafColumns(cols);

    it('每个叶子列都带持久化 key（数据列按底层指标字段）', () => {
        const { columns } = pivotDataToVTable(pivotData, baseOptions);
        const leaves = leavesOf(columns);

        expect(leaves.length).toBeGreaterThan(0);
        // 同一指标的多个透视列共用同一个 key（宽度按字段生效）
        expect(new Set(leaves.map((c) => c.key))).toEqual(
            new Set(['views', 'devices']),
        );
    });

    it('未配置宽度时不产出 columnWidthConfig', () => {
        const { columnWidthConfig } = pivotDataToVTable(pivotData, baseOptions);
        expect(columnWidthConfig).toEqual([]);
    });

    it('配置宽度后产出 columnWidthConfig，并同字段共享', () => {
        const { columns, columnWidthConfig } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            getColumnWidth: (key) => (key === 'views' ? 260 : undefined),
        });

        expect(columnWidthConfig.length).toBeGreaterThan(0);
        expect(
            columnWidthConfig.every(
                (c) => c.key === 'views' && c.width === 260,
            ),
        ).toBe(true);

        const viewsLeaves = leavesOf(columns).filter((c) => c.key === 'views');
        expect(viewsLeaves.every((c) => c.width === 260)).toBe(true);
        // 显式宽度不能被默认上限 450 夹回，也不能被 minWidth 88 挡窄
        expect(viewsLeaves.every((c) => (c.maxWidth ?? 0) >= 260)).toBe(true);
        expect(viewsLeaves.every((c) => (c.minWidth ?? 0) <= 260)).toBe(true);
    });

    it('显式宽度大于全局上限时，maxWidth 放大到显式宽度', () => {
        const { columns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotColumnMaxWidth: 300,
            getColumnWidth: (key) => (key === 'devices' ? 700 : undefined),
        });

        const devicesLeaves = leavesOf(columns).filter(
            (c) => c.key === 'devices',
        );
        expect(devicesLeaves.every((c) => c.maxWidth === 700)).toBe(true);
    });
});

describe('pivotDataToVTable 列合计行', () => {
    const baseOptions = {
        getFieldLabel: (fieldId: string) => fieldId,
        hideRowNumbers: true,
    };

    /** 让 pivotQueryResults 能识别可合计指标（仅影响 columnTotals 计算） */
    const getSummableMetricField = (fieldId: string) =>
        fieldId === 'views' || fieldId === 'devices'
            ? {
                  fieldType: FieldType.METRIC,
                  type: MetricType.SUM,
                  name: fieldId,
                  label: fieldId,
                  table: 't',
                  tableLabel: 'T',
                  sql: `SUM(\${TABLE}.\${fieldId})`,
                  hidden: false,
              }
            : undefined;

    const buildPivotData = (extraConfig: {
        metricsAsRows: boolean;
        columnTotals?: boolean;
        rowTotals?: boolean;
    }) =>
        pivotQueryResults({
            pivotConfig: {
                pivotDimensions: ['page'],
                ...extraConfig,
            },
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: getSummableMetricField,
        });

    it('列合计按数据列下标取值，行维度列与 rowTotal 列留空', () => {
        const data = buildPivotData({
            metricsAsRows: false,
            columnTotals: true,
            rowTotals: true,
        });
        const { columns, columnTotalsRecords } = pivotDataToVTable(
            data,
            baseOptions,
        );

        expect(columnTotalsRecords).toHaveLength(1);
        const record = columnTotalsRecords![0];

        // 行维度列（site）与 rowTotal 列不取合计
        expect(record.site).toBe('');
        expect(record['row-total-0']).toBe('');

        // 数据列合计 = 各列数据求和，且与叶子数据列一一对齐：
        // blog 行 [6,7,12,0,11,1] + docs 行 [2,10,2,13,null,null]
        const leafFields = getMetricValueLeafColumns(columns).map(
            (col) => col.field,
        );
        const expectedTotals = ['8', '17', '14', '13', '11', '1'];
        expect(leafFields).toHaveLength(expectedTotals.length);
        leafFields.forEach((fieldId, i) => {
            expect(record[fieldId]).toBe(expectedTotals[i]);
        });
    });

    it('metricsAsRows 时每个指标一行合计，同样按数据列下标取值', () => {
        const data = buildPivotData({
            metricsAsRows: true,
            columnTotals: true,
            rowTotals: true,
        });
        const { columns, columnTotalsRecords } = pivotDataToVTable(
            data,
            baseOptions,
        );

        expect(columnTotalsRecords).toHaveLength(2);
        const leafFields = getMetricValueLeafColumns(columns).map(
            (col) => col.field,
        );
        expect(leafFields).toHaveLength(3);

        const labelFieldId = data.retrofitData.pivotColumnInfo.find(
            (col) => col.columnType === 'label',
        )?.fieldId;
        expect(labelFieldId).toBeTruthy();

        // 合计行按指标拆分：views 行 [/home 6+2, /about 12+2, /first-post 11+0]，
        // devices 行 [7+10, 0+13, 1+0]
        const expectedTotals = [
            ['8', '14', '11'],
            ['17', '13', '1'],
        ];
        columnTotalsRecords!.forEach((record, rowIndex) => {
            // 行维度列 / 指标 label 列 / rowTotal 列留空
            expect(record.site).toBe('');
            expect(record[labelFieldId!]).toBe('');
            expect(record['row-total-0']).toBe('');

            leafFields.forEach((fieldId, i) => {
                expect(record[fieldId]).toBe(expectedTotals[rowIndex][i]);
            });
        });
    });

    it('rowTotals=false 时无 rowTotal 列，合计逐列对齐数据列（valueColumnEnd = pivotColumnInfo.length）', () => {
        const data = buildPivotData({
            metricsAsRows: false,
            columnTotals: true,
            rowTotals: false,
        });
        // 无 rowTotal 列：pivotColumnInfo 全部落在数据列区间内
        expect(
            data.retrofitData.pivotColumnInfo.some(
                (col) => col.columnType === 'rowTotal',
            ),
        ).toBe(false);

        const { columns, columnTotalsRecords } = pivotDataToVTable(
            data,
            baseOptions,
        );

        expect(columnTotalsRecords).toHaveLength(1);
        const record = columnTotalsRecords![0];

        // 行维度列（site）不取合计
        expect(record.site).toBe('');
        // 没有 rowTotal 列，也就没有 row-total 单元格
        expect(record['row-total-0']).toBeUndefined();

        // 叶子数据列恰好是全部数据列，且合计逐列对齐：
        // blog 行 [6,7,12,0,11,1] + docs 行 [2,10,2,13,null,null]
        const leafFields = getMetricValueLeafColumns(columns).map(
            (col) => col.field,
        );
        const expectedTotals = ['8', '17', '14', '13', '11', '1'];
        expect(leafFields).toHaveLength(expectedTotals.length);
        leafFields.forEach((fieldId, i) => {
            expect(record[fieldId]).toBe(expectedTotals[i]);
        });

        // 与数据列一一对应（按 fieldId 全等，不只是数量）
        const dataFieldIds = data.retrofitData.pivotColumnInfo
            .filter((col) => col.columnType !== 'indexValue')
            .map((col) => col.fieldId);
        expect(leafFields).toEqual(dataFieldIds);
    });
});

describe('pivotDataToVTable 列合计行（无行维度 allDimensionsPivoted）', () => {
    const baseOptions = {
        getFieldLabel: (fieldId: string) => fieldId,
        hideRowNumbers: true,
    };

    /**
     * 手工构造全部维度都被透视（indexValueTypes 为空）的 PivotData：
     * pivotQueryResults 对无行维度的透视不计算 columnTotals，所以这里直接
     * 给定合计值，验证 pivotDataToVTable 的合计映射不发生错位（数据列从
     * pivotColumnInfo 下标 0 开始）。
     */
    const buildAllPivotedData = (): PivotData => ({
        headerValueTypes: [
            { type: FieldType.DIMENSION, fieldId: 'page' },
            { type: FieldType.DIMENSION, fieldId: 'site' },
            { type: FieldType.METRIC },
        ],
        headerValues: [
            [
                {
                    type: 'value',
                    fieldId: 'page',
                    value: { raw: '/home', formatted: '/home' },
                    colSpan: 2,
                },
                {
                    type: 'value',
                    fieldId: 'page',
                    value: { raw: '/about', formatted: '/about' },
                    colSpan: 0,
                },
            ],
            [
                {
                    type: 'value',
                    fieldId: 'site',
                    value: { raw: 'blog', formatted: 'Blog' },
                    colSpan: 2,
                },
                {
                    type: 'value',
                    fieldId: 'site',
                    value: { raw: 'blog', formatted: 'Blog' },
                    colSpan: 0,
                },
            ],
            [
                { type: 'label', fieldId: 'views' },
                { type: 'label', fieldId: 'devices' },
            ],
        ],
        indexValueTypes: [],
        indexValues: [],
        dataColumnCount: 2,
        dataValues: [
            [
                { raw: 6, formatted: '6' },
                { raw: 7, formatted: '7' },
            ],
            [
                { raw: 12, formatted: '12' },
                { raw: 13, formatted: '13' },
            ],
        ],
        titleFields: [[{ fieldId: 'page', direction: 'header' }]],
        columnTotalFields: [[null]],
        columnTotals: [[18, 20]],
        cellsCount: 4,
        rowsCount: 2,
        pivotConfig: {
            pivotDimensions: ['page', 'site'],
            metricsAsRows: false,
            columnTotals: true,
        },
        retrofitData: {
            allCombinedData: [
                {
                    page__views__0: { value: { raw: 6, formatted: '6' } },
                    page__devices__1: { value: { raw: 7, formatted: '7' } },
                },
                {
                    page__views__0: { value: { raw: 12, formatted: '12' } },
                    page__devices__1: { value: { raw: 13, formatted: '13' } },
                },
            ],
            pivotColumnInfo: [
                {
                    fieldId: 'page__views__0',
                    baseId: 'views',
                    underlyingId: undefined,
                    columnType: undefined,
                },
                {
                    fieldId: 'page__devices__1',
                    baseId: 'devices',
                    underlyingId: undefined,
                    columnType: undefined,
                },
            ],
        },
    });

    it('无行维度时数据列从下标 0 开始，合计行不错位', () => {
        const data = buildAllPivotedData();
        const { columns, records, columnTotalsRecords } = pivotDataToVTable(
            data,
            baseOptions,
        );

        // 全部维度被透视：只有 spacer + 数据列，没有行维度列
        const leafFields = getLeafDataColumnFields(columns);
        expect(leafFields).toEqual(['page__views__0', 'page__devices__1']);
        expect(getDimensionColumns(columns)).toEqual([]);

        // 数据行取值正确（不因 spacer 错位）
        expect(records).toHaveLength(2);
        expect(records[0]).toEqual({
            __pivot_spacer__: '',
            page__views__0: '6',
            page__devices__1: '7',
        });
        expect(records[1]).toEqual({
            __pivot_spacer__: '',
            page__views__0: '12',
            page__devices__1: '13',
        });

        // 合计行：只有 spacer + 两个数据列合计（views 6+12, devices 7+13），
        // 键集合完全一致即证明没有多出/错位的列
        expect(columnTotalsRecords).toHaveLength(1);
        expect(columnTotalsRecords![0]).toEqual({
            __pivot_spacer__: '',
            page__views__0: '18',
            page__devices__1: '20',
        });
    });
});
