import { pivotQueryResults } from '@lightdash/common/src/pivot/pivotQueryResults';
import {
    METRIC_QUERY_1DIM_2METRIC,
    METRIC_QUERY_2DIM_2METRIC,
    RESULT_ROWS_1DIM_2METRIC,
    RESULT_ROWS_2DIM_2METRIC,
} from '@lightdash/common/src/pivot/pivotQueryResults.mock';

import {
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
            getMetricValueLeafColumns(columns).map((col) => col.style),
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
    });

    it('数据列默认左对齐', () => {
        const { columns } = pivotDataToVTable(pivotData, baseOptions);

        expect(
            getMetricValueLeafColumns(columns).map((col) => col.style),
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

    it('默认或未开启自动撑满时不设置数据列 maxWidth', () => {
        const { columns: defaultColumns } = pivotDataToVTable(
            pivotData,
            baseOptions,
        );
        const { columns: disabledColumns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotAutoFillWidth: false,
            pivotColumnMaxWidth: 240,
        });

        expect(
            getMetricValueLeafColumns(defaultColumns).map(
                (col) => col.maxWidth,
            ),
        ).toEqual(Array.from({ length: 6 }, () => undefined));
        expect(
            getMetricValueLeafColumns(disabledColumns).map(
                (col) => col.maxWidth,
            ),
        ).toEqual(Array.from({ length: 6 }, () => undefined));
    });

    it('开启自动撑满且设置最大宽度时，数据列带 maxWidth', () => {
        const { columns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotAutoFillWidth: true,
            pivotColumnMaxWidth: 240,
        });

        expect(
            getMetricValueLeafColumns(columns).map((col) => col.maxWidth),
        ).toEqual(Array.from({ length: 6 }, () => 240));
        expect(
            getMetricValueLeafColumns(columns).map((col) => col.minWidth),
        ).toEqual(Array.from({ length: 6 }, () => 88));
    });

    it('开启自动撑满且设置最大宽度时，行维度列带 maxWidth', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
            pivotAutoFillWidth: true,
            pivotDimensionColumnMaxWidth: 300,
        });

        expect(getDimensionColumns(columns).map((col) => col.maxWidth)).toEqual(
            [300],
        );
    });

    it('行维度列 maxWidth 小于默认 minWidth 保护值时，minWidth 随 maxWidth 下调', () => {
        const { columns } = pivotDataToVTable(twoDimensionPivotData, {
            ...baseOptions,
            pivotMetricHeaderPosition: 'top',
            pivotAutoFillWidth: true,
            pivotDimensionColumnMaxWidth: 120,
        });

        expect(getDimensionColumns(columns)).toEqual([
            expect.objectContaining({ maxWidth: 120, minWidth: 120 }),
        ]);
    });

    it('开启自动撑满且最大宽度为 0 或未设置时不限制数据列 maxWidth', () => {
        const { columns: zeroColumns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotAutoFillWidth: true,
            pivotColumnMaxWidth: 0,
        });
        const { columns: unsetColumns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            pivotAutoFillWidth: true,
            pivotColumnMaxWidth: undefined,
        });

        expect(
            getMetricValueLeafColumns(zeroColumns).map((col) => col.maxWidth),
        ).toEqual(Array.from({ length: 6 }, () => undefined));
        expect(
            getMetricValueLeafColumns(unsetColumns).map((col) => col.maxWidth),
        ).toEqual(Array.from({ length: 6 }, () => undefined));
    });
});
