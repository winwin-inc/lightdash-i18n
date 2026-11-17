import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    appendDashboardUnknownHashColors,
    appendUnknownHashColors,
    assignKnownHashColors,
    colorDifference,
    getHashColor,
    hexToHSL,
    MIN_COLOR_DIFF,
    MIN_GENERATED_COLOR_DIFF,
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
 * 回归：本图避让（appendUnknownHashColors）是标准图渲染期取色的依据。
 * 即使看板级 known 已占很多颜色，本图可见系列也必须两两色差 ≥ MIN_COLOR_DIFF，
 * 否则用户看到的是「一堆同色相近似色」（历史上的看板级避让就是这样挤满的）。
 */
describe('本图避让：known 规模不影响同图可区分度', () => {
    const PALETTE_LOCAL = ECHARTS_DEFAULT_COLORS;
    const visibleKeys = Array.from(
        { length: 15 },
        (_, i) => `SKU-本图避让-${i}-69022651${String(i).padStart(5, '0')}`,
    );

    test.each([0, 9, 30, 60, 120])(
        'known=%i 时同图 15 系列唯一且最小色差 ≥ MIN_COLOR_DIFF',
        (knownCount) => {
            const known = assignKnownHashColors(
                Array.from({ length: knownCount }, (_, i) => `known-${i}`),
                PALETTE_LOCAL,
            );
            const perChart = appendUnknownHashColors(
                visibleKeys,
                PALETTE_LOCAL,
                known,
            );
            const colors = visibleKeys.map((key) => perChart[key]);

            expect(new Set(colors).size).toBe(15);
            let minDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i < colors.length; i += 1) {
                for (let j = i + 1; j < colors.length; j += 1) {
                    minDistance = Math.min(
                        minDistance,
                        colorDifference(colors[i], colors[j]),
                    );
                }
            }
            expect(minDistance).toBeGreaterThanOrEqual(MIN_COLOR_DIFF);
        },
    );
});

/**
 * 分层阈值：主题色板仍按 MIN_COLOR_DIFF=45 使用（小图颜色不变），
 * 生成色（扩展色 / 色相旋转）要求 ≥ MIN_GENERATED_COLOR_DIFF=60，
 * 避免把"同色相明暗变体"当成分得开的颜色（实测扩展色最小距离只有 17.5）。
 */
describe('分层阈值：小图颜色不变、大图更可区分', () => {
    const PALETTE_LOCAL = ECHARTS_DEFAULT_COLORS;
    const brandKeys = (count: number) =>
        Array.from(
            { length: count },
            (_, i) => `品牌-${i}-69022651${String(i).padStart(5, '0')}`,
        );

    const perChartColors = (count: number, knownCount: number): string[] => {
        const keys = brandKeys(count);
        const known = assignKnownHashColors(
            Array.from({ length: knownCount }, (_, i) => `known-${i}`),
            PALETTE_LOCAL,
        );
        const perChart = appendUnknownHashColors(keys, PALETTE_LOCAL, known);
        return keys.map((key) => perChart[key]);
    };

    const minPairDistance = (colors: string[]): number => {
        let min = Number.POSITIVE_INFINITY;
        for (let i = 0; i < colors.length; i += 1) {
            for (let j = i + 1; j < colors.length; j += 1) {
                min = Math.min(min, colorDifference(colors[i], colors[j]));
            }
        }
        return min;
    };

    test('5 / 9 个系列（≤ 调色板长度）颜色与引入生成色阈值前完全一致', () => {
        // 快照取自引入分层阈值之前：小图不允许被顺带改色
        expect(perChartColors(5, 0)).toEqual([
            '#91cc75',
            '#ee6666',
            '#fac858',
            '#73c0de',
            '#3ba272',
        ]);
        expect(perChartColors(9, 0)).toEqual([
            '#91cc75',
            '#ee6666',
            '#fac858',
            '#73c0de',
            '#3ba272',
            '#ea7ccc',
            '#9a60b4',
            '#5470c6',
            '#354f9e',
        ]);
    });

    test.each([0, 9, 30, 60, 120])(
        'known=%i 时 15 个系列两两不同且最小色差 ≥ MIN_GENERATED_COLOR_DIFF',
        (knownCount) => {
            const colors = perChartColors(15, knownCount);

            expect(new Set(colors).size).toBe(15);
            expect(minPairDistance(colors)).toBeGreaterThanOrEqual(
                MIN_GENERATED_COLOR_DIFF,
            );
        },
    );

    test('60 个系列仍两两不同（极端饱和只保证唯一性）', () => {
        const colors = perChartColors(60, 60);

        expect(new Set(colors).size).toBe(60);
    });
});
