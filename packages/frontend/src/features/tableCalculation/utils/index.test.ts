import { type TableCalculation } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getTableCalculationBaseName,
    getUniqueTableCalculationName,
} from './index';

const tc = (name: string, displayName = name): TableCalculation => ({
    name,
    displayName,
    sql: '1',
});

describe('getTableCalculationBaseName', () => {
    it('falls back for pure Chinese display names', () => {
        expect(getTableCalculationBaseName('铺市率')).toBe('table_calculation');
        expect(getTableCalculationBaseName('市占率')).toBe('table_calculation');
    });

    it('falls back when snakeCaseName leaves only underscores/digits', () => {
        expect(getTableCalculationBaseName('铺市率2')).toBe(
            'table_calculation',
        );
        expect(getTableCalculationBaseName('%')).toBe('table_calculation');
    });

    it('keeps latin snake_case names', () => {
        expect(getTableCalculationBaseName('Fill Rate')).toBe('fill_rate');
        expect(getTableCalculationBaseName('abc铺市率')).toBe('abc_');
    });
});

describe('getUniqueTableCalculationName', () => {
    it('uses table_calculation for Chinese names', () => {
        expect(getUniqueTableCalculationName('铺市率', [])).toBe(
            'table_calculation',
        );
    });

    it('suffixes when table_calculation is already taken', () => {
        expect(
            getUniqueTableCalculationName('市占率', [
                tc('table_calculation', '铺市率'),
            ]),
        ).toBe('table_calculation_1');
    });

    it('keeps english names and suffixes on collision', () => {
        expect(getUniqueTableCalculationName('Fill Rate', [])).toBe(
            'fill_rate',
        );
        expect(
            getUniqueTableCalculationName('Fill Rate', [tc('fill_rate')]),
        ).toBe('fill_rate_1');
    });

    it('excludes the calculation being edited from uniqueness check', () => {
        const existing = tc('table_calculation', '铺市率');
        expect(
            getUniqueTableCalculationName('铺市率', [existing], existing),
        ).toBe('table_calculation');
    });
});
