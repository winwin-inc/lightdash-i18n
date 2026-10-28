import {
    DimensionType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import {
    applySelectionToFilters,
    applySelectionToTabFilters,
    findFilterRuleById,
    getFilterIdentityKey,
    getFilterIdentityKeys,
    isRuleSelectionCompatible,
    restoreAuthorDefaults,
} from './userFilterSelections';

const rule = (
    overrides: Partial<DashboardFilterRule> & {
        id: string;
        fieldId: string;
        tableName?: string;
    },
): DashboardFilterRule => ({
    id: overrides.id,
    target: {
        fieldId: overrides.fieldId,
        tableName: overrides.tableName ?? 'orders',
        ...(overrides.target ?? {}),
    },
    operator: overrides.operator ?? FilterOperator.EQUALS,
    values: overrides.values,
    label: overrides.label,
    settings: overrides.settings,
    categoryLevel: overrides.categoryLevel,
    parentFieldId: overrides.parentFieldId,
    parentScope: overrides.parentScope,
    disabled: overrides.disabled,
});

const filters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

describe('getFilterIdentityKey', () => {
    it('uses namespace + table + field for regular fields', () => {
        expect(
            getFilterIdentityKey(
                rule({ id: 'a', fieldId: 'status' }),
                'dimension',
            ),
        ).toBe('dimension:orders.status');
    });

    it('falls back to the rule id for sql columns', () => {
        const sqlRule = rule({
            id: 'sql-1',
            fieldId: 'amount',
            tableName: 'whatever',
            target: { fieldId: 'amount', tableName: 'whatever', isSqlColumn: true },
        });
        expect(getFilterIdentityKey(sqlRule, 'dimension')).toBe('rule:sql-1');
    });
});

describe('isRuleSelectionCompatible', () => {
    it('accepts rules with the same operator and settings shape', () => {
        const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
        const target = rule({ id: 'b', fieldId: 'status', values: ['y'] });
        expect(isRuleSelectionCompatible(source, target)).toBe(true);
    });

    it('rejects different operators', () => {
        const source = rule({ id: 'a', fieldId: 'status' });
        const target = rule({
            id: 'b',
            fieldId: 'status',
            operator: FilterOperator.IN_BETWEEN,
        });
        expect(isRuleSelectionCompatible(source, target)).toBe(false);
    });

    it('rejects different settings shapes', () => {
        const source = rule({
            id: 'a',
            fieldId: 'date',
            settings: { unitOfTime: 'month' },
        });
        const target = rule({
            id: 'b',
            fieldId: 'date',
            settings: { dateRange: 'last 30 days' },
        });
        expect(isRuleSelectionCompatible(source, target)).toBe(false);
    });

    it('rejects different category levels or parents', () => {
        const source = rule({
            id: 'a',
            fieldId: 'cat',
            categoryLevel: 2,
            parentFieldId: 'p1',
        });
        const differentLevel = rule({
            id: 'b',
            fieldId: 'cat',
            categoryLevel: 3,
            parentFieldId: 'p1',
        });
        const differentParent = rule({
            id: 'c',
            fieldId: 'cat',
            categoryLevel: 2,
            parentFieldId: 'p2',
        });
        expect(isRuleSelectionCompatible(source, differentLevel)).toBe(false);
        expect(isRuleSelectionCompatible(source, differentParent)).toBe(false);
    });

    it('rejects disabled targets', () => {
        const source = rule({ id: 'a', fieldId: 'status' });
        const target = rule({ id: 'b', fieldId: 'status', disabled: true });
        expect(isRuleSelectionCompatible(source, target)).toBe(false);
    });

    it('rejects targets whose fallback type changed', () => {
        const source = rule({
            id: 'a',
            fieldId: 'status',
            target: {
                fieldId: 'status',
                tableName: 'orders',
                fallbackType: DimensionType.STRING,
            },
        });
        const target = rule({
            id: 'b',
            fieldId: 'status',
            target: {
                fieldId: 'status',
                tableName: 'orders',
                fallbackType: DimensionType.NUMBER,
            },
        });
        expect(isRuleSelectionCompatible(source, target)).toBe(false);
    });
});

describe('applySelectionToFilters', () => {
    it('applies the selection to the matching field only', () => {
        const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
        const target = rule({
            id: 'b',
            fieldId: 'status',
            values: ['old'],
            label: 'Status',
        });
        const other = rule({ id: 'c', fieldId: 'amount', values: ['1'] });

        const result = applySelectionToFilters(
            filters([target, other]),
            source,
            'dimension',
        );

        expect(result.changed).toBe(true);
        expect(result.filters.dimensions[0].values).toEqual(['x']);
        // rule id / label / target are untouched
        expect(result.filters.dimensions[0].id).toBe('b');
        expect(result.filters.dimensions[0].label).toBe('Status');
        expect(result.filters.dimensions[1].values).toEqual(['1']);
    });

    it('does nothing when the field is not configured', () => {
        const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
        const result = applySelectionToFilters(
            filters([rule({ id: 'c', fieldId: 'amount' })]),
            source,
            'dimension',
        );
        expect(result.changed).toBe(false);
        expect(result.filters.dimensions).toHaveLength(1);
    });

    it('does nothing when the target is incompatible', () => {
        const source = rule({ id: 'a', fieldId: 'status', values: ['x'] });
        const target = rule({
            id: 'b',
            fieldId: 'status',
            operator: FilterOperator.IN_BETWEEN,
        });
        const result = applySelectionToFilters(
            filters([target]),
            source,
            'dimension',
        );
        expect(result.changed).toBe(false);
        expect(result.filters.dimensions[0].values).toBeUndefined();
    });
});

describe('applySelectionToTabFilters', () => {
    const source = rule({ id: 'tab-a-rule', fieldId: 'status', values: ['x'] });

    it('syncs the value to every tab that configures the field', () => {
        const tabFilters = {
            'tab-a': filters([rule({ id: 'tab-a-rule', fieldId: 'status' })]),
            'tab-b': filters([rule({ id: 'tab-b-rule', fieldId: 'status' })]),
        };
        const { tabFilters: next, changedTabUuids } = applySelectionToTabFilters(
            tabFilters,
            source,
            'dimension',
            'tab-a',
        );
        expect(changedTabUuids).toEqual(['tab-b']);
        expect(next['tab-b'].dimensions[0].values).toEqual(['x']);
        expect(next['tab-b'].dimensions[0].id).toBe('tab-b-rule');
    });

    it('skips tabs that do not configure the field', () => {
        const tabFilters = {
            'tab-a': filters([rule({ id: 'tab-a-rule', fieldId: 'status' })]),
            'tab-b': filters([rule({ id: 'tab-b-rule', fieldId: 'amount' })]),
        };
        const { tabFilters: next, changedTabUuids } = applySelectionToTabFilters(
            tabFilters,
            source,
            'dimension',
            'tab-a',
        );
        expect(changedTabUuids).toEqual([]);
        expect(next).toBe(tabFilters);
    });

    it('skips the source tab', () => {
        const tabFilters = {
            'tab-a': filters([rule({ id: 'tab-a-rule', fieldId: 'status' })]),
            'tab-b': filters([rule({ id: 'tab-b-rule', fieldId: 'status' })]),
        };
        const { tabFilters: next, changedTabUuids } = applySelectionToTabFilters(
            tabFilters,
            source,
            'dimension',
            'tab-a',
        );
        expect(changedTabUuids).toEqual(['tab-b']);
        expect(next['tab-a'].dimensions[0].values).toBeUndefined();
    });

    it('skips incompatible tabs but keeps compatible ones', () => {
        const tabFilters = {
            'tab-a': filters([rule({ id: 'tab-a-rule', fieldId: 'status' })]),
            'tab-b': filters([
                rule({
                    id: 'tab-b-rule',
                    fieldId: 'status',
                    operator: FilterOperator.IN_BETWEEN,
                }),
            ]),
            'tab-c': filters([rule({ id: 'tab-c-rule', fieldId: 'status' })]),
        };
        const { tabFilters: next, changedTabUuids } = applySelectionToTabFilters(
            tabFilters,
            source,
            'dimension',
            'tab-a',
        );
        expect(changedTabUuids).toEqual(['tab-c']);
        expect(next['tab-b'].dimensions[0].values).toBeUndefined();
    });
});

describe('getFilterIdentityKeys', () => {
    it('collects the identity keys of a filter set', () => {
        const keys = getFilterIdentityKeys(
            filters([
                rule({ id: 'r1', fieldId: 'status' }),
                rule({ id: 'r2', fieldId: 'amount', tableName: 'orders' }),
            ]),
        );
        expect([...keys]).toEqual([
            'dimension:orders.status',
            'dimension:orders.amount',
        ]);
    });
});

describe('restoreAuthorDefaults', () => {
    it('restores the server default value', () => {
        const runtime = filters([
            rule({ id: 'r1', fieldId: 'status', values: ['user-picked'] }),
        ]);
        const server = filters([
            rule({ id: 'r1', fieldId: 'status', values: ['author-default'] }),
        ]);
        const restored = restoreAuthorDefaults(
            runtime,
            new Set(['dimension:orders.status']),
            server,
        );
        expect(restored.dimensions[0].values).toEqual(['author-default']);
    });

    it('clears the value when the author has no default', () => {
        const runtime = filters([
            rule({ id: 'r1', fieldId: 'status', values: ['user-picked'] }),
        ]);
        const restored = restoreAuthorDefaults(
            runtime,
            new Set(['dimension:orders.status']),
            undefined,
        );
        expect(restored.dimensions[0].values).toEqual([]);
    });

    it('leaves other filters untouched', () => {
        const runtime = filters([
            rule({ id: 'r1', fieldId: 'status', values: ['user-picked'] }),
            rule({ id: 'r2', fieldId: 'amount', values: ['5'] }),
        ]);
        const restored = restoreAuthorDefaults(
            runtime,
            new Set(['dimension:orders.status']),
            undefined,
        );
        expect(restored.dimensions[1].values).toEqual(['5']);
    });
});

describe('findFilterRuleById', () => {
    it('finds the rule and its namespace', () => {
        const found = findFilterRuleById(
            {
                dimensions: [],
                metrics: [rule({ id: 'm1', fieldId: 'revenue' })],
                tableCalculations: [],
            },
            'm1',
        );
        expect(found?.namespace).toBe('metric');
        expect(found?.rule.id).toBe('m1');
    });

    it('returns undefined for unknown ids', () => {
        expect(
            findFilterRuleById(
                { dimensions: [], metrics: [], tableCalculations: [] },
                'nope',
            ),
        ).toBeUndefined();
    });
});
