import { DimensionType, type Dimension } from '@lightdash/common';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MantineProvider from '../../providers/MantineProvider';
import { type TableColumn } from '../common/Table/types';
import SortItem from './SortItem';

const dimension = {
    fieldType: 'dimension',
    type: DimensionType.STRING,
    name: 'group',
    label: '集团',
    table: 'insight_list',
    tableLabel: 'insight_list',
    sql: '${TABLE}.group',
    hidden: false,
} as unknown as Dimension;

const column = {
    id: 'insight_list_group',
    meta: { item: dimension },
} as unknown as TableColumn;

const renderSortItem = (valueOrder: string[] | undefined) =>
    render(
        <MantineProvider>
            <SortItem
                isFirstItem
                isOnlyItem={false}
                isDragging={false}
                isEditMode
                sort={{
                    fieldId: 'insight_list_group',
                    descending: false,
                    ...(valueOrder ? { valueOrder } : {}),
                }}
                column={column}
                draggableProps={
                    {
                        'data-rfd-draggable-context-id': 'test-context',
                        'data-rfd-draggable-id': 'insight_list_group',
                    } as never
                }
                onAddSortField={vi.fn()}
                onRemoveSortField={vi.fn()}
                onSetSortFieldNullsFirst={vi.fn()}
                onSetSortFieldValueOrder={vi.fn()}
            />
        </MantineProvider>,
    );

describe('SortItem 布局（自定义顺序开关）', () => {
    it('renders the direction and nulls controls for a normal sort', () => {
        renderSortItem(undefined);

        expect(screen.getByText('A-Z')).toBeInTheDocument();
        expect(screen.getByText('Z-A')).toBeInTheDocument();
        expect(screen.getByText('Nulls')).toBeInTheDocument();
        expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('switches to the custom order layout when a value order is set', () => {
        renderSortItem(['大卖场', '大超市']);

        // 方向控件换成「Ascending / Descending」（中文环境为正序/反序）
        expect(screen.getByText('Ascending')).toBeInTheDocument();
        expect(screen.getByText('Descending')).toBeInTheDocument();
        expect(screen.queryByText('A-Z')).not.toBeInTheDocument();

        // 自定义顺序下空值设置不生效 → 整块隐藏
        expect(screen.queryByText('Nulls')).not.toBeInTheDocument();
        expect(screen.queryByText('Default')).not.toBeInTheDocument();
    });

    it('summarises a long value order (2 values + count) to keep the row narrow', () => {
        renderSortItem(['大卖场', '大超市', '小超市', '便利店', '食杂店']);

        const summary = screen.getByTestId('value-order-summary');
        expect(summary).toHaveTextContent('大卖场 → 大超市 +3');
        expect(summary).not.toHaveTextContent('食杂店');

        // 固定宽度，避免把排序行撑开
        expect(summary).toHaveStyle({ width: '190px' });
    });

    it('keeps the custom order toggle before the direction control', () => {
        renderSortItem(undefined);

        const toggle = screen.getByLabelText('Custom order');
        const direction = screen.getByText('A-Z');

        // DOM 顺序：开关在方向控件之前（compareDocumentPosition: FOLLOWING = 4）
        expect(
            toggle.compareDocumentPosition(direction) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
});
