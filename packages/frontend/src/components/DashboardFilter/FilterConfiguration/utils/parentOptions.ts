import { type DashboardFilterRule } from '@lightdash/common';
import { type TFunction } from 'i18next';

import { encodeParentFilterRef } from '../../common/parentFilterRef';

/**
 * 父级候选：一条筛选器规则 + 它所在的作用域
 */
export type ParentCandidate = {
    rule: DashboardFilterRule;
    scope: 'global' | 'tab';
    /** scope === 'tab' 时父级所在的 Tab uuid */
    tabUuid: string | null;
};

/**
 * 已存储的父级绑定
 * - scope 为 null：旧数据只有 parentFieldId，作用域由上下文决定
 * - tabUuid 为 null：表示「当前 Tab」（调用方需要把当前 Tab uuid 填进来）
 */
export type StoredParentRef = {
    fieldId: string;
    scope: 'global' | 'tab' | null;
    tabUuid: string | null;
};

/**
 * 找出「已存储的父级绑定」对应的候选规则。
 *
 * 匹配顺序与运行时（findParentCategoryEntry）一致：
 * 1. 显式作用域精确匹配（global / tab + tabUuid）
 * 2. 同 Tab
 * 3. 全局
 * 4. 任意（同字段兜底，避免绑定「静默失效」）
 *
 * 只按 `rule.target.fieldId` 匹配：候选里可能有多条同字段规则
 * （不同作用域 / 不同层级），作用域只用来决定优先级。
 */
export const findStoredParentCandidate = (
    candidates: ParentCandidate[],
    stored: StoredParentRef,
): ParentCandidate | null => {
    const matched = candidates.filter(
        (candidate) => candidate.rule.target.fieldId === stored.fieldId,
    );
    if (matched.length === 0) return null;

    const isSameTab = (candidate: ParentCandidate) =>
        candidate.scope === 'tab' && candidate.tabUuid === stored.tabUuid;
    const isGlobal = (candidate: ParentCandidate) =>
        candidate.scope === 'global';

    // 1. 显式作用域精确匹配
    if (stored.scope === 'global') {
        const exact = matched.find(isGlobal);
        if (exact) return exact;
    } else if (stored.scope === 'tab') {
        // tabUuid 缺省表示「当前 Tab」：调用方把当前 Tab uuid 填进 stored.tabUuid
        const exact = matched.find(isSameTab);
        if (exact) return exact;
    }

    // 2. 同 Tab → 3. 全局 → 4. 任意
    return (
        matched.find(isSameTab) ?? matched.find(isGlobal) ?? matched[0] ?? null
    );
};

/**
 * 父级选项的展示文案
 */
export type ParentOptionLabels = {
    /** 完整文案：字段名 • 层级（作用域） */
    fullLabel: string;
    /** 短文案：层级（作用域），字段名与层级名重复时使用 */
    shortLabel: string;
    /** 字段名与层级名重复（如筛选器叫「一级类目」） */
    isRedundantBase: boolean;
};

/**
 * 构造父级选项的展示文案（候选列表与「已存储但不在候选里」的父级共用同一格式）：
 * - 字段名 • 二级类目（全局）
 * - 字段名与层级名重复时：二级类目（全局）
 */
export const buildParentOptionLabels = (
    t: TFunction,
    {
        baseLabel,
        categoryLevel,
        scope,
    }: {
        baseLabel: string;
        categoryLevel: number | null | undefined;
        scope: 'global' | 'tab';
    },
): ParentOptionLabels => {
    const levelLabel = categoryLevel
        ? t(
              `components_dashboard_filter.configuration.category_level.level${categoryLevel}`,
          )
        : undefined;

    const scopeLabel =
        scope === 'global'
            ? t(
                  'components_dashboard_filter.configuration.category_level.parent_scope_global',
              )
            : t(
                  'components_dashboard_filter.configuration.category_level.parent_scope_tab',
              );

    // 层级与作用域合并成一个括号后缀，避免「字段 • 层级 • 作用域」三段拼接
    const fullLabel = levelLabel
        ? t(
              'components_dashboard_filter.configuration.category_level.parent_option_label',
              {
                  label: baseLabel,
                  level: levelLabel,
                  scope: scopeLabel,
              },
          )
        : [baseLabel, scopeLabel].filter(Boolean).join(' • ');

    // 筛选器名字与层级名相同时（如筛选器叫「一级类目」），
    // 前一段是重复信息 → 只显示「一级类目（当前 Tab）」
    const isRedundantBase =
        !!levelLabel &&
        baseLabel.trim().toLowerCase() === levelLabel.trim().toLowerCase();

    const shortLabel = levelLabel
        ? t(
              'components_dashboard_filter.configuration.category_level.parent_option_label_short',
              {
                  level: levelLabel,
                  scope: scopeLabel,
              },
          )
        : fullLabel;

    return { fullLabel, shortLabel, isRedundantBase };
};

/**
 * 父级选项的中间结构（展示文案 + 归属信息）
 */
export type ParentOptionDraft = {
    value: string;
    fullLabel: string;
    shortLabel: string;
    isRedundantBase: boolean;
    /** 父级的显式类目层级（父级没配层级时为 null） */
    categoryLevel: number | null | undefined;
    scope: 'global' | 'tab';
    tabUuid: string | null;
    fieldId: string;
};

type StoredParentOptionParams = {
    /** 查找范围：全局 + 当前 Tab（不限层级：父级可能没有显式 categoryLevel） */
    candidates: ParentCandidate[];
    /** 已存储的父级字段 id */
    parentFieldId: string | undefined;
    /** 已存储的父级作用域（null = 旧数据，只有 parentFieldId） */
    parentScope: 'global' | 'tab' | null;
    /** 已存储的父级所在 Tab uuid */
    parentTabUuid: string | null;
    /** 当前筛选器所在的 Tab uuid */
    currentTabUuid: string | null;
    t: TFunction;
};

/**
 * 「已存储但不在候选里」的父级选项。
 *
 * 场景：绑定已经写进规则（parentFieldId / parentScope / parentTabUuid），
 * 但父级筛选器没有显式 categoryLevel —— 运行时只认显式层级，
 * 父级因此不在候选列表里 → 下拉框按 value 匹配不到 → 显示空白（占位「不设置父级筛选器」）。
 *
 * 这里补一个选项，保证「已有绑定」能被看到；
 * 父级真的不存在（被删除 / 字段不存在）时显示「无效父级」，让作者能发现并解绑。
 */
export const buildStoredParentOption = ({
    candidates,
    parentFieldId,
    parentScope,
    parentTabUuid,
    currentTabUuid,
    t,
}: StoredParentOptionParams): ParentOptionDraft | null => {
    if (!parentFieldId) return null;

    // 作用域缺省表示「当前 Tab」：把当前 Tab uuid 填进去，匹配顺序才能「同 Tab 优先」
    const storedTabUuid =
        parentScope === 'global'
            ? null
            : parentTabUuid ?? currentTabUuid ?? null;

    const found = findStoredParentCandidate(candidates, {
        fieldId: parentFieldId,
        scope: parentScope,
        tabUuid: storedTabUuid,
    });

    if (found) {
        // 显式作用域按「存储值」编码：下拉框的 value 由 parentScope / parentTabUuid 算出，
        // 两边必须一致才能选中；旧数据（没有作用域）按父级实际所在作用域编码。
        const scope = parentScope ?? found.scope;
        const optionTabUuid =
            parentScope === 'global'
                ? null
                : parentScope === 'tab'
                ? parentTabUuid ?? null
                : found.tabUuid;

        const baseLabel =
            found.rule.label ||
            found.rule.target.fieldLabel ||
            found.rule.target.fieldId;

        const { fullLabel, shortLabel, isRedundantBase } =
            buildParentOptionLabels(t, {
                baseLabel,
                categoryLevel: found.rule.categoryLevel,
                scope,
            });

        return {
            value: encodeParentFilterRef({
                scope,
                tabUuid: optionTabUuid,
                fieldId: parentFieldId,
            }),
            fullLabel,
            shortLabel,
            isRedundantBase,
            categoryLevel: found.rule.categoryLevel ?? null,
            scope,
            tabUuid: optionTabUuid,
            fieldId: parentFieldId,
        };
    }

    // 父级已被删除 / 字段不存在：仍然补一个选项，让作者看到「绑定已失效」
    const invalidScope = parentScope ?? 'tab';
    const invalidTabUuid =
        parentScope === 'global'
            ? null
            : parentScope === 'tab'
            ? parentTabUuid ?? null
            : currentTabUuid;

    const invalidLabel = t(
        'components_dashboard_filter.configuration.category_level.parent_invalid',
    );

    return {
        value: encodeParentFilterRef({
            scope: invalidScope,
            tabUuid: invalidTabUuid,
            fieldId: parentFieldId,
        }),
        fullLabel: invalidLabel,
        shortLabel: invalidLabel,
        isRedundantBase: false,
        categoryLevel: null,
        scope: invalidScope,
        tabUuid: invalidTabUuid,
        fieldId: parentFieldId,
    };
};
