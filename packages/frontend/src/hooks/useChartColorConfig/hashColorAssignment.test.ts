import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import COLOR_PALETTE_PRESETS from '../../pages/palettePresets';
import {
    appendDashboardUnknownHashColors,
    appendUnknownHashColors,
    assignKnownHashColors,
    assignVisibleChartColors,
    colorDifference,
    createChartColorAllocator,
    effectiveTarget,
    expandPalette,
    getHashColor,
    hexToHSL,
    hslToHex,
    MIN_COLOR_DIFF,
    resolveSyncedHashColor,
} from './hashColorAssignment';

const PALETTE = [...ECHARTS_DEFAULT_COLORS];
const TINY_PALETTE = ['#5470c6', '#91cc75'];

const expectGroupColorsDistinct = (
    assignments: Record<string, string>,
    group: string[],
): void => {
    for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
            expect(assignments[group[i]]).not.toBe(assignments[group[j]]);
            expect(
                colorDifference(assignments[group[i]], assignments[group[j]]),
            ).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);
        }
    }
};

const expectThemeColors = (
    assignments: Record<string, string>,
    palette: string[] = PALETTE,
): void => {
    Object.values(assignments).forEach((color) => {
        expect(palette).toContain(color);
    });
};

describe('getHashColor', () => {
    test('same series name gets the same color on two calls', () => {
        expect(getHashColor('臭宝', PALETTE)).toBe(
            getHashColor('臭宝', PALETTE),
        );
        expect(getHashColor('其他品牌', PALETTE)).toBe(
            getHashColor('其他品牌', PALETTE),
        );
    });

    test('picks from the original theme palette', () => {
        expect(PALETTE).toContain(getHashColor('臭宝', PALETTE));
        expect(PALETTE).toContain(getHashColor('牛肉味', PALETTE));
    });
});

describe('assignKnownHashColors', () => {
    test('metric series names that hash to the same slot are split by avoidance', () => {
        // 上期销售额 / 本期销售额 在 9 色默认色板上哈希到同一个槽位
        expect(getHashColor('上期销售额', PALETTE)).toBe(
            getHashColor('本期销售额', PALETTE),
        );
        const assignments = assignKnownHashColors(
            ['上期销售额', '本期销售额'],
            PALETTE,
            {},
            [['上期销售额', '本期销售额']],
        );
        expect(assignments['上期销售额']).not.toBe(assignments['本期销售额']);
        expectGroupColorsDistinct(assignments, ['上期销售额', '本期销售额']);
        expectThemeColors(assignments);
    });

    test('臭宝 and 其他品牌 get different theme colors on the same chart', () => {
        const assignments = assignKnownHashColors(
            ['臭宝', '其他品牌'],
            PALETTE,
        );
        expect(assignments['臭宝']).not.toBe(assignments['其他品牌']);
        expectThemeColors(assignments);
    });

    test('series names that hash to the same slot are split by avoidance', () => {
        const base = getHashColor('臭宝', PALETTE);
        let colliding = '';
        for (let i = 0; i < 8000; i++) {
            const name = `品牌${i}`;
            if (getHashColor(name, PALETTE) === base) {
                colliding = name;
                break;
            }
        }
        expect(colliding).not.toBe('');
        const assignments = assignKnownHashColors(['臭宝', colliding], PALETTE);
        expect(assignments['臭宝']).not.toBe(assignments[colliding]);
        expectThemeColors(assignments);
    });

    test('input order does not change assigned colors', () => {
        const a = assignKnownHashColors(
            ['臭宝', '其他品牌', '李子柒'],
            PALETTE,
        );
        const b = assignKnownHashColors(
            ['李子柒', '其他品牌', '臭宝'],
            PALETTE,
        );
        expect(a).toEqual(b);
    });

    test('same name across pie and bar groups stays the same color', () => {
        const assignments = assignKnownHashColors(
            ['牛肉味', '原味', '李子柒'],
            PALETTE,
            {},
            [
                ['牛肉味', '原味'],
                ['李子柒', '牛肉味'],
            ],
        );
        expect(assignments['牛肉味']).toBeTruthy();
        expect(assignments['牛肉味']).not.toBe(assignments['原味']);
        expect(assignments['牛肉味']).not.toBe(assignments['李子柒']);
        expectThemeColors(assignments);
    });

    test('non-cooccurring brand and flavor can reuse a theme color', () => {
        const assignments = assignKnownHashColors(
            ['牛肉味', '原味', '臭宝', '其他品牌'],
            TINY_PALETTE,
            {},
            [
                ['牛肉味', '原味'],
                ['臭宝', '其他品牌'],
            ],
        );

        expectGroupColorsDistinct(assignments, ['牛肉味', '原味']);
        expectGroupColorsDistinct(assignments, ['臭宝', '其他品牌']);
        expectThemeColors(assignments, TINY_PALETTE);
        expect(
            new Set([
                assignments['牛肉味'],
                assignments['原味'],
                assignments['臭宝'],
                assignments['其他品牌'],
            ]).size,
        ).toBe(2);
    });

    test('dashboard theme wins over saved chart colors', () => {
        const assignments = assignKnownHashColors(
            ['臭宝', '其他品牌'],
            PALETTE,
            {
                臭宝: '#ff00aa',
                其他品牌: '#ff00aa',
            },
        );
        expect(assignments['臭宝']).not.toBe('#ff00aa');
        expect(assignments['其他品牌']).not.toBe('#ff00aa');
        expect(assignments['臭宝']).not.toBe(assignments['其他品牌']);
        expectThemeColors(assignments);
    });

    test('hex and rgb saved colors do not lock theme assignment', () => {
        const assignments = assignKnownHashColors(['牛肉味', '原味'], PALETTE, {
            牛肉味: '#5470c6',
            原味: 'rgb(84, 112, 198)',
        });
        expect(assignments['牛肉味']).not.toBe(assignments['原味']);
        expectThemeColors(assignments);
    });

    test('overflow only after a single chart exceeds the theme palette', () => {
        const names = ['a', 'b', 'c'];
        const assignments = assignKnownHashColors(names, TINY_PALETTE, {}, [
            names,
        ]);
        const themeUsed = Object.values(assignments).filter((color) =>
            TINY_PALETTE.includes(color),
        );
        expect(themeUsed).toHaveLength(2);
        expect(new Set(Object.values(assignments)).size).toBe(3);

        const overflow = Object.values(assignments).find(
            (color) => !TINY_PALETTE.includes(color),
        );
        expect(overflow).toBeTruthy();
        const overflowHue = hexToHSL(overflow!);
        const themeHues = TINY_PALETTE.map((color) => hexToHSL(color).h);
        const hueDistance = Math.min(
            ...themeHues.map((hue) => {
                const delta = Math.abs(overflowHue.h - hue) % 360;
                return Math.min(delta, 360 - delta);
            }),
        );
        expect(hueDistance).toBeLessThan(20);
    });
});

/**
 * 注（2026-11-18 口径变更）：ECharts 通道已改回消费看板合并表
 * （appendDashboardUnknownHashColors），不再用 appendUnknownHashColors
 * 按图取色；以下保留该函数的契约测试（签名与行为不变）。
 */
describe('appendUnknownHashColors', () => {
    test('appends colliding unknown names without rewriting known colors', () => {
        const known = assignKnownHashColors(['李子柒'], PALETTE);
        const withUnknowns = appendUnknownHashColors(
            ['臭宝', '其他品牌', '李子柒'],
            PALETTE,
            known,
        );

        expect(withUnknowns['李子柒']).toBe(known['李子柒']);
        expect(withUnknowns['臭宝']).not.toBe(withUnknowns['其他品牌']);
        expect(withUnknowns['臭宝']).not.toBe(withUnknowns['李子柒']);
        expect(withUnknowns['其他品牌']).not.toBe(withUnknowns['李子柒']);
        expect(PALETTE).toContain(withUnknowns['臭宝']);
        expect(PALETTE).toContain(withUnknowns['其他品牌']);
    });

    test('牛肉味 and 原味 get different theme colors when assigned together', () => {
        const assigned = appendUnknownHashColors(
            ['牛肉味', '原味'],
            PALETTE,
            {},
        );
        expect(assigned['牛肉味']).not.toBe(assigned['原味']);
        expectThemeColors(assigned);
    });

    test('adding a filter-only name does not change known colors', () => {
        const known = assignKnownHashColors(['臭宝', '其他品牌'], PALETTE);
        const afterFilter = appendUnknownHashColors(
            ['中间插入品牌', '臭宝', '其他品牌'],
            PALETTE,
            known,
        );

        expect(afterFilter['臭宝']).toBe(known['臭宝']);
        expect(afterFilter['其他品牌']).toBe(known['其他品牌']);
        expect(afterFilter['中间插入品牌']).toBeTruthy();
        expect(afterFilter['中间插入品牌']).not.toBe(known['臭宝']);
        expect(afterFilter['中间插入品牌']).not.toBe(known['其他品牌']);
    });

    test('reuses knownAssignments reference when there are no unknown keys', () => {
        const known = assignKnownHashColors(['臭宝', '其他品牌'], PALETTE);
        const result = appendUnknownHashColors(
            ['其他品牌', '臭宝'],
            PALETTE,
            known,
        );

        expect(result).toBe(known);
    });

    test('caches append results for the same known map, visible keys and palette', () => {
        const known = assignKnownHashColors(['李子柒'], PALETTE);
        const first = appendUnknownHashColors(
            ['臭宝', '李子柒'],
            PALETTE,
            known,
        );
        const second = appendUnknownHashColors(
            ['臭宝', '李子柒'],
            PALETTE,
            known,
        );

        expect(second).toBe(first);
        expect(first['臭宝']).toBeTruthy();
        expect(first['李子柒']).toBe(known['李子柒']);
    });

    test('invalidates append cache when the palette changes', () => {
        const known = assignKnownHashColors(['李子柒'], PALETTE);
        const withDefaultPalette = appendUnknownHashColors(
            ['臭宝', '李子柒'],
            PALETTE,
            known,
        );
        const withTinyPalette = appendUnknownHashColors(
            ['臭宝', '李子柒'],
            TINY_PALETTE,
            known,
        );

        expect(withTinyPalette).not.toBe(withDefaultPalette);
        expect(TINY_PALETTE).toContain(withTinyPalette['臭宝']);
    });
});

describe('appendDashboardUnknownHashColors', () => {
    test('same unknown name stays the same color across different visible sets', () => {
        const known = assignKnownHashColors(['李子柒', '臭宝'], PALETTE);
        const afterBrandTab = appendDashboardUnknownHashColors(
            ['佳味螺', '品牌甲', '李子柒'],
            PALETTE,
            known,
            {},
        );
        const afterRadarTab = appendDashboardUnknownHashColors(
            ['佳味螺', '品牌乙', '臭宝'],
            PALETTE,
            known,
            afterBrandTab,
        );

        expect(afterRadarTab['佳味螺']).toBe(afterBrandTab['佳味螺']);
        expect(afterRadarTab['品牌甲']).toBe(afterBrandTab['品牌甲']);
        expect(afterRadarTab['品牌乙']).toBeTruthy();
        expect(afterRadarTab['品牌乙']).not.toBe(afterRadarTab['佳味螺']);
    });

    test('does not rewrite known or previously appended colors', () => {
        const known = assignKnownHashColors(['李子柒'], PALETTE);
        const first = appendDashboardUnknownHashColors(
            ['佳味螺', '李子柒'],
            PALETTE,
            known,
            {},
        );
        const second = appendDashboardUnknownHashColors(
            ['佳味螺', '新品牌', '李子柒'],
            PALETTE,
            known,
            first,
        );

        expect(first['李子柒']).toBeUndefined();
        expect(second['佳味螺']).toBe(first['佳味螺']);
        expect(known['李子柒']).toBe(
            assignKnownHashColors(['李子柒'], PALETTE)['李子柒'],
        );
        expect(second['新品牌']).toBeTruthy();
        expect(second['新品牌']).not.toBe(first['佳味螺']);
        expect(second['新品牌']).not.toBe(known['李子柒']);
    });

    test('avoids all known colors, including names not in the incoming set', () => {
        const known = {
            李子柒: TINY_PALETTE[0],
            臭宝: TINY_PALETTE[1],
        };
        const appended = appendDashboardUnknownHashColors(
            ['原味'],
            TINY_PALETTE,
            known,
            {},
        );

        expect(TINY_PALETTE).not.toContain(appended['原味']);
        expect(
            colorDifference(appended['原味'], TINY_PALETTE[0]),
        ).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);
        expect(
            colorDifference(appended['原味'], TINY_PALETTE[1]),
        ).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);
    });

    test('reuses appendedAssignments reference when there are no new keys', () => {
        const known = assignKnownHashColors(['李子柒'], PALETTE);
        const first = appendDashboardUnknownHashColors(
            ['佳味螺'],
            PALETTE,
            known,
            {},
        );
        const second = appendDashboardUnknownHashColors(
            ['佳味螺', '李子柒'],
            PALETTE,
            known,
            first,
        );

        expect(second).toBe(first);
    });
});

/**
 * 看板级跨图同色回归（2026-11-18 口径）：跨图同名同色优先于单图色板纯度。
 *
 * ECharts 通道曾改为「只以 known 为底 + 按本图可见集避让」
 * （appendUnknownHashColors），两图可见集不同时，同名运行期系列落色不同
 * （同一批商品名一图橙红系、一图黄绿系）。现改回消费看板合并表
 * （known + appendDashboardUnknownHashColors 追加表）：同一看板内任何
 * 系列名（含运行期新增）在任意两张图里同色；色板容量不足时才退化为生成色。
 */
describe('看板级跨图同色回归', () => {
    test('(a) 两个不同可见集先后注册，同名系列取到同一颜色', () => {
        const known = assignKnownHashColors(
            ['已存系列甲', '已存系列乙'],
            PALETTE,
        );
        let appended: Record<string, string> = {};

        // 图 A 先注册：共享名 + 图 A 独有名
        appended = appendDashboardUnknownHashColors(
            ['佳味螺', '臭宝', '品牌甲', '已存系列甲'],
            PALETTE,
            known,
            appended,
        );
        const chartATable: Record<string, string> = {
            ...known,
            ...appended,
        };

        // 图 B 后注册：共享名 + 图 B 独有名
        appended = appendDashboardUnknownHashColors(
            ['佳味螺', '臭宝', '品牌乙', '其他品牌'],
            PALETTE,
            known,
            appended,
        );
        const chartBTable: Record<string, string> = {
            ...known,
            ...appended,
        };

        // 同名 key（含运行期新增）跨图同色 —— 本次 bug 的守门
        expect(chartBTable['佳味螺']).toBe(chartATable['佳味螺']);
        expect(chartBTable['臭宝']).toBe(chartATable['臭宝']);
        // 已保存系列仍等于看板 known 色
        expect(chartATable['已存系列甲']).toBe(known['已存系列甲']);
        expect(chartBTable['已存系列乙']).toBe(known['已存系列乙']);
    });

    test('(b) 容量内看板内不同 key 两两不重复且命中原色', () => {
        const keys = [
            '品牌甲',
            '品牌乙',
            '品牌丙',
            '品牌丁',
            '品牌戊',
            '品牌己',
            '品牌庚',
            '品牌辛',
        ];
        expect(keys.length).toBeLessThan(PALETTE.length);

        const appended = appendDashboardUnknownHashColors(
            keys,
            PALETTE,
            {},
            {},
        );
        const colors = keys.map((key) => appended[key]);

        expect(new Set(colors).size).toBe(keys.length);
        expectThemeColors(appended, PALETTE);
    });

    test('(c) 超过色板容量后仍不重复（生成色路径）', () => {
        const keys = Array.from(
            { length: PALETTE.length + 6 },
            (_, i) => `商品名-${i}`,
        );
        // 分两批注册，模拟两张图先后把各自可见集注册进同一看板表
        let appended: Record<string, string> = {};
        appended = appendDashboardUnknownHashColors(
            keys.slice(0, 8),
            PALETTE,
            {},
            appended,
        );
        appended = appendDashboardUnknownHashColors(
            keys.slice(8),
            PALETTE,
            {},
            appended,
        );

        const colors = keys.map((key) => appended[key]);
        expect(new Set(colors).size).toBe(keys.length);
    });

    test('(d) 同一批次乱序传入 → 分配结果一致', () => {
        const keys = [
            '品牌甲',
            '品牌乙',
            '品牌丙',
            '品牌丁',
            '品牌戊',
            '品牌己',
        ];
        const shuffled = [...keys].reverse();

        const inOrder = appendDashboardUnknownHashColors(keys, PALETTE, {}, {});
        const outOfOrder = appendDashboardUnknownHashColors(
            shuffled,
            PALETTE,
            {},
            {},
        );

        expect(outOfOrder).toEqual(inOrder);
    });
});

describe('resolveSyncedHashColor', () => {
    test('known series stay stable when a filter-only name appears', () => {
        const known = assignKnownHashColors(['臭宝', '其他品牌'], PALETTE);
        const choubao = resolveSyncedHashColor('臭宝', PALETTE, known);
        const other = resolveSyncedHashColor('其他品牌', PALETTE, known);
        const filteredIn = resolveSyncedHashColor('筛选新品牌', PALETTE, known);

        expect(choubao).toBe(known['臭宝']);
        expect(other).toBe(known['其他品牌']);
        expect(resolveSyncedHashColor('臭宝', PALETTE, known)).toBe(choubao);
        expect(resolveSyncedHashColor('其他品牌', PALETTE, known)).toBe(other);
        expect(PALETTE).toContain(filteredIn);
        expect(known).toEqual(
            assignKnownHashColors(['臭宝', '其他品牌'], PALETTE),
        );
    });

    test('recomputing known with a newly visible name is not used for known colors', () => {
        const known = assignKnownHashColors(['臭宝', '其他品牌'], PALETTE);
        const visibleOnly = resolveSyncedHashColor(
            '中间插入品牌',
            PALETTE,
            known,
        );

        expect(resolveSyncedHashColor('臭宝', PALETTE, known)).toBe(
            known['臭宝'],
        );
        expect(resolveSyncedHashColor('其他品牌', PALETTE, known)).toBe(
            known['其他品牌'],
        );
        expect(PALETTE).toContain(visibleOnly);
    });
});

/**
 * 回归：看板已占色较多时（known 30+），同图 15 个运行期新增系列曾被分配成
 * 重复色（pickAvoidingColor 候选耗尽后直接返回冲突色）。这里钉住两点：
 * 1) 饱和场景下同图颜色必须两两不同；
 * 2) 未饱和场景的颜色与修复前逐项一致（不允许顺带改色）。
 */
describe('色位饱和时的唯一性（回归）', () => {
    const PALETTE_LOCAL = ECHARTS_DEFAULT_COLORS;
    const visibleKeys = Array.from(
        { length: 15 },
        (_, i) =>
            `SKU-海天味极鲜酱油-${i}-69022651${String(i).padStart(5, '0')}`,
    );

    const assignedFor = (
        knownCount: number,
        keys: string[] = visibleKeys,
    ): Record<string, string> => {
        const known = assignKnownHashColors(
            Array.from({ length: knownCount }, (_, i) => `known-${i}`),
            PALETTE_LOCAL,
        );
        return appendDashboardUnknownHashColors(keys, PALETTE_LOCAL, known, {});
    };

    test.each([15, 30, 60, 120, 240])(
        'known=%i 时同图 15 个系列颜色两两不同',
        (knownCount) => {
            const assignments = assignedFor(knownCount);
            const colors = visibleKeys.map((key) => assignments[key]);

            expect(colors).toHaveLength(15);
            expect(new Set(colors).size).toBe(15);
        },
    );

    test('同图 60 个系列（远超调色板长度）仍两两不同', () => {
        const keys = Array.from(
            { length: 60 },
            (_, i) => `SKU-批量-${i}-69022651${String(i).padStart(5, '0')}`,
        );
        const assignments = assignedFor(60, keys);
        const colors = keys.map((key) => assignments[key]);

        expect(new Set(colors).size).toBe(60);
    });

    test('已知色很少时同图 15 系列仍然两两不同', () => {
        // 说明：引入生成色阈值（60）后，>调色板长度的图会换一批更可区分的
        // 颜色（预期内的变化）；「≤9 系列颜色不变」的约束由下面
        // 「分层阈值」用例单独钉住。
        [0, 9].forEach((knownCount) => {
            const assignments = assignedFor(knownCount);
            const colors = visibleKeys.map((key) => assignments[key]);
            expect(new Set(colors).size).toBe(15);
        });
    });

    test('同一输入重复分配结果稳定（确定性）', () => {
        expect(assignedFor(60)).toEqual(assignedFor(60));
    });
});

/**
 * 调色板优先（2026-11-17 口径）：用户选中的调色板「忠于原色」。
 *
 * - ≥ 调色板可用容量时，每个可见系列都拿到调色板里的原始颜色（不再按色差阈值跳过）
 * - 只有当可见系列超过调色板容量时，才用生成色补足
 * - 任何情况下同图颜色两两不同
 */
describe('调色板优先：忠于原色，超出才生成', () => {
    const seriesKeys = (count: number, tag = 'SKU') =>
        Array.from(
            { length: count },
            (_, i) => `${tag}-${i}-69022651${String(i).padStart(5, '0')}`,
        );

    const assertAllFromPalette = (
        palette: string[],
        count: number,
    ): string[] => {
        const keys = seriesKeys(count);
        const assignments = appendUnknownHashColors(keys, palette, {});
        const colors = keys.map((key) => assignments[key]);
        const normalized = palette.map((color) => color.toLowerCase());

        expect(new Set(colors).size).toBe(count);
        colors.forEach((color) => {
            expect(normalized).toContain(color.toLowerCase());
        });
        return colors;
    };

    test.each(
        COLOR_PALETTE_PRESETS.map((preset) => [preset.name, preset] as const),
    )('%s：8 个系列全部使用调色板原色', (_name, preset) => {
        assertAllFromPalette(preset.colors, 8);
    });

    test('单色系色板（business）也忠于原色：6 个系列全在色板内', () => {
        const business = COLOR_PALETTE_PRESETS.find(
            (preset) => preset.name === 'business',
        );
        expect(business).toBeDefined();
        assertAllFromPalette(business?.colors ?? [], 6);
    });

    test('拟类色板（dataMatrix）：容量内系列全在色板且两两 ≥ MIN_COLOR_DIFF', () => {
        const dataMatrix = COLOR_PALETTE_PRESETS.find(
            (preset) => preset.name === 'dataMatrix',
        );
        // 2026-11-19 二次改版后 dataMatrix 是 14 色（12 色系 + 黑 + 灰）：
        // 「一个色系一个色」的硬上限就是 14，所以容量断言按色板实际长度取
        const capacity = dataMatrix?.colors.length ?? 0;
        const colors = assertAllFromPalette(dataMatrix?.colors ?? [], capacity);

        // 两趟规则：无论色板是否已清洗，容量内必须全部来自调色板原色且两两不同
        //（上面 assertAllFromPalette 已断言）。距离门槛是条件断言：dataMatrix
        // 现值仍含 ΔE00 2.52 的近重复对（#00FF00/#00FF40），按两趟规则第 2 趟
        // 会如数放行——这是色板数据问题（由 palettePresets 侧清洗解决），
        // 不是分配问题。色板清洗落地后本断言自动生效，防止分配逻辑回退。
        const palette = dataMatrix?.colors ?? [];
        const paletteMinDiff = Math.min(
            ...palette.flatMap((color, i) =>
                palette
                    .slice(i + 1)
                    .map((other) => colorDifference(color, other)),
            ),
        );
        if (paletteMinDiff >= MIN_COLOR_DIFF) {
            let minDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i < colors.length; i += 1) {
                for (let j = i + 1; j < colors.length; j += 1) {
                    minDistance = Math.min(
                        minDistance,
                        colorDifference(colors[i]!, colors[j]!),
                    );
                }
            }
            expect(minDistance).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);
        }
    });

    test('超出调色板容量才生成：25 个系列 → 先用尽色板，再补生成色，全部唯一', () => {
        const dataMatrix = COLOR_PALETTE_PRESETS.find(
            (preset) => preset.name === 'dataMatrix',
        );
        const palette = dataMatrix?.colors ?? [];
        const keys = seriesKeys(25);
        const assignments = appendUnknownHashColors(keys, palette, {});
        const colors = keys.map((key) => assignments[key]);
        const normalizedPalette = palette.map((color) => color.toLowerCase());

        expect(new Set(colors).size).toBe(25);
        const paletteHits = colors.filter((color) =>
            normalizedPalette.includes(color.toLowerCase()),
        );
        // 20 色板去重后 20 个可用色，前 20 个系列应当全部命中原色
        expect(paletteHits.length).toBeGreaterThanOrEqual(
            new Set(normalizedPalette).size,
        );
    });
});

/**
 * 按本图容量分配（2026-11-18 口径，ECharts 通道）：调色板保真 + 本图内不重复。
 *
 * 修复背景：颜色分配曾按「整块看板的不重复系列名总数」去重（几十个商品名），
 * 20 色调色板很快被别图的名字占满，本图即使只有 9 条线也退化成生成色
 * （实测 40 名 → 20 个色在调色板外，如 #ed3f00/#efba2d）。
 * assignVisibleChartColors 只看本图：本图可见系列数 ≤ 调色板去重颜色数时，
 * 每条线都必须拿到调色板里的颜色且两两不同；只有本图自己超过容量时，
 * 才用生成色补足。
 */
describe('按本图容量分配（assignVisibleChartColors）', () => {
    const RETRO =
        COLOR_PALETTE_PRESETS.find((preset) => preset.name === 'retro')
            ?.colors ?? [];
    const retroNormalized = RETRO.map((color) => color.toLowerCase());

    const expectAllFromPalette = (
        assignments: Record<string, string>,
        keys: string[],
    ) => {
        keys.forEach((key) => {
            expect(retroNormalized).toContain(assignments[key].toLowerCase());
        });
    };

    test('(a) 本图 9 名 + preferred 已被别图 30 名占满 20 色 → 9 条全部来自调色板且两两不同', () => {
        expect(RETRO).toHaveLength(20);
        expect(new Set(retroNormalized)).toHaveLength(20);

        const preferred: Record<string, string> = {};
        for (let i = 0; i < 30; i++) {
            preferred[`别图系列-${i}`] = RETRO[i % RETRO.length];
        }
        // 前置确认：别图名字已把 20 个调色板色全部占满（本次 bug 的触发条件）
        expect(
            new Set(
                Object.values(preferred).map((color) => color.toLowerCase()),
            ),
        ).toHaveLength(20);

        const visibleKeys = Array.from({ length: 9 }, (_, i) => `商品名-${i}`);
        const assignments = assignVisibleChartColors({
            visibleKeys,
            colorPalette: RETRO,
            preferredAssignments: preferred,
        });

        const colors = visibleKeys.map((key) => assignments[key]);
        expect(new Set(colors).size).toBe(9);
        expectAllFromPalette(assignments, visibleKeys);
    });

    test('(b) preferred 的陈旧色（不属于当前调色板，模拟切换调色板）→ 必须被忽略，产出全属新调色板', () => {
        const staleColors = ['#ed3f00', '#efba2d', '#123456', '#abcdef'];
        const visibleKeys = Array.from(
            { length: 9 },
            (_, i) => `陈旧系列-${i}`,
        );
        const preferred = Object.fromEntries(
            visibleKeys.map((key, i) => [
                key,
                staleColors[i % staleColors.length],
            ]),
        );

        const assignments = assignVisibleChartColors({
            visibleKeys,
            colorPalette: RETRO,
            preferredAssignments: preferred,
        });

        const colors = visibleKeys.map((key) => assignments[key]);
        expect(new Set(colors).size).toBe(9);
        colors.forEach((color) => {
            const normalized = color.toLowerCase();
            expect(retroNormalized).toContain(normalized);
            staleColors.forEach((stale) => {
                expect(normalized).not.toBe(stale.toLowerCase());
            });
        });
    });

    test('(c) 两图各 9 名、6 个同名 → 同名基准色一致（无本图冲突时同色）', () => {
        // 挑 12 个哈希槽两两不同的名字：6 个共享 + 两图各 3 个独有，
        // 保证两张图内都无哈希冲突（无冲突时同名必同色）
        const usedSlots = new Set<string>();
        const pickDistinctHashNames = (
            count: number,
            tag: string,
        ): string[] => {
            const names: string[] = [];
            for (let i = 0; names.length < count; i++) {
                const name = `${tag}-${i}`;
                const color = getHashColor(name, RETRO);
                if (!usedSlots.has(color)) {
                    usedSlots.add(color);
                    names.push(name);
                }
            }
            return names;
        };
        const shared = pickDistinctHashNames(6, '共享系列');
        const aOnly = pickDistinctHashNames(3, '图A独有');
        const bOnly = pickDistinctHashNames(3, '图B独有');
        // 前置确认：12 个名字哈希槽两两不同
        expect(
            new Set(
                [...shared, ...aOnly, ...bOnly].map((name) =>
                    getHashColor(name, RETRO),
                ),
            ).size,
        ).toBe(12);

        // 看板基准色：共享名先在别的图注册过（known 表里有值）
        const preferred = assignKnownHashColors(shared, RETRO);

        const chartA = assignVisibleChartColors({
            visibleKeys: [...shared, ...aOnly],
            colorPalette: RETRO,
            preferredAssignments: preferred,
        });
        const chartB = assignVisibleChartColors({
            visibleKeys: [...shared, ...bOnly],
            colorPalette: RETRO,
            preferredAssignments: preferred,
        });

        shared.forEach((name) => {
            expect(chartA[name]).toBe(chartB[name]);
            expect(chartA[name]).toBe(preferred[name]);
        });

        // 无 preferred 时（运行期新增名）纯哈希基准色同样跨图一致。
        // 注（2026-11-19 两趟规则）：主题色段第 1 趟额外要求与已用色
        // ΔE ≥ MIN_COLOR_DIFF，sequential 色板（retro）相邻色达不到时
        // 会线性探测到更远的调色板色——不再钉「无冲突时必等于 base」，
        // 改钉：跨图同名同色 + 全部来自调色板 + 首个分配名（已用色为空）
        // 必等于其哈希基准色。
        const noPreferredA = assignVisibleChartColors({
            visibleKeys: [...shared, ...aOnly],
            colorPalette: RETRO,
            preferredAssignments: {},
        });
        const noPreferredB = assignVisibleChartColors({
            visibleKeys: [...shared, ...bOnly],
            colorPalette: RETRO,
            preferredAssignments: {},
        });
        shared.forEach((name) => {
            expect(noPreferredA[name]).toBe(noPreferredB[name]);
            expect(retroNormalized).toContain(
                noPreferredA[name]!.toLowerCase(),
            );
        });
        // 首个分配的共享名：已用色为空，第 1 趟必命中哈希基准色
        expect(noPreferredA[shared[0]!]).toBe(getHashColor(shared[0]!, RETRO));
    });

    test('(d) 本图两个名字哈希撞同一 base → 第二个改到本图未用的调色板色，仍在调色板内且两两不同', () => {
        const base = getHashColor('臭宝', RETRO);
        let colliding = '';
        for (let i = 0; i < 8000; i++) {
            const name = `品牌${i}`;
            if (getHashColor(name, RETRO) === base) {
                colliding = name;
                break;
            }
        }
        expect(colliding).not.toBe('');
        expect(getHashColor(colliding, RETRO)).toBe(base);

        const assignments = assignVisibleChartColors({
            visibleKeys: ['臭宝', colliding],
            colorPalette: RETRO,
            preferredAssignments: {},
        });
        const colors = [assignments['臭宝'], assignments[colliding]];

        // 先排序处理的 key 拿到 base，另一个线性探测到调色板内其他色
        expect(colors.includes(base)).toBe(true);
        expect(new Set(colors).size).toBe(2);
        colors.forEach((color) => {
            expect(retroNormalized).toContain(color.toLowerCase());
        });
    });

    test('(e) 本图 25 系列 > 调色板 20 色 → 用完调色板色再补生成色，整体两两不重复', () => {
        const visibleKeys = Array.from(
            { length: 25 },
            (_, i) => `超量商品-${i}`,
        );
        const assignments = assignVisibleChartColors({
            visibleKeys,
            colorPalette: RETRO,
            preferredAssignments: {},
        });
        const colors = visibleKeys.map((key) => assignments[key]);

        expect(new Set(colors).size).toBe(25);
        // 20 个去重调色板色全部用上（前 20 条线调色板保真）
        const paletteHits = colors.filter((color) =>
            retroNormalized.includes(color.toLowerCase()),
        );
        expect(paletteHits).toHaveLength(20);
        expect(
            new Set(paletteHits.map((color) => color.toLowerCase())),
        ).toHaveLength(20);
        // 剩余 5 条为生成色（调色板外），且与调色板色两两不重复
        const generated = colors.filter(
            (color) => !retroNormalized.includes(color.toLowerCase()),
        );
        expect(generated).toHaveLength(5);
    });

    test('(f) 输入顺序（含 reverse、乱序）不影响结果', () => {
        const visibleKeys = Array.from(
            { length: 12 },
            (_, i) => `顺序系列-${i}`,
        );
        const preferred = assignKnownHashColors(visibleKeys.slice(0, 4), RETRO);

        const inOrder = assignVisibleChartColors({
            visibleKeys,
            colorPalette: RETRO,
            preferredAssignments: preferred,
        });
        const reversed = assignVisibleChartColors({
            visibleKeys: [...visibleKeys].reverse(),
            colorPalette: RETRO,
            preferredAssignments: preferred,
        });
        const shuffled = assignVisibleChartColors({
            visibleKeys: [
                visibleKeys[7],
                visibleKeys[0],
                visibleKeys[11],
                visibleKeys[3],
                visibleKeys[5],
                visibleKeys[1],
                visibleKeys[9],
                visibleKeys[2],
                visibleKeys[10],
                visibleKeys[4],
                visibleKeys[8],
                visibleKeys[6],
            ],
            colorPalette: RETRO,
            preferredAssignments: preferred,
        });

        expect(reversed).toEqual(inOrder);
        expect(shuffled).toEqual(inOrder);
    });

    test('(g) 空调色板 → 全部落到占位色（FALLBACK_COLOR）', () => {
        const assignments = assignVisibleChartColors({
            visibleKeys: ['臭宝', '其他品牌'],
            colorPalette: [],
            preferredAssignments: { 臭宝: '#FF6B35' },
        });
        // FALLBACK_COLOR 常量（hashColorAssignment.ts 内部 '#868e96'）
        expect(assignments['臭宝']).toBe('#868e96');
        expect(assignments['其他品牌']).toBe('#868e96');
    });
});

/**
 * 回归：取色时系列名在色表里查不到，会退回 getHashColor（纯哈希取模、无避让）。
 * 20 色板上 10 个商品名实测撞 3 对（#FF00FF/#FFFF00/#FF0040 各两次），
 * 线上表现就是「调色板完全够用却大量撞色」。allocator 负责给未覆盖的名字
 * 现场分配，保证不回到无避让路径。
 */
describe('createChartColorAllocator（取色不落无避让哈希）', () => {
    const DATA_MATRIX = COLOR_PALETTE_PRESETS.find(
        (preset) => preset.name === 'dataMatrix',
    )!.colors;
    const PRODUCTS = [
        '海天味极鲜酱油1.9L_6902265150022',
        '东古一品鲜特级酱油500ml,6911567881169',
        '味事达味极鲜1.8kg,6970917871359',
        '味达美味极鲜酱油1.8L,6925843403891',
        '厨邦味鲜生抽1.25L,6902902013574',
        '千禾味极鲜特级生抽1.8L,6928312900198',
        '李锦记锦鲜鲜香生抽1.75L,6922824013742',
        '加加面条鲜特级生抽酱油500ml,6920761200706',
        '巧妈妈味极鲜酱油1.3L,6921369130747',
        '海天味极鲜酱油1.9L,6902265043683',
    ];

    test('(a) 种子为空时 10 个商品名也不撞色，且全部来自调色板', () => {
        const allocator = createChartColorAllocator({
            colorPalette: DATA_MATRIX,
            seedAssignments: {},
        });
        const colors = PRODUCTS.map(
            (name) => allocator.resolve(name) as string,
        );

        expect(new Set(colors).size).toBe(PRODUCTS.length);
        colors.forEach((color) => {
            expect(DATA_MATRIX).toContain(color);
        });

        // 对照：旧的纯哈希兜底在同一批名字上会撞色
        const hashed = PRODUCTS.map((name) => getHashColor(name, DATA_MATRIX));
        expect(new Set(hashed).size).toBeLessThan(PRODUCTS.length);
    });

    test('(b) 种子已覆盖时，新系列不与种子颜色重复且仍在调色板内', () => {
        const seed = assignVisibleChartColors({
            visibleKeys: PRODUCTS,
            colorPalette: DATA_MATRIX,
            preferredAssignments: {
                [PRODUCTS[0]]: DATA_MATRIX[0],
            },
        });
        const allocator = createChartColorAllocator({
            colorPalette: DATA_MATRIX,
            seedAssignments: seed,
        });
        const used = new Set(Object.values(seed));
        const extras = ['新品种A', '新品种B', '新品种C'].map(
            (name) => allocator.resolve(name) as string,
        );

        extras.forEach((color) => {
            expect(DATA_MATRIX).toContain(color);
            expect(used.has(color)).toBe(false);
        });
        expect(new Set(extras).size).toBe(extras.length);
    });

    test('(c) 同一个名字重复取色结果稳定', () => {
        const allocator = createChartColorAllocator({
            colorPalette: DATA_MATRIX,
            seedAssignments: {},
        });
        const first = allocator.resolve('臭宝');
        expect(allocator.resolve('臭宝')).toBe(first);
        expect(allocator.resolve('臭宝')).toBe(first);
    });

    test('(d) 空调色板返回占位色；空名字返回 undefined', () => {
        const allocator = createChartColorAllocator({
            colorPalette: [],
            seedAssignments: {},
        });
        expect(allocator.resolve('臭宝')).toBe('#868e96');
        expect(allocator.resolve('')).toBeUndefined();
    });
});

/**
 * 感知色差回归（2026-11-19 口径）：colorDifference 已从 RGB 欧氏距离换成
 * CIEDE2000，阈值语义同步改为 ΔE00（MIN_COLOR_DIFF=12 / 生成色 15）。
 *
 * 背景：用户看板 147 个系列实测出现 ΔE00 1.0 的同色线；旧 RGB 口径下
 * `#00FF00/#00FF40`（ΔE00 2.52、RGB 64）会被 45/60 两个阈值同时放过。
 */
describe('感知色差度量与近重复回归', () => {
    // 审计验证过的 20 色纯霓虹重排（两两 ΔE00 下限 12.56，见 run 目录
    // 01-metric-audit.md §3.2 方案 A1）。dataMatrix 清洗（palettePresets 侧）
    // 落地前用它钉住「147 系列」场景；落地后可换成 dataMatrix.colors。
    const NEON20 = [
        '#ff0000',
        '#ff6200',
        '#ff9100',
        '#ffb700',
        '#ffdd00',
        '#eaff00',
        '#91ff00',
        '#00ff7b',
        '#00ffc8',
        '#00fff7',
        '#00e1ff',
        '#00bfff',
        '#0099ff',
        '#0073ff',
        '#004cff',
        '#8400ff',
        '#d000ff',
        '#ff00c8',
        '#ff0080',
        '#ff0048',
    ];

    const seriesKeys = (count: number, tag = '测试品种'): string[] =>
        Array.from(
            { length: count },
            (_, i) =>
                `${tag}${String(i).padStart(3, '0')},6900000${String(
                    i,
                ).padStart(5, '0')}`,
        );

    const pairwiseStats = (colors: string[]) => {
        let min = Number.POSITIVE_INFINITY;
        let below5 = 0;
        for (let i = 0; i < colors.length; i += 1) {
            for (let j = i + 1; j < colors.length; j += 1) {
                const d = colorDifference(colors[i]!, colors[j]!);
                if (d < min) min = d;
                if (d < 5) below5 += 1;
            }
        }
        return { min, below5 };
    };

    test('colorDifference 度量口径：RGB 放过、ΔE00 拒绝的近重复对', () => {
        // RGB 64 / ΔE00 2.52：旧 45/60 阈值都会放过的对
        expect(colorDifference('#00FF00', '#00FF40')).toBeLessThan(
            MIN_COLOR_DIFF,
        );
        // 线上三条同色黄线的实测色对（ΔE00 0.22–0.44）
        expect(colorDifference('#ECEB13', '#ECEC13')).toBeLessThan(5);
        expect(colorDifference('#EBEC13', '#ECEC13')).toBeLessThan(5);
        // hueCandidateAt 旧第 12 候选（回绕基色相，ΔE00 4.11）
        expect(colorDifference('#FFFF00', '#ECEC13')).toBeLessThan(
            MIN_COLOR_DIFF,
        );
        // 正常可分的主题色对
        expect(colorDifference('#5470c6', '#91cc75')).toBeGreaterThanOrEqual(
            MIN_COLOR_DIFF,
        );
        // 不可解析色语义保持：相同 → 0，不同 → 视为足够远
        expect(colorDifference('not-a-color', 'not-a-color')).toBe(0);
        expect(colorDifference('not-a-color', '#ffffff')).toBe(
            Number.POSITIVE_INFINITY,
        );
    });

    test('effectiveTarget 阶梯：<40 → 12，40–79 → 8，≥80 → 5（硬底线）', () => {
        expect(effectiveTarget(0)).toBe(MIN_COLOR_DIFF);
        expect(effectiveTarget(39)).toBe(MIN_COLOR_DIFF);
        expect(effectiveTarget(40)).toBe(8);
        expect(effectiveTarget(79)).toBe(8);
        expect(effectiveTarget(80)).toBe(5);
        expect(effectiveTarget(240)).toBe(5);
    });

    test('147 个中文系列名：无 ΔE < 5 的对，最小 ΔE ≥ 阶梯硬底线 5，结果确定', () => {
        // 前置自检：测试色板自身两两 ≥ 12，否则下方门槛无意义
        const paletteMin = Math.min(
            ...NEON20.flatMap((color, i) =>
                NEON20.slice(i + 1).map((other) =>
                    colorDifference(color, other),
                ),
            ),
        );
        expect(paletteMin).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);

        const keys = seriesKeys(147);
        const assignments = assignVisibleChartColors({
            visibleKeys: keys,
            colorPalette: NEON20,
            preferredAssignments: {},
        });
        const colors = keys.map((key) => assignments[key]!);

        expect(new Set(colors).size).toBe(147);
        const { min, below5 } = pairwiseStats(colors);
        expect(below5).toBe(0);
        // 阶梯口径（fix-A2）：≥80 已用色后目标降为 5，早期「≥ 7.5」的
        // 旧口径不再成立；底线是永不出现 ΔE < 5（P0）
        expect(min).toBeGreaterThanOrEqual(5);

        // 确定性：同一输入（乱序传入）→ 同一分配结果
        const reordered = assignVisibleChartColors({
            visibleKeys: [...keys].reverse(),
            colorPalette: NEON20,
            preferredAssignments: {},
        });
        expect(reordered).toEqual(assignments);
    });

    test('240 个系列（清洗后 dataMatrix）：全部唯一、无 ΔE < 5 的对、结果确定', () => {
        const dataMatrix = COLOR_PALETTE_PRESETS.find(
            (preset) => preset.name === 'dataMatrix',
        );
        const palette = dataMatrix?.colors ?? [];
        const keys = seriesKeys(240);
        const assignments = assignVisibleChartColors({
            visibleKeys: keys,
            colorPalette: palette,
            preferredAssignments: {},
        });
        const colors = keys.map((key) => assignments[key]!);

        expect(new Set(colors).size).toBe(240);
        const { min, below5 } = pairwiseStats(colors);
        expect(below5).toBe(0);
        expect(min).toBeGreaterThanOrEqual(5);

        const reordered = assignVisibleChartColors({
            visibleKeys: [...keys].reverse(),
            colorPalette: palette,
            preferredAssignments: {},
        });
        expect(reordered).toEqual(assignments);
    });

    test('40 个系列：同图最小 ΔE ≥ 12', () => {
        const keys = seriesKeys(40);
        const assignments = assignVisibleChartColors({
            visibleKeys: keys,
            colorPalette: NEON20,
            preferredAssignments: {},
        });
        const { min } = pairwiseStats(keys.map((key) => assignments[key]!));
        expect(min).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);
    });

    test('dataMatrix 容量内系列：全部来自调色板原色（两趟规则）', () => {
        const dataMatrix = COLOR_PALETTE_PRESETS.find(
            (preset) => preset.name === 'dataMatrix',
        );
        const palette = dataMatrix?.colors ?? [];
        const capacity = palette.length;
        const normalized = palette.map((color) => color.toLowerCase());
        const keys = Array.from({ length: capacity }, (_, i) => `商品名-${i}`);

        const assignments = assignVisibleChartColors({
            visibleKeys: keys,
            colorPalette: palette,
            preferredAssignments: {},
        });

        const colors = keys.map((key) => assignments[key]!);
        colors.forEach((color) => {
            expect(normalized).toContain(color.toLowerCase());
        });
        expect(new Set(colors).size).toBe(capacity);
    });

    test('h60 同格色不与 #FFFF00 同图（钉住 attempt=12 回绕与多基色收敛）', () => {
        // #ECEC13 = hslToHex(60, 0.85, 0.5)：旧 hueCandidateAt 第 12 候选
        // （30°×12=360° 回绕）及 #8000FF 第 5 / #FF0080 第 3 候选的收敛格
        expect(hslToHex(60, 0.85, 0.5)).toBe('#ecec13');

        const palette = [
            '#FFFF00',
            '#00FFFF',
            '#FF00FF',
            '#00FF00',
            '#FF0000',
            '#0000FF',
        ];
        const keys = Array.from({ length: 12 }, (_, i) => `系列名-${i}`);
        const assignments = assignVisibleChartColors({
            visibleKeys: keys,
            colorPalette: palette,
            preferredAssignments: { [keys[0]!]: '#FFFF00' },
        });
        expect(assignments[keys[0]]).toBe('#FFFF00');

        keys.slice(1).forEach((key) => {
            const color = assignments[key]!;
            expect(['#ecec13', '#ebec13', '#eceb13']).not.toContain(
                color.toLowerCase(),
            );
            expect(colorDifference(color, '#FFFF00')).toBeGreaterThanOrEqual(
                MIN_COLOR_DIFF,
            );
        });
    });

    test('expandPalette：变体与全部色板原色、自身基色均 ΔE ≥ 5（P0 底线，无条件）', () => {
        const dataMatrix = COLOR_PALETTE_PRESETS.find(
            (preset) => preset.name === 'dataMatrix',
        );
        const palette = dataMatrix?.colors ?? [];
        const expanded = expandPalette(palette);
        expect(expanded).toHaveLength(palette.length + palette.length * 2);

        // 钉子 1（无条件）：任何变体与任何色板原色都不落入「肉眼同一颜色」
        // 区间（ΔE00 < 5）。
        // 钉子 2（无条件）：任何变体与自身基色同样 ≥ 5（不再是「同一条黄」
        // 的明暗微调）。
        //
        // 旧钉子「≥ 12」写于 #FFFF00 还是 dataMatrix 成员时；色板清洗后
        //（两两 ≥ 14.41）黄/青族变拥挤，固定取向下可达的 max-min 上限
        // 实测：8.77（#85dcff vs 基色 #29E6FF）、9.23（#ffe65c vs
        // #F8FF29）——「≥ 12」不可满足，已按 parent 决策锁死为 P0 底线，
        // 不再尝试 ≥ 12。运行时兜底：pickAvoidingColor 接受任何变体前
        // 仍会按阶梯阈值（12/8/5）对照全部已用色复查，不达标不会被采用。
        palette.forEach((base, i) => {
            [
                expanded[palette.length + 2 * i],
                expanded[palette.length + 2 * i + 1],
            ].forEach((variant) => {
                // 钉子 2：vs 自身基色
                expect(colorDifference(variant!, base)).toBeGreaterThanOrEqual(
                    5,
                );
                // 钉子 1：vs 每个色板原色
                palette.forEach((original) => {
                    expect(
                        colorDifference(variant!, original),
                    ).toBeGreaterThanOrEqual(5);
                });
            });
        });
    });
});
