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
 * 2) `kind: 'categorical'`（自研拟类色板，当前为 dataMatrix）还要求两两距离
 *    ≥ MIN_COLOR_DIFF：距离更近的颜色在分配时会被避让逻辑跳过，用户会看到
 *    "选了色板但线条不是色板里的颜色"。
 *    `kind: 'sequential'`（modern / retro / business）是同色相深浅过渡，
 *    `kind: 'upstream'`（echarts / default / lightdash）是外部/历史调色板，
 *    两者都只校验无完全重复色——这是设计意图，不是缺陷。
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

    test('拟类色板（categorical）：两两颜色距离 ≥ MIN_COLOR_DIFF', () => {
        const categorical = COLOR_PALETTE_PRESETS.filter(
            (preset) => preset.kind === 'categorical',
        );
        expect(categorical.length).toBeGreaterThan(0);

        const offenders: string[] = [];
        categorical.forEach((preset) => {
            const { colors } = preset;
            for (let i = 0; i < colors.length; i += 1) {
                for (let j = i + 1; j < colors.length; j += 1) {
                    if (
                        colorDifference(colors[i], colors[j]) < MIN_COLOR_DIFF
                    ) {
                        offenders.push(
                            `${preset.name}: ${colors[i]} / ${colors[j]}`,
                        );
                    }
                }
            }
        });
        expect(offenders).toEqual([]);
    });
});
