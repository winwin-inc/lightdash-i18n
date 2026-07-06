import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';

import {
    applyExcludedValuesToFilterRule,
    mergeExcludedValues,
    mergePendingExcludedValueIntoRule,
    normalizeExcludedValues,
    removeValuesExcludedFromFilterRule,
} from './index';

const createFilterRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'filter-1',
    label: 'Test filter',
    target: {
        fieldId: 'brand',
        tableName: 'orders',
    },
    operator: FilterOperator.EQUALS,
    values: ['伊利股份', '蒙牛'],
    disabled: false,
    ...overrides,
});

describe('normalizeExcludedValues', () => {
    it('trims and deduplicates excluded values', () => {
        expect(normalizeExcludedValues([' 伊利 ', '伊利', '', '蒙牛'])).toEqual(
            ['伊利', '蒙牛'],
        );
    });
});

describe('mergeExcludedValues', () => {
    it('merges pending excluded value with saved excluded values', () => {
        expect(mergeExcludedValues(['伊利'], '蒙牛')).toEqual(['伊利', '蒙牛']);
    });

    it('returns undefined when there are no excluded values', () => {
        expect(mergeExcludedValues(undefined, '   ')).toBeUndefined();
    });
});

describe('removeValuesExcludedFromFilterRule', () => {
    it('removes selected values that are excluded', () => {
        const result = removeValuesExcludedFromFilterRule(createFilterRule(), [
            '伊利股份',
        ]);

        expect(result.values).toEqual(['蒙牛']);
    });

    it('clears values when all selected values are excluded', () => {
        const result = removeValuesExcludedFromFilterRule(createFilterRule(), [
            '伊利股份',
            '蒙牛',
        ]);

        expect(result.values).toBeUndefined();
    });
});

describe('mergePendingExcludedValueIntoRule', () => {
    it('merges pending excluded values without removing selected values', () => {
        const result = mergePendingExcludedValueIntoRule(
            createFilterRule(),
            '梦龙',
        );

        expect(result.excludedValues).toEqual(['梦龙']);
        expect(result.values).toEqual(['伊利股份', '蒙牛']);
    });
});

describe('applyExcludedValuesToFilterRule', () => {
    it('merges pending excluded values and removes conflicting selected values', () => {
        const result = applyExcludedValuesToFilterRule(
            createFilterRule({ excludedValues: ['伊利股份'] }),
            '蒙牛',
        );

        expect(result.excludedValues).toEqual(['伊利股份', '蒙牛']);
        expect(result.values).toBeUndefined();
    });
});
