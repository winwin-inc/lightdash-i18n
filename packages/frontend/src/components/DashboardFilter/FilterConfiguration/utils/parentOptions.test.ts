import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { type TFunction } from 'i18next';
import { afterEach, beforeEach, vi } from 'vitest';

import {
    buildStoredParentOption,
    findStoredParentCandidate,
    type ParentCandidate,
} from './parentOptions';

/** 假的翻译函数：直接返回 key，断言只关心「用了哪个 key」 */
const t = ((key: string) => key) as unknown as TFunction;

beforeEach(() => {
    // 找不到父级时会打 DEV 诊断日志，测试里静音
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

const createFilterRule = (
    fieldId: string,
    id: string = `filter-${fieldId}`,
): DashboardFilterRule => ({
    id,
    label: fieldId,
    target: {
        fieldId,
        tableName: 'orders',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: false,
});

const createCandidate = (
    fieldId: string,
    scope: 'global' | 'tab',
    tabUuid: string | null = null,
    id?: string,
): ParentCandidate => ({
    rule: createFilterRule(fieldId, id),
    scope,
    tabUuid,
});

describe('findStoredParentCandidate', () => {
    it('matches the global candidate exactly when the scope is explicitly global', () => {
        const tabCandidate = createCandidate('cls_2', 'tab', 'tab-1');
        const globalCandidate = createCandidate('cls_2', 'global');

        const matched = findStoredParentCandidate(
            [tabCandidate, globalCandidate],
            { fieldId: 'cls_2', scope: 'global', tabUuid: null },
        );

        expect(matched).toBe(globalCandidate);
    });

    it('matches the tab candidate exactly when the scope is explicitly tab', () => {
        const globalCandidate = createCandidate('cls_2', 'global');
        const tabCandidate = createCandidate('cls_2', 'tab', 'tab-1');

        const matched = findStoredParentCandidate(
            [globalCandidate, tabCandidate],
            { fieldId: 'cls_2', scope: 'tab', tabUuid: 'tab-1' },
        );

        expect(matched).toBe(tabCandidate);
    });

    it('falls back to global when the explicit tab scope does not match', () => {
        const globalCandidate = createCandidate('cls_2', 'global');
        const otherTabCandidate = createCandidate('cls_2', 'tab', 'tab-9');

        const matched = findStoredParentCandidate(
            [globalCandidate, otherTabCandidate],
            { fieldId: 'cls_2', scope: 'tab', tabUuid: 'tab-1' },
        );

        expect(matched).toBe(globalCandidate);
    });

    it('prefers the same tab for legacy bindings without a scope', () => {
        const globalCandidate = createCandidate('cls_2', 'global');
        const tabCandidate = createCandidate('cls_2', 'tab', 'tab-1');

        const matched = findStoredParentCandidate(
            [globalCandidate, tabCandidate],
            { fieldId: 'cls_2', scope: null, tabUuid: 'tab-1' },
        );

        expect(matched).toBe(tabCandidate);
    });

    it('falls back to global for legacy bindings without a scope and no same tab candidate', () => {
        const globalCandidate = createCandidate('cls_2', 'global');
        const otherTabCandidate = createCandidate('cls_2', 'tab', 'tab-9');

        const matched = findStoredParentCandidate(
            [globalCandidate, otherTabCandidate],
            { fieldId: 'cls_2', scope: null, tabUuid: 'tab-1' },
        );

        expect(matched).toBe(globalCandidate);
    });

    it('returns null when no candidate has the stored field id', () => {
        const candidates = [
            createCandidate('cls_1', 'global'),
            createCandidate('cls_3', 'tab', 'tab-1'),
        ];

        const matched = findStoredParentCandidate(candidates, {
            fieldId: 'cls_2',
            scope: 'global',
            tabUuid: null,
        });

        expect(matched).toBeNull();
    });

    it('does not match a candidate from another scope when an exact one exists', () => {
        const tabCandidate = createCandidate(
            'cls_2',
            'tab',
            'tab-1',
            'filter-tab',
        );
        const globalCandidate = createCandidate(
            'cls_2',
            'global',
            null,
            'filter-global',
        );

        expect(
            findStoredParentCandidate([tabCandidate, globalCandidate], {
                fieldId: 'cls_2',
                scope: 'global',
                tabUuid: null,
            }),
        ).toBe(globalCandidate);

        expect(
            findStoredParentCandidate([tabCandidate, globalCandidate], {
                fieldId: 'cls_2',
                scope: 'tab',
                tabUuid: 'tab-1',
            }),
        ).toBe(tabCandidate);
    });

    it('falls back to any candidate with the same field id when no scope matches', () => {
        const tabCandidate = createCandidate('cls_2', 'tab', 'tab-9');

        const matched = findStoredParentCandidate([tabCandidate], {
            fieldId: 'cls_2',
            scope: 'global',
            tabUuid: null,
        });

        expect(matched).toBe(tabCandidate);
    });
});

describe('buildStoredParentOption', () => {
    const globalCandidate = createCandidate('cls_2', 'global');
    const tabCandidate = createCandidate('cls_2', 'tab', 'tab-1');

    it('builds an option for a stored parent that has no explicit category level', () => {
        const option = buildStoredParentOption({
            candidates: [globalCandidate, tabCandidate],
            parentFieldId: 'cls_2',
            parentScope: 'tab',
            parentTabUuid: 'tab-1',
            currentTabUuid: 'tab-1',
            t,
        });

        expect(option).not.toBeNull();
        // value 必须与 FilterSettings 里按 parentScope / parentTabUuid 算出的值一致，
        // 否则下拉框仍然显示空白
        expect(option?.value).toBe('tab:tab-1:cls_2');
        expect(option?.fieldId).toBe('cls_2');
        expect(option?.scope).toBe('tab');
        expect(option?.tabUuid).toBe('tab-1');
        // 父级没有显式层级 → null（用于提示「父级缺少层级」）
        expect(option?.categoryLevel).toBeNull();
    });

    it('builds an option for a stored global parent', () => {
        const option = buildStoredParentOption({
            candidates: [globalCandidate, tabCandidate],
            parentFieldId: 'cls_2',
            parentScope: 'global',
            parentTabUuid: null,
            currentTabUuid: 'tab-1',
            t,
        });

        expect(option?.value).toBe('global:cls_2');
        expect(option?.scope).toBe('global');
        expect(option?.tabUuid).toBeNull();
    });

    it('encodes legacy bindings (no scope) with the parent actual scope', () => {
        const option = buildStoredParentOption({
            candidates: [globalCandidate, tabCandidate],
            parentFieldId: 'cls_2',
            parentScope: null,
            parentTabUuid: null,
            currentTabUuid: 'tab-1',
            t,
        });

        // 旧数据：同 Tab 优先
        expect(option?.value).toBe('tab:tab-1:cls_2');
        expect(option?.scope).toBe('tab');
    });

    it('falls back to the invalid parent option when the parent no longer exists', () => {
        const option = buildStoredParentOption({
            candidates: [createCandidate('cls_1', 'global')],
            parentFieldId: 'cls_2',
            parentScope: 'global',
            parentTabUuid: null,
            currentTabUuid: 'tab-1',
            t,
        });

        expect(option?.value).toBe('global:cls_2');
        expect(option?.fullLabel).toBe(
            'components_dashboard_filter.configuration.category_level.parent_invalid',
        );
        expect(option?.categoryLevel).toBeNull();
    });

    it('encodes legacy invalid bindings with the current tab', () => {
        const option = buildStoredParentOption({
            candidates: [],
            parentFieldId: 'cls_2',
            parentScope: null,
            parentTabUuid: null,
            currentTabUuid: 'tab-1',
            t,
        });

        expect(option?.value).toBe('tab:tab-1:cls_2');
        expect(option?.fullLabel).toBe(
            'components_dashboard_filter.configuration.category_level.parent_invalid',
        );
    });

    it('returns null when there is no stored parent', () => {
        const option = buildStoredParentOption({
            candidates: [globalCandidate],
            parentFieldId: undefined,
            parentScope: null,
            parentTabUuid: null,
            currentTabUuid: 'tab-1',
            t,
        });

        expect(option).toBeNull();
    });
});
