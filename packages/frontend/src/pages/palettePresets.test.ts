import { describe, expect, test } from 'vitest';
import {
    colorDifference,
    MIN_COLOR_DIFF,
} from '../hooks/useChartColorConfig/hashColorAssignment';
import COLOR_PALETTE_PRESETS, { matchesColorPalette } from './palettePresets';

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

/**
 * 「当前选中」识别：matchesColorPalette。
 *
 * 回归背景（afcb553e9）：dataMatrix 预设清洗掉 5 个近重复色后，
 * 用旧色值保存过的看板 config.colorPalette 与新 colors 不再全等，
 * 弹层里所有预设都失去选中态。选中态判断需同时认得 legacyColors，
 * 且对大小写/空白/重复色做归一化后再比较。
 */
describe('matchesColorPalette（弹层选中态识别）', () => {
    const dataMatrix = COLOR_PALETTE_PRESETS.find(
        (preset) => preset.name === 'dataMatrix',
    );
    expect(dataMatrix).toBeDefined();

    // afcb553e9 清洗前的旧 20 色（含重复的 #0088FF）
    const LEGACY_DATA_MATRIX = [
        '#FF00FF',
        '#00FFFF',
        '#FFFF00',
        '#FF0080',
        '#00FF00',
        '#00FF80',
        '#8000FF',
        '#FF8000',
        '#FF0088',
        '#00FF88',
        '#0088FF',
        '#88FF00',
        '#FF8800',
        '#8800FF',
        '#0088FF',
        '#FF00CC',
        '#CCFF00',
        '#00CCFF',
        '#CC00FF',
        '#FFCC00',
    ];

    test('旧 dataMatrix 20 色（含重复 #0088FF）→ 命中 dataMatrix', () => {
        expect(matchesColorPalette(dataMatrix!, LEGACY_DATA_MATRIX)).toBe(true);
    });

    test('新 dataMatrix 20 色 → 命中 dataMatrix', () => {
        expect(matchesColorPalette(dataMatrix!, dataMatrix!.colors)).toBe(true);
    });

    test('大小写/空白差异 → 仍命中', () => {
        expect(
            matchesColorPalette(
                dataMatrix!,
                dataMatrix!.colors.map((color, idx) =>
                    idx % 2 === 0
                        ? `  ${color.toLowerCase()} `
                        : color.toUpperCase(),
                ),
            ),
        ).toBe(true);
        expect(
            matchesColorPalette(
                dataMatrix!,
                LEGACY_DATA_MATRIX.map((color) => ` ${color.toLowerCase()} `),
            ),
        ).toBe(true);
    });

    test('自定义 20 色（换掉其中一个色）→ 不命中任何预设', () => {
        const custom = [...dataMatrix!.colors];
        custom[3] = '#123456';
        COLOR_PALETTE_PRESETS.forEach((preset) => {
            expect(matchesColorPalette(preset, custom)).toBe(false);
        });
        const customLegacy = [...LEGACY_DATA_MATRIX];
        customLegacy[3] = '#123456';
        COLOR_PALETTE_PRESETS.forEach((preset) => {
            expect(matchesColorPalette(preset, customLegacy)).toBe(false);
        });
    });

    test('null / [] → 不命中', () => {
        COLOR_PALETTE_PRESETS.forEach((preset) => {
            expect(matchesColorPalette(preset, null)).toBe(false);
            expect(matchesColorPalette(preset, [])).toBe(false);
            expect(matchesColorPalette(preset, undefined)).toBe(false);
        });
    });
});
