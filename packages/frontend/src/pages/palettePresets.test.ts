import { describe, expect, test } from 'vitest';
import {
    colorDifference,
    MIN_COLOR_DIFF,
} from '../hooks/useChartColorConfig/hashColorAssignment';
import COLOR_PALETTE_PRESETS from './palettePresets';

/**
 * 调色板预设自检。
 *
 * 1) 任何预设都不允许出现**完全相同**的颜色（曾出现 dataMatrix 里 `#0088FF`
 *    重复两次，弹层里看起来就是"色板里有两个一样的色块"）。
 * 2) 分类色板（dataMatrix）还要求两两距离 ≥ MIN_COLOR_DIFF：距离更近的颜色
 *    在分配时会被避让逻辑跳过，用户会看到"选了色板但线条不是色板里的颜色"。
 *    单色系预设（business / retro / modern）本身就是同色相深浅过渡，不做距离
 *    约束——它们的取舍见 docs/visualization/chart-color-sync-optimization.md。
 */
describe('颜色调色板预设', () => {
    test.each(
        COLOR_PALETTE_PRESETS.map((preset) => [preset.name, preset] as const),
    )('%s：无完全重复的颜色', (_name, preset) => {
        const colors = preset.colors.map((color) => color.toLowerCase());

        // echarts 预设直接复用 ECharts 默认 9 色，其余预设为 20 色
        expect(colors.length).toBeGreaterThanOrEqual(9);
        expect(new Set(colors).size).toBe(colors.length);
    });

    test('dataMatrix：两两颜色距离 ≥ MIN_COLOR_DIFF', () => {
        const preset = COLOR_PALETTE_PRESETS.find(
            (item) => item.name === 'dataMatrix',
        );
        expect(preset).toBeDefined();
        const colors = preset?.colors ?? [];

        const tooClose: string[] = [];
        for (let i = 0; i < colors.length; i += 1) {
            for (let j = i + 1; j < colors.length; j += 1) {
                if (colorDifference(colors[i], colors[j]) < MIN_COLOR_DIFF) {
                    tooClose.push(`${colors[i]} / ${colors[j]}`);
                }
            }
        }
        expect(tooClose).toEqual([]);
    });
});
