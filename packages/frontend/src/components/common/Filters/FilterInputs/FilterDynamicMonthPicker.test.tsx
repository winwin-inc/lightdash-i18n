import { renderWithProviders } from '../../../../testing/testUtils';
import FilterDynamicMonthPicker from './FilterDynamicMonthPicker';
import { describe, expect, it, vi } from 'vitest';

// 编辑模式 + 动态分支只渲染「上月」文案：预设语义与当前解析的说明
// 统一放在约束编辑器「数据可用日」行的 ⓘ tooltip，取值区不再内联
const dynamicRule = {
    id: 'r1',
    target: { fieldId: 'f1' },
    operator: 'equals',
    values: ['2026-10'],
    settings: {
        singleDate: { mode: 'dynamic', preset: 'lastAvailableMonth' },
    },
} as any;

describe('FilterDynamicMonthPicker', () => {
    describe('edit mode + dynamic', () => {
        it('renders the preset label without inline help icon', () => {
            renderWithProviders(
                <FilterDynamicMonthPicker
                    rule={dynamicRule}
                    onChange={vi.fn()}
                    isEditMode
                />,
            );
            const body = document.body.textContent ?? '';
            expect(
                body.includes('上月') ||
                    body.includes('last_available_month_short') ||
                    body.includes('Last month'),
            ).toBe(true);

            // 说明已并入约束编辑器「数据可用日」行，此处不再有 ⓘ
            expect(document.querySelector('.tabler-icon-help-circle')).toBeNull();
        });
    });
});
