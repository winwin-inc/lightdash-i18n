import { renderWithProviders } from '../../../../testing/testUtils';
import FilterDynamicMonthPicker from './FilterDynamicMonthPicker';
import { describe, expect, it, vi } from 'vitest';

// 编辑模式 + 动态分支渲染与「在之间」同款的配置行
// 「取值 [N] 个可用月前」；不再有静态「上月」文案与内联 ⓘ
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
        it('renders the count input row (label + number + unit)', () => {
            renderWithProviders(
                <FilterDynamicMonthPicker
                    rule={dynamicRule}
                    onChange={vi.fn()}
                    isEditMode
                />,
            );
            const body = document.body.textContent ?? '';
            expect(
                body.includes('取值') ||
                    body.includes('count_label') ||
                    body.includes('Value'),
            ).toBe(true);
            expect(
                body.includes('个可用月前') ||
                    body.includes('count_unit') ||
                    body.includes('available month'),
            ).toBe(true);

            const input = document.querySelector('input');
            expect(input).not.toBeNull();
            // 缺省 count = 1
            expect((input as HTMLInputElement).value).toBe('1');
            // 不再有内联 ⓘ 与静态「上月」提示
            expect(
                document.querySelector('.tabler-icon-help-circle'),
            ).toBeNull();
        });
    });
});
