import { pivotQueryResults } from '@lightdash/common/src/pivot/pivotQueryResults';
import {
    METRIC_QUERY_1DIM_2METRIC,
    RESULT_ROWS_1DIM_2METRIC,
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
        const { columns } = pivotDataToVTable(pivotData, {
            ...baseOptions,
            cellAlignment: 'right',
        });

        expect(getLeafDataColumns(columns).map((col) => col.style)).toEqual(
            Array.from({ length: 6 }, () => ({ textAlign: 'right' })),
        );
    });

    it('数据列默认左对齐', () => {
        const { columns } = pivotDataToVTable(pivotData, baseOptions);

        expect(getLeafDataColumns(columns).map((col) => col.style)).toEqual(
            Array.from({ length: 6 }, () => ({ textAlign: 'left' })),
        );
    });
});
