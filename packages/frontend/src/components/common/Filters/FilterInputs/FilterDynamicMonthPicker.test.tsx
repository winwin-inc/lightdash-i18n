import { renderWithProviders } from '../../../../testing/testUtils';
import FilterDynamicMonthPicker from './FilterDynamicMonthPicker';
import { describe, expect, it, vi } from 'vitest';

// 回归：编辑模式 + 动态分支渲染「上月」与可见的 ⓘ（此前 MantineIcon
// 传 color="dimmed" 会被原样写进 svg stroke，非法颜色导致图标不可见）
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
        it('renders the preset label and a visible help icon', () => {
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

            const svg = document.querySelector(
                '.tabler-icon-help-circle',
            ) as SVGSVGElement | null;
            expect(svg).not.toBeNull();
            // currentColor（跟随文字色，始终可见）；'dimmed' 为非法颜色字面量
            expect(svg?.getAttribute('stroke')).not.toBe('dimmed');
        });
    });
});
