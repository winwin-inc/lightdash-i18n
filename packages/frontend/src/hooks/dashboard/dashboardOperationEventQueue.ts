import {
    PROJECT_OPERATION_LOG_ACTIONS,
    type DashboardFilterRule,
    type DashboardOperationClientEvent,
} from '@lightdash/common';

type FilterScope = 'global' | 'tab';

type QueueContext = {
    scope: FilterScope;
    tabUuid?: string | null;
    tabName?: string | null;
};

const queue: DashboardOperationClientEvent[] = [];

const stableJson = (value: unknown): string => {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return String(value);
    }
};

const tileTargetsSignature = (
    tileTargets: DashboardFilterRule['tileTargets'] | undefined,
): string => stableJson(tileTargets ?? {});

export const enqueueDashboardOperationEvent = (
    event: Omit<DashboardOperationClientEvent, 'schemaVersion'> & {
        schemaVersion?: 1;
    },
): void => {
    queue.push({
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        ...event,
    });
};

export const drainDashboardOperationEvents = (): DashboardOperationClientEvent[] => {
    if (queue.length === 0) return [];
    const events = queue.splice(0, queue.length);
    return events;
};

export const peekDashboardOperationEvents = (): DashboardOperationClientEvent[] => [
    ...queue,
];

export const clearDashboardOperationEvents = (): void => {
    queue.splice(0, queue.length);
};

const baseFilterSummary = (rule: DashboardFilterRule) => ({
    filterUuid: rule.id,
    label: rule.label,
    fieldId: rule.target?.fieldId,
    tableName: rule.target?.tableName,
    operator: rule.operator,
    values: rule.values,
    disabled: rule.disabled,
    required: rule.required,
    excludedValues: (rule as DashboardFilterRule & { excludedValues?: unknown })
        .excludedValues,
    readOnly: (rule as DashboardFilterRule & { readOnly?: unknown })
        .readOnly,
    hidden: (rule as DashboardFilterRule & { hidden?: unknown })
        .hidden,
    allowedOperators: (rule as DashboardFilterRule & { allowedOperators?: unknown })
        .allowedOperators,
    singleValue: (rule as DashboardFilterRule & { singleValue?: unknown })
        .singleValue,
    categoryLevel: (rule as DashboardFilterRule & { categoryLevel?: unknown })
        .categoryLevel,
    parentFieldId: (rule as DashboardFilterRule & { parentFieldId?: unknown })
        .parentFieldId,
    settings: rule.settings,
    minAllowedDate: (rule as DashboardFilterRule & { minAllowedDate?: unknown })
        .minAllowedDate,
    maxAllowedDate: (rule as DashboardFilterRule & { maxAllowedDate?: unknown })
        .maxAllowedDate,
    enableDynamicMaxAllowedDate: (
        rule as DashboardFilterRule & { enableDynamicMaxAllowedDate?: unknown }
    ).enableDynamicMaxAllowedDate,
    dateRangeGranularity: (
        rule as DashboardFilterRule & { dateRangeGranularity?: unknown }
    ).dateRangeGranularity,
    tileTargetCount: Object.keys(rule.tileTargets || {}).length,
});


const filterResourceName = (
    rule: DashboardFilterRule,
    tabName?: string | null,
): string => {
    const label = rule.label?.trim();
    if (label) return label;
    const fieldId = rule.target?.fieldId?.trim();
    const niceTab = tabName?.trim();
    if (niceTab && fieldId) return `${niceTab} · ${fieldId}`;
    if (niceTab) return niceTab;
    if (fieldId) return fieldId;
    const tableName = rule.target?.tableName;
    if (tableName && fieldId) return `${tableName}.${fieldId}`;
    return rule.id;
};

const pushFilterEvent = (
    action: string,
    rule: DashboardFilterRule,
    ctx: QueueContext,
    changeKind: string,
    extra?: Record<string, unknown>,
) => {
    enqueueDashboardOperationEvent({
        action,
        scope: ctx.scope,
        tabUuid: ctx.scope === 'tab' ? ctx.tabUuid ?? null : null,
        tabName: ctx.scope === 'tab' ? ctx.tabName ?? null : null,
        resourceType: 'dashboard_filter',
        resourceUuid: rule.id,
        resourceName: filterResourceName(rule, ctx.tabName),
        changeKind,
        summary: {
            ...baseFilterSummary(rule),
            ...(extra ?? {}),
        },
    });
};

export const enqueueFilterCreated = (
    rule: DashboardFilterRule,
    ctx: QueueContext,
): void => {
    pushFilterEvent(
        PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_CREATED,
        rule,
        ctx,
        'created',
    );
};

export const enqueueFilterDeleted = (
    rule: DashboardFilterRule,
    ctx: QueueContext,
): void => {
    pushFilterEvent(
        PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_DELETED,
        rule,
        ctx,
        'deleted',
    );
};

export const enqueueFilterUpdatedFromDiff = (
    previous: DashboardFilterRule,
    next: DashboardFilterRule,
    ctx: QueueContext,
): void => {
    const prevExt = previous as DashboardFilterRule & Record<string, unknown>;
    const nextExt = next as DashboardFilterRule & Record<string, unknown>;

    const changes: Array<{
        changeKind: string;
        action: string;
        previous: Record<string, unknown>;
        next: Record<string, unknown>;
    }> = [];

    if (stableJson(prevExt.categoryLevel) !== stableJson(nextExt.categoryLevel)) {
        changes.push({
            changeKind: 'category_level',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_CATEGORY_LEVEL_CHANGED,
            previous: { categoryLevel: prevExt.categoryLevel },
            next: { categoryLevel: nextExt.categoryLevel },
        });
    }

    if (stableJson(prevExt.parentFieldId) !== stableJson(nextExt.parentFieldId)) {
        changes.push({
            changeKind: 'parent_binding',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_PARENT_BINDING_CHANGED,
            previous: { parentFieldId: prevExt.parentFieldId },
            next: { parentFieldId: nextExt.parentFieldId },
        });
    }

    const dateKeys = [
        'minAllowedDate',
        'maxAllowedDate',
        'enableDynamicMaxAllowedDate',
        'dateRangeGranularity',
        'settings',
    ] as const;
    if (dateKeys.some((key) => stableJson(prevExt[key]) !== stableJson(nextExt[key]))) {
        changes.push({
            changeKind: 'date_constraint',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_DATE_CONSTRAINT_CHANGED,
            previous: Object.fromEntries(dateKeys.map((key) => [key, prevExt[key]])),
            next: Object.fromEntries(dateKeys.map((key) => [key, nextExt[key]])),
        });
    }

    const defaultKeys = ['values', 'required', 'operator'] as const;
    if (
        defaultKeys.some((key) => stableJson(prevExt[key]) !== stableJson(nextExt[key]))
    ) {
        changes.push({
            changeKind: 'default_values',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_DEFAULT_VALUES_CHANGED,
            previous: Object.fromEntries(defaultKeys.map((key) => [key, prevExt[key]])),
            next: Object.fromEntries(defaultKeys.map((key) => [key, nextExt[key]])),
        });
    }

    if (stableJson(prevExt.disabled) !== stableJson(nextExt.disabled)) {
        changes.push({
            changeKind: 'disabled',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_DISABLED_CHANGED,
            previous: { disabled: prevExt.disabled },
            next: { disabled: nextExt.disabled },
        });
    }

    if (
        stableJson(prevExt.excludedValues) !==
        stableJson(nextExt.excludedValues)
    ) {
        changes.push({
            changeKind: 'excluded_values',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_EXCLUDED_VALUES_CHANGED,
            previous: { excludedValues: prevExt.excludedValues },
            next: { excludedValues: nextExt.excludedValues },
        });
    }

    if (stableJson(prevExt.readOnly) !== stableJson(nextExt.readOnly)) {
        changes.push({
            changeKind: 'read_only',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_READ_ONLY_CHANGED,
            previous: { readOnly: prevExt.readOnly },
            next: { readOnly: nextExt.readOnly },
        });
    }

    if (stableJson(prevExt.hidden) !== stableJson(nextExt.hidden)) {
        changes.push({
            changeKind: 'filter_hidden',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_HIDDEN_CHANGED,
            previous: { hidden: prevExt.hidden },
            next: { hidden: nextExt.hidden },
        });
    }

    if (
        stableJson(prevExt.allowedOperators) !==
        stableJson(nextExt.allowedOperators)
    ) {
        changes.push({
            changeKind: 'allowed_operators',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_ALLOWED_OPERATORS_CHANGED,
            previous: { allowedOperators: prevExt.allowedOperators },
            next: { allowedOperators: nextExt.allowedOperators },
        });
    }

    if (stableJson(prevExt.singleValue) !== stableJson(nextExt.singleValue)) {
        changes.push({
            changeKind: 'input_mode',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_INPUT_MODE_CHANGED,
            previous: { singleValue: prevExt.singleValue },
            next: { singleValue: nextExt.singleValue },
        });
    }

    if (
        tileTargetsSignature(previous.tileTargets) !==
        tileTargetsSignature(next.tileTargets)
    ) {
        changes.push({
            changeKind: 'tile_binding',
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_TILE_BINDING_CHANGED,
            previous: {
                tileTargetCount: Object.keys(previous.tileTargets || {}).length,
            },
            next: {
                tileTargetCount: Object.keys(next.tileTargets || {}).length,
            },
        });
    }

    if (changes.length === 1) {
        const only = changes[0];
        pushFilterEvent(only.action, next, ctx, only.changeKind, {
            previous: only.previous,
            next: only.next,
        });
        return;
    }

    if (changes.length > 1) {
        // One apply => one log row; keep fine detail inside summary.
        pushFilterEvent(
            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_UPDATED,
            next,
            ctx,
            'updated_bundle',
            {
                changeKinds: changes.map((c) => c.changeKind),
                changes,
            },
        );
        return;
    }

    const corePrev = { ...prevExt };
    const coreNext = { ...nextExt };
    delete corePrev.tileTargets;
    delete coreNext.tileTargets;
    if (stableJson(corePrev) !== stableJson(coreNext)) {
        pushFilterEvent(
            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_UPDATED,
            next,
            ctx,
            'updated',
            {
                previous: baseFilterSummary(previous),
                next: baseFilterSummary(next),
            },
        );
    }
};

export const enqueueFilterBarVisibilityChanged = (
    ctx: QueueContext,
    previousEnabled: boolean,
    nextEnabled: boolean,
): void => {
    if (previousEnabled === nextEnabled) return;
    const label =
        ctx.scope === 'tab'
            ? ctx.tabName?.trim() || undefined
            : undefined;
    enqueueDashboardOperationEvent({
        action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_BAR_VISIBILITY_CHANGED,
        scope: ctx.scope,
        tabUuid: ctx.scope === 'tab' ? ctx.tabUuid ?? null : null,
        tabName: ctx.scope === 'tab' ? ctx.tabName ?? null : null,
        resourceType: 'dashboard_filter',
        resourceUuid: null,
        resourceName: label ?? (ctx.scope === 'tab' ? 'tab' : 'global'),
        changeKind: 'bar_visibility',
        summary: {
            label:
                ctx.scope === 'global'
                    ? 'global'
                    : label || 'tab',
            scope: ctx.scope,
            tabUuid: ctx.tabUuid ?? null,
            tabName: ctx.tabName ?? null,
            previous: { enabled: previousEnabled },
            next: { enabled: nextEnabled },
        },
    });
};

export const enqueueAddFilterButtonVisibilityChanged = (
    ctx: QueueContext,
    previousVisible: boolean,
    nextVisible: boolean,
): void => {
    if (previousVisible === nextVisible) return;
    const label =
        ctx.scope === 'tab'
            ? ctx.tabName?.trim() || undefined
            : undefined;
    enqueueDashboardOperationEvent({
        action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_ADD_BUTTON_VISIBILITY_CHANGED,
        scope: ctx.scope,
        tabUuid: ctx.scope === 'tab' ? ctx.tabUuid ?? null : null,
        tabName: ctx.scope === 'tab' ? ctx.tabName ?? null : null,
        resourceType: 'dashboard_filter',
        resourceUuid: null,
        resourceName: label ?? (ctx.scope === 'tab' ? 'tab' : 'global'),
        changeKind: 'add_button_visibility',
        summary: {
            label:
                ctx.scope === 'global'
                    ? 'global'
                    : label || 'tab',
            scope: ctx.scope,
            tabUuid: ctx.tabUuid ?? null,
            tabName: ctx.tabName ?? null,
            previous: { visible: previousVisible },
            next: { visible: nextVisible },
        },
    });
};
