import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import BatchBindModal from './BatchBindModal';

const rule = (overrides: {
    id: string;
    fieldId: string;
    tableName: string;
    categoryLevel?: 1 | 2 | 3 | 4;
    parentFieldId?: string;
    parentScope?: 'global' | 'tab';
    parentTabUuid?: string;
}): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: overrides.tableName,
    },
    operator: FilterOperator.EQUALS,
    label: undefined,
    categoryLevel: overrides.categoryLevel,
    parentFieldId: overrides.parentFieldId,
    parentScope: overrides.parentScope,
    parentTabUuid: overrides.parentTabUuid,
});

const TAB_UUID = 'tab-1';

const tabRule = (
    level: 1 | 2 | 3 | 4,
    overrides: Partial<Parameters<typeof rule>[0]> = {},
) =>
    rule({
        id: `tab-cls-${level}`,
        fieldId: `mart_a_cls_${level}`,
        tableName: 'mart_a',
        categoryLevel: level,
        ...overrides,
    });

const globalRule = (
    level: 1 | 2 | 3 | 4,
    overrides: Partial<Parameters<typeof rule>[0]> = {},
) =>
    rule({
        id: `global-cls-${level}`,
        fieldId: `mart_global_cls_${level}`,
        tableName: 'mart_global',
        categoryLevel: level,
        ...overrides,
    });

const renderModal = (props: {
    filters: DashboardFilterRule[];
    globalFilters?: DashboardFilterRule[];
    onApply?: (filters: DashboardFilterRule[]) => void;
}) => {
    const onApply = props.onApply ?? vi.fn();
    const onClose = vi.fn();
    render(
        <MantineProvider>
            <BatchBindModal
                opened
                onClose={onClose}
                filters={props.filters}
                globalFilters={props.globalFilters}
                tabUuid={TAB_UUID}
                onApply={onApply}
            />
        </MantineProvider>,
    );
    return { onApply, onClose };
};

describe('BatchBindModal', () => {
    it('resolves and shows a global parent in the change preview', () => {
        renderModal({
            filters: [tabRule(2)],
            globalFilters: [globalRule(1)],
        });

        // 修复前父级标签只在当前 Tab 里找，全局父级会显示成「无」
        expect(
            screen.getByText(/Level 1 Category \(Global\)/),
        ).toBeInTheDocument();
        expect(screen.getByText(/Parent filter: None → /)).toBeInTheDocument();
    });

    it('keeps an unresolvable binding visible but not selectable', () => {
        const child = tabRule(2, {
            parentFieldId: 'deleted_filter_field',
            parentScope: 'tab',
        });
        renderModal({ filters: [child] });

        expect(
            screen.getByText(/No usable parent category found/),
        ).toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    });

    it('explains when a category filter has no bindable parent', () => {
        // 全局一级只有 cls 列名、没有显式层级 → 不当父级；行仍然可见并说明原因
        renderModal({
            filters: [tabRule(2)],
            globalFilters: [
                rule({
                    id: 'global-inferred-1',
                    fieldId: 'mart_global_cls_1',
                    tableName: 'mart_global',
                }),
            ],
        });

        expect(
            screen.getByText(/No bindable parent category found/),
        ).toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('shows an empty state when there are no category filters', () => {
        renderModal({
            filters: [
                rule({
                    id: 'plain',
                    fieldId: 'mart_a_revenue',
                    tableName: 'mart_a',
                }),
            ],
        });

        expect(
            screen.getByText(/This tab has no category filters/),
        ).toBeInTheDocument();
    });

    it('applies the selected binding updates', () => {
        const { onApply } = renderModal({
            filters: [tabRule(2)],
            globalFilters: [globalRule(1)],
        });

        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        expect(onApply).toHaveBeenCalledTimes(1);
        const [updated] = vi.mocked(onApply).mock.calls[0];
        expect(updated[0].categoryLevel).toBe(2);
        expect(updated[0].parentFieldId).toBe('mart_global_cls_1');
        expect(updated[0].parentScope).toBe('global');
        expect(updated[0].parentTabUuid).toBeUndefined();
    });

    it('auto-applies the parent level when a selected child depends on it', () => {
        // 一级类目只有 cls 列名、没有显式层级：子级选中后必须一并补写它的层级
        const inferredLevel1 = rule({
            id: 'tab-inferred-1',
            fieldId: 'mart_a_cls_1',
            tableName: 'mart_a',
        });
        const level2 = tabRule(2);
        const { onApply } = renderModal({
            filters: [inferredLevel1, level2],
        });

        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(2);
        fireEvent.click(checkboxes[0]);

        // 被子级依赖后，父级层级不能被取消：复选框变回选中并禁用
        expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
        expect(screen.getAllByRole('checkbox')[0]).toBeDisabled();
        expect(
            screen.getByText(/A selected filter below uses this as its parent/),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        const [updated] = vi.mocked(onApply).mock.calls[0];
        expect(updated[0].categoryLevel).toBe(1);
        expect(updated[1].parentFieldId).toBe('mart_a_cls_1');
        expect(updated[1].parentScope).toBe('tab');
    });

    it('does not write unselected filters', () => {
        // 一级类目带遗留父级（会被清除）+ 二级类目待绑定 → 两行都可操作
        const level1 = tabRule(1, {
            parentFieldId: 'mart_a_cls_1',
            parentScope: 'tab',
        });
        const level2 = tabRule(2);
        const { onApply } = renderModal({
            filters: [level1, level2],
        });

        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(2);
        fireEvent.click(checkboxes[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        const [updated] = vi.mocked(onApply).mock.calls[0];
        // 选中的一级类目被清除父级；未选中的二级类目保持原引用
        expect(updated[0].parentFieldId).toBeUndefined();
        expect(updated[1]).toBe(level2);
    });
});
