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
        resourceName: rule.label || rule.target?.fieldId || rule.id,
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

    let emittedSemantic = false;

    if (stableJson(prevExt.categoryLevel) !== stableJson(nextExt.categoryLevel)) {
        pushFilterEvent(
            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_CATEGORY_LEVEL_CHANGED,
            next,
            ctx,
            'category_level',
            {
                previous: { categoryLevel: prevExt.categoryLevel },
                next: { categoryLevel: nextExt.categoryLevel },
            },
        );
        emittedSemantic = true;
    }

    if (stableJson(prevExt.parentFieldId) !== stableJson(nextExt.parentFieldId)) {
        pushFilterEvent(
            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_PARENT_BINDING_CHANGED,
            next,
            ctx,
            'parent_binding',
            {
                previous: { parentFieldId: prevExt.parentFieldId },
                next: { parentFieldId: nextExt.parentFieldId },
            },
        );
        emittedSemantic = true;
    }

    const dateKeys = [
        'minAllowedDate',
        'maxAllowedDate',
        'enableDynamicMaxAllowedDate',
        'dateRangeGranularity',
        'settings',
    ] as const;
    const dateChanged = dateKeys.some(
        (key) => stableJson(prevExt[key]) !== stableJson(nextExt[key]),
    );
    if (dateChanged) {
        pushFilterEvent(
            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_DATE_CONSTRAINT_CHANGED,
            next,
            ctx,
            'date_constraint',
            {
                previous: Object.fromEntries(
                    dateKeys.map((key) => [key, prevExt[key]]),
                ),
                next: Object.fromEntries(
                    dateKeys.map((key) => [key, nextExt[key]]),
                ),
            },
        );
        emittedSemantic = true;
    }

    const defaultKeys = ['values', 'disabled', 'required', 'operator'] as const;
    const defaultsChanged = defaultKeys.some(
        (key) => stableJson(prevExt[key]) !== stableJson(nextExt[key]),
    );
    if (defaultsChanged) {
        pushFilterEvent(
            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_DEFAULT_VALUES_CHANGED,
            next,
            ctx,
            'default_values',
            {
                previous: Object.fromEntries(
                    defaultKeys.map((key) => [key, prevExt[key]]),
                ),
                next: Object.fromEntries(
                    defaultKeys.map((key) => [key, nextExt[key]]),
                ),
            },
        );
        emittedSemantic = true;
    }

    if (
        tileTargetsSignature(previous.tileTargets) !==
        tileTargetsSignature(next.tileTargets)
    ) {
        pushFilterEvent(
            PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_TILE_BINDING_CHANGED,
            next,
            ctx,
            'tile_binding',
            {
                previousTileTargetCount: Object.keys(previous.tileTargets || {})
                    .length,
                nextTileTargetCount: Object.keys(next.tileTargets || {}).length,
            },
        );
        emittedSemantic = true;
    }

    if (!emittedSemantic) {
        // Fallback coarse update when only label/misc fields changed.
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
    }
};
