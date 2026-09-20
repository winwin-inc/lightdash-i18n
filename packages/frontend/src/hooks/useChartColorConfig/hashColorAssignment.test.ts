import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    appendUnknownHashColors,
    assignKnownHashColors,
    colorDifference,
    getHashColor,
    hexToHSL,
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
        const assignments = assignKnownHashColors(['臭宝', '其他品牌'], PALETTE, {
            臭宝: '#ff00aa',
            其他品牌: '#ff00aa',
        });
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

    test('unknown names only avoid visible known colors', () => {
        const known = {
            李子柒: TINY_PALETTE[0],
            臭宝: TINY_PALETTE[1],
        };
        const afterFilter = appendUnknownHashColors(
            ['原味', '李子柒'],
            TINY_PALETTE,
            known,
        );

        expect(afterFilter['李子柒']).toBe(TINY_PALETTE[0]);
        expect(afterFilter['臭宝']).toBe(TINY_PALETTE[1]);
        expect(afterFilter['原味']).toBe(TINY_PALETTE[1]);
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
