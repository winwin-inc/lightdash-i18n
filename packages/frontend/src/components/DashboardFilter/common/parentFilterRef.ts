import { type DashboardFilterRule } from '@lightdash/common';

/**
 * 父级筛选器的作用域
 * - global：全局筛选器
 * - tab：某个 Tab 的筛选器
 */
export type ParentFilterScope = 'global' | 'tab';

/**
 * 父级筛选器引用：区分作用域，避免相同字段名产生歧义
 */
export type ParentFilterRef = {
    scope: ParentFilterScope;
    /** scope === 'tab' 时父级所在的 Tab uuid */
    tabUuid: string | null;
    /** 父级筛选器的字段 id */
    fieldId: string;
};

/** 父级引用（作用域可能未声明：旧数据只有 parentFieldId） */
export type MaybeScopedParentFilterRef = {
    scope: ParentFilterScope | null;
    tabUuid: string | null;
    fieldId: string;
};

/**
 * 把父级引用编码成复合键（用于 Select 的 value）
 * - global:<fieldId>
 * - tab:<tabUuid>:<fieldId>
 */
export const encodeParentFilterRef = (ref: ParentFilterRef): string =>
    ref.scope === 'global'
        ? `global:${ref.fieldId}`
        : `tab:${ref.tabUuid ?? ''}:${ref.fieldId}`;

/**
 * 解析复合键
 */
export const decodeParentFilterRef = (
    value: string | null | undefined,
): ParentFilterRef | null => {
    if (!value) return null;
    const separatorIndex = value.indexOf(':');
    if (separatorIndex === -1) return null;

    const scope = value.slice(0, separatorIndex);
    const rest = value.slice(separatorIndex + 1);

    if (scope === 'global') {
        return rest ? { scope: 'global', tabUuid: null, fieldId: rest } : null;
    }

    if (scope === 'tab') {
        const tabSeparatorIndex = rest.indexOf(':');
        if (tabSeparatorIndex === -1) return null;
        const rawTabUuid = rest.slice(0, tabSeparatorIndex);
        const fieldId = rest.slice(tabSeparatorIndex + 1);
        if (!fieldId) return null;
        return {
            scope: 'tab',
            // 空 tabUuid = 未指定 Tab（同一 Tab）
            tabUuid: rawTabUuid || null,
            fieldId,
        };
    }

    return null;
};

/**
 * 从筛选器规则读取父级引用。
 *
 * 旧数据只有 parentFieldId（没有作用域）：作用域由上下文决定
 * （同作用域优先，其次全局），这里返回 scope: null 表示「未显式声明」。
 */
export const getParentFilterRef = (
    filter: DashboardFilterRule,
): MaybeScopedParentFilterRef | null => {
    if (!filter.parentFieldId) return null;

    if (filter.parentScope === 'global') {
        return {
            scope: 'global',
            tabUuid: null,
            fieldId: filter.parentFieldId,
        };
    }

    if (filter.parentScope === 'tab') {
        return {
            scope: 'tab',
            tabUuid: filter.parentTabUuid ?? null,
            fieldId: filter.parentFieldId,
        };
    }

    return { scope: null, tabUuid: null, fieldId: filter.parentFieldId };
};
/**
 * 依据父级引用写回筛选器规则（清除父级时三个字段一起清掉）
 */
export const applyParentFilterRef = (
    filter: DashboardFilterRule,
    ref: ParentFilterRef | null,
): DashboardFilterRule => ({
    ...filter,
    parentFieldId: ref?.fieldId,
    parentScope: ref?.scope,
    parentTabUuid: ref?.scope === 'tab' ? ref.tabUuid ?? undefined : undefined,
});
