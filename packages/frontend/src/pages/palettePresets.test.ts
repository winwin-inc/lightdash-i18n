import { describe, expect, test } from 'vitest';
import {
    colorDifference,
    MIN_COLOR_DIFF,
} from '../hooks/useChartColorConfig/hashColorAssignment';
import COLOR_PALETTE_PRESETS, {
    matchesColorPalette,
    reconcileColorPalette,
} from './palettePresets';

/**
 * 调色板预设自检。
 *
 * 1) 任何预设都不允许出现**完全相同**的颜色（曾出现 dataMatrix 里 `#0088FF`
 *    重复两次，弹层里看起来就是"色板里有两个一样的色块"）。
 * 2) `kind: 'categorical'`（自研拟类色板，当前为 dataMatrix）还要求：
 *    - 两两感知色差（CIEDE2000，`colorDifference`）≥ MIN_COLOR_DIFF；
 *    - 同一 30° 色相族最多 2 色。
 *    更近的颜色在分配时会被避让逻辑跳过，用户会看到"选了色板但线条不是
 *    色板里的颜色"；同簇近重复色则会画出几条肉眼难分的同色线（用户截图里
 *    dataMatrix 同时出现 3 条黄线即是此问题）。
 *    `kind: 'sequential'`（modern / retro / business）是同色相深浅过渡，
 *    `kind: 'upstream'`（echarts / default / lightdash）是外部/历史调色板，
 *    两者都只校验无完全重复色——这是设计意图，不是缺陷。
 */

/** hex → HSL 色相（0–359）。仅支持预设使用的 6 位 hex。 */
const hueOf = (hex: string): number => {
    const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    expect(match, `非法 hex：${hex}`).not.toBeNull();
    const int = parseInt(match![1], 16);
    const r = ((int >> 16) & 255) / 255;
    const g = ((int >> 8) & 255) / 255;
    const b = (int & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) {
        return 0; // 灰阶无色相，归入红族即可（categorical 预设不含灰）
    }
    let hue: number;
    if (max === r) {
        hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
        hue = 60 * ((b - r) / delta + 2);
    } else {
        hue = 60 * ((r - g) / delta + 4);
    }
    return (hue + 360) % 360;
};

/**
 * 色相分族规则：30° 一档、共 12 族（边界在 15+30k，红族跨 0° 回绕）。
 * categorical 预设要求同一族最多 2 色（两色还需 ΔE00 ≥ MIN_COLOR_DIFF，
 * 由下面的距离断言兜住）。
 */
const HUE_FAMILY_NAMES = [
    '红',
    '橙',
    '黄',
    '黄绿',
    '绿',
    '春绿',
    '青',
    '天蓝',
    '蓝',
    '紫',
    '品红',
    '玫红',
];
const hueFamilyOf = (hex: string): number =>
    Math.floor((hueOf(hex) + 15) / 30) % HUE_FAMILY_NAMES.length;

describe('颜色调色板预设', () => {
    test.each(
        COLOR_PALETTE_PRESETS.map((preset) => [preset.name, preset] as const),
    )('%s：无完全重复的颜色', (_name, preset) => {
        const colors = preset.colors.map((color) => color.toLowerCase());

        // echarts 预设直接复用 ECharts 默认 9 色，其余预设为 20 色
        expect(colors.length).toBeGreaterThanOrEqual(9);
        expect(new Set(colors).size).toBe(colors.length);
    });

    test('拟类色板（categorical）：仍为 20 色（容量不缩水）', () => {
        const categorical = COLOR_PALETTE_PRESETS.filter(
            (preset) => preset.kind === 'categorical',
        );
        expect(categorical.length).toBeGreaterThan(0);
        categorical.forEach((preset) => {
            expect(preset.colors).toHaveLength(20);
        });
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
                    const diff = colorDifference(colors[i], colors[j]);
                    if (diff < MIN_COLOR_DIFF) {
                        offenders.push(
                            `${preset.name}: ${colors[i]} / ${colors[j]} ΔE00=${diff.toFixed(2)}`,
                        );
                    }
                }
            }
        });
        expect(offenders).toEqual([]);
    });

    test.each(
        COLOR_PALETTE_PRESETS.filter(
            (preset) => preset.kind === 'categorical',
        ).map((preset) => [preset.name, preset] as const),
    )('%s：两两 ΔE00 最小值 ≥ MIN_COLOR_DIFF', (_name, preset) => {
        const { colors } = preset;
        let min = Number.POSITIVE_INFINITY;
        let minPair = '';
        for (let i = 0; i < colors.length; i += 1) {
            for (let j = i + 1; j < colors.length; j += 1) {
                const diff = colorDifference(colors[i], colors[j]);
                if (diff < min) {
                    min = diff;
                    minPair = `${colors[i]} / ${colors[j]}`;
                }
            }
        }
        expect(
            min,
            `${_name} 两两 ΔE00 最小值仅 ${min.toFixed(2)}（${minPair}），低于阈值 ${MIN_COLOR_DIFF}`,
        ).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);
    });

    test('拟类色板（categorical）：同一 30° 色相族最多 2 色', () => {
        const categorical = COLOR_PALETTE_PRESETS.filter(
            (preset) => preset.kind === 'categorical',
        );
        expect(categorical.length).toBeGreaterThan(0);

        categorical.forEach((preset) => {
            const byFamily = new Map<number, string[]>();
            preset.colors.forEach((color) => {
                const family = hueFamilyOf(color);
                byFamily.set(family, [...(byFamily.get(family) ?? []), color]);
            });
            byFamily.forEach((colors, family) => {
                expect(
                    colors.length,
                    `${preset.name} 的「${HUE_FAMILY_NAMES[family]}」族有 ${colors.length} 色（${colors.join(' ')}），超过同族上限 2`,
                ).toBeLessThanOrEqual(2);
            });
        });
    });
});

/**
 * 「当前选中」识别：matchesColorPalette。
 *
 * 回归背景：
 * - afcb553e9：dataMatrix 预设清洗掉 5 个近重复色（含重复的 #0088FF）后，
 *   用旧色值保存过的看板 config.colorPalette 与新 colors 不再全等。
 * - 2026-11-19：度量换成 CIEDE2000（阈值 MIN_COLOR_DIFF=12）后再次整组
 *   清洗 dataMatrix，又退役一组 20 色。
 * 选中态判断需同时认得这两组 legacyColors，且对大小写/空白/重复色做
 * 归一化后再比较。
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

    // 2026-11-19 CIEDE2000 清洗前（原 HEAD）的 20 色
    const LEGACY_DATA_MATRIX_CIEDE2000 = [
        '#FF00FF',
        '#00FFFF',
        '#FFFF00',
        '#FF0080',
        '#00FF00',
        '#00FF80',
        '#8000FF',
        '#FF8000',
        '#FF0040',
        '#00FFC0',
        '#0088FF',
        '#88FF00',
        '#FF4000',
        '#4000FF',
        '#00FF40',
        '#FF00CC',
        '#CCFF00',
        '#00CCFF',
        '#CC00FF',
        '#FFCC00',
    ];

    test('每个预设的 colors 自身都命中自己（选中态不回归）', () => {
        COLOR_PALETTE_PRESETS.forEach((preset) => {
            expect(matchesColorPalette(preset, preset.colors)).toBe(true);
        });
    });

    test('每个预设声明的每组 legacyColors 都命中自己', () => {
        COLOR_PALETTE_PRESETS.forEach((preset) => {
            (preset.legacyColors ?? []).forEach((legacy) => {
                expect(matchesColorPalette(preset, legacy)).toBe(true);
            });
        });
        // dataMatrix 历史上清洗过两次（afcb553e9 与 2026-11-19 CIEDE2000），
        // 必须同时登记这两组历史值
        expect(dataMatrix!.legacyColors?.length).toBe(2);
    });

    test('旧 dataMatrix 20 色（含重复 #0088FF）→ 命中 dataMatrix', () => {
        expect(matchesColorPalette(dataMatrix!, LEGACY_DATA_MATRIX)).toBe(true);
    });

    test('CIEDE2000 清洗前（原 HEAD）的 20 色 → 命中 dataMatrix', () => {
        expect(
            matchesColorPalette(dataMatrix!, LEGACY_DATA_MATRIX_CIEDE2000),
        ).toBe(true);
    });

    test('新 dataMatrix 20 色 → 命中 dataMatrix，且两组历史值已登记在 legacyColors', () => {
        expect(matchesColorPalette(dataMatrix!, dataMatrix!.colors)).toBe(true);
        expect(dataMatrix!.legacyColors).toBeDefined();
        expect(
            dataMatrix!.legacyColors?.some(
                (legacy) =>
                    JSON.stringify(legacy) ===
                    JSON.stringify(LEGACY_DATA_MATRIX),
            ),
        ).toBe(true);
        expect(
            dataMatrix!.legacyColors?.some(
                (legacy) =>
                    JSON.stringify(legacy) ===
                    JSON.stringify(LEGACY_DATA_MATRIX_CIEDE2000),
            ),
        ).toBe(true);
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
        expect(
            matchesColorPalette(
                dataMatrix!,
                LEGACY_DATA_MATRIX_CIEDE2000.map((color) =>
                    color.toLowerCase(),
                ),
            ),
        ).toBe(true);
    });

    test('自定义 20 色（新色/两套历史色各换掉其中一个色）→ 不命中任何预设', () => {
        const mutate = (base: string[]): string[] => {
            const custom = [...base];
            custom[3] = '#123456';
            return custom;
        };
        [dataMatrix!.colors, LEGACY_DATA_MATRIX, LEGACY_DATA_MATRIX_CIEDE2000]
            .map(mutate)
            .forEach((custom) => {
                COLOR_PALETTE_PRESETS.forEach((preset) => {
                    expect(matchesColorPalette(preset, custom)).toBe(false);
                });
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

/**
 * 读路径对账：reconcileColorPalette。
 *
 * 看板把选中色板以**色值数组**存库，预设色值清洗后老看板仍存旧色值。
 * 若不在读路径对账，清洗永远对既有看板不生效（用户仍看到多条黄线）。
 */
describe('reconcileColorPalette（读路径色板对账）', () => {
    const dataMatrix = COLOR_PALETTE_PRESETS.find(
        (preset) => preset.name === 'dataMatrix',
    )!;

    test('两套历史色值 → 换成当前预设色值', () => {
        (dataMatrix.legacyColors ?? []).forEach((legacy) => {
            expect(reconcileColorPalette(legacy)).toEqual(dataMatrix.colors);
        });
    });

    test('已经是当前色值 → 原样返回（引用不变）', () => {
        const current = dataMatrix.colors;
        expect(reconcileColorPalette(current)).toBe(current);
    });

    test('非预设色板（自定义/组织色板）→ 原样返回', () => {
        const custom = ['#111111', '#222222', '#333333'];
        expect(reconcileColorPalette(custom)).toBe(custom);
    });

    test('大小写/空白不同也能对账', () => {
        const legacy = (dataMatrix.legacyColors ?? [])[0] ?? [];
        const messy = legacy.map((color) => ` ${color.toUpperCase()} `);
        expect(reconcileColorPalette(messy)).toEqual(dataMatrix.colors);
    });

    test('null / [] → null（调用方自行回退到组织色板）', () => {
        expect(reconcileColorPalette(null)).toBeNull();
        expect(reconcileColorPalette(undefined)).toBeNull();
        expect(reconcileColorPalette([])).toBeNull();
    });

    test('其他预设的旧色值也能对账回各自当前色值', () => {
        COLOR_PALETTE_PRESETS.forEach((preset) => {
            (preset.legacyColors ?? []).forEach((legacy) => {
                expect(reconcileColorPalette(legacy)).toEqual(preset.colors);
            });
        });
    });
});
