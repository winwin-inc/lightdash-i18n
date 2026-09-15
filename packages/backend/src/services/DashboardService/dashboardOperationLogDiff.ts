import {
    PROJECT_OPERATION_LOG_ACTIONS,
    DashboardTileTypes,
    isDashboardFieldTarget,
    type CreateDashboard,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTileTarget,
    type ProjectOperationLogAction,
} from '@lightdash/common';

/** Tiles from create/update payloads may omit uuid until persisted. */
type DiffableTile = CreateDashboard['tiles'][number];

export type DashboardOperationLogEvent = {
    action: ProjectOperationLogAction;
    summary: Record<string, unknown>;
};

const FILTER_KINDS = ['dimensions', 'metrics', 'tableCalculations'] as const;

type FilterKind = (typeof FILTER_KINDS)[number];

const stableJson = (value: unknown): string => {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return String(value);
    }
};

const getTileTitle = (
    tile: DiffableTile | undefined,
    tileUuid: string,
): string => {
    if (!tile) return tileUuid;
    const properties = tile.properties as {
        title?: string;
        chartName?: string | null;
        savedChartUuid?: string | null;
    };
    return (
        properties.title ||
        properties.chartName ||
        properties.savedChartUuid ||
        tileUuid
    );
};

const flattenFilters = (
    filters: DashboardFilters | undefined,
): Array<DashboardFilterRule & { filterKind: FilterKind }> => {
    if (!filters) return [];
    return FILTER_KINDS.flatMap((filterKind) =>
        (filters[filterKind] || []).map((rule) => ({
            ...rule,
            filterKind,
        })),
    );
};

const filterCoreWithoutTileTargets = (rule: DashboardFilterRule) => {
    const { tileTargets: _tileTargets, ...rest } = rule;
    return rest;
};

const FILTER_SUMMARY_KEYS = [
    'operator',
    'values',
    'label',
    'target',
    'settings',
    'disabled',
    'required',
    'singleValue',
    'categoryLevel',
    'parentFieldId',
    'excludedValues',
    'allowedOperators',
    'minAllowedDate',
    'maxAllowedDate',
    'enableDynamicMaxAllowedDate',
    'readOnly',
    'hidden',
    'requiredGroupId',
    'lockedTabUuids',
    'dateRangeGranularity',
] as const;

const pickFilterSummary = (rule: DashboardFilterRule) => {
    const raw = rule as DashboardFilterRule & Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of FILTER_SUMMARY_KEYS) {
        if (key in raw) {
            out[key] = raw[key];
        }
    }
    return out;
};

const diffFilterFields = (
    previous: DashboardFilterRule,
    next: DashboardFilterRule,
): Record<string, { previous: unknown; next: unknown }> => {
    const prevPick = pickFilterSummary(previous);
    const nextPick = pickFilterSummary(next);
    const keys = new Set([...Object.keys(prevPick), ...Object.keys(nextPick)]);
    const changes: Record<string, { previous: unknown; next: unknown }> = {};
    for (const key of keys) {
        if (stableJson(prevPick[key]) !== stableJson(nextPick[key])) {
            changes[key] = {
                previous: prevPick[key] ?? null,
                next: nextPick[key] ?? null,
            };
        }
    }
    return changes;
};


const isBoundTarget = (
    target: DashboardTileTarget | undefined,
): target is Exclude<DashboardTileTarget, false> =>
    target !== undefined && target !== false && isDashboardFieldTarget(target);

const diffTileTargetsForFilter = (
    previous: DashboardFilterRule | undefined,
    next: DashboardFilterRule,
    tilesByUuid: Map<string, DiffableTile>,
): DashboardOperationLogEvent | undefined => {
    const prevTargets = previous?.tileTargets || {};
    const nextTargets = next.tileTargets || {};
    const tileUuids = new Set([
        ...Object.keys(prevTargets),
        ...Object.keys(nextTargets),
    ]);

    const changes: Array<Record<string, unknown>> = [];
    for (const tileUuid of tileUuids) {
        const prev = prevTargets[tileUuid];
        const curr = nextTargets[tileUuid];
        const prevBound = isBoundTarget(prev);
        const currBound = isBoundTarget(curr);
        const prevFieldId = prevBound ? prev.fieldId : null;
        const currFieldId = currBound ? curr.fieldId : null;

        if (prevBound === currBound && prevFieldId === currFieldId) {
            if (prevBound || currBound) {
                if (stableJson(prev) === stableJson(curr)) {
                    continue;
                }
            } else {
                const prevExplicit = prev === false;
                const currExplicit = curr === false;
                if (prevExplicit === currExplicit) {
                    continue;
                }
                changes.push({
                    tileUuid,
                    tileTitle: getTileTitle(tilesByUuid.get(tileUuid), tileUuid),
                    bound: false,
                    fieldId: null,
                    previousBound: false,
                    previousFieldId: null,
                    explicitUnbound: currExplicit,
                });
                continue;
            }
        }

        if (
            prevBound !== currBound ||
            prevFieldId !== currFieldId ||
            stableJson(prev) !== stableJson(curr)
        ) {
            changes.push({
                tileUuid,
                tileTitle: getTileTitle(tilesByUuid.get(tileUuid), tileUuid),
                bound: currBound,
                fieldId: currFieldId,
                previousBound: prevBound,
                previousFieldId: prevFieldId,
            });
        }
    }

    if (changes.length === 0) {
        return undefined;
    }

    return {
        action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_TILE_TARGETS_UPDATED,
        summary: {
            filterId: next.id,
            filterLabel: next.label || next.target?.fieldId || next.id,
            fieldId: next.target?.fieldId,
            changes,
        },
    };
};

export const diffDashboardFilters = (
    previousFilters: DashboardFilters | undefined,
    nextFilters: DashboardFilters | undefined,
    tiles: DiffableTile[],
): DashboardOperationLogEvent[] => {
    const tilesByUuid = new Map(
        tiles
            .filter((tile): tile is DiffableTile & { uuid: string } => !!tile.uuid)
            .map((tile) => [tile.uuid, tile]),
    );
    const prevById = new Map(
        flattenFilters(previousFilters).map((rule) => [rule.id, rule]),
    );
    const nextById = new Map(
        flattenFilters(nextFilters).map((rule) => [rule.id, rule]),
    );
    const events: DashboardOperationLogEvent[] = [];

    for (const [id, next] of nextById) {
        const prev = prevById.get(id);
        if (!prev) {
            events.push({
                action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_CREATED,
                summary: {
                    filterId: next.id,
                    filterLabel: next.label || next.target?.fieldId || next.id,
                    fieldId: next.target?.fieldId,
                    filterKind: next.filterKind,
                    operator: next.operator,
                    values: next.values,
                },
            });
            const tileEvent = diffTileTargetsForFilter(
                undefined,
                next,
                tilesByUuid,
            );
            if (tileEvent) {
                events.push(tileEvent);
            }
            continue;
        }

        const prevCore = filterCoreWithoutTileTargets(prev);
        const nextCore = filterCoreWithoutTileTargets(next);
        if (stableJson(prevCore) !== stableJson(nextCore)) {
            const fieldChanges = diffFilterFields(prev, next);
            events.push({
                action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_UPDATED,
                summary: {
                    filterId: next.id,
                    filterLabel: next.label || next.target?.fieldId || next.id,
                    fieldId: next.target?.fieldId,
                    filterKind: next.filterKind,
                    changedFields: Object.keys(fieldChanges),
                    changes: fieldChanges,
                },
            });
        }

        const tileEvent = diffTileTargetsForFilter(prev, next, tilesByUuid);
        if (tileEvent) {
            events.push(tileEvent);
        }
    }

    for (const [id, prev] of prevById) {
        if (nextById.has(id)) continue;
        events.push({
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_FILTERS_DELETED,
            summary: {
                filterId: prev.id,
                filterLabel: prev.label || prev.target?.fieldId || prev.id,
                fieldId: prev.target?.fieldId,
                filterKind: prev.filterKind,
            },
        });
    }

    return events;
};

const describeTile = (tile: DiffableTile) => {
    const properties = tile.properties as {
        title?: string;
        chartName?: string | null;
        savedChartUuid?: string | null;
        belongsToDashboard?: boolean;
    };
    return {
        tileUuid: tile.uuid || 'unknown',
        type: tile.type,
        title: getTileTitle(tile, tile.uuid || 'unknown'),
        savedChartUuid: properties.savedChartUuid ?? null,
        chartName: properties.chartName ?? null,
        belongsToDashboard: properties.belongsToDashboard ?? null,
        x: tile.x,
        y: tile.y,
        w: tile.w,
        h: tile.h,
        tabUuid: tile.tabUuid ?? null,
    };
};

export const diffDiffableTiles = (
    previousTiles: DiffableTile[] | undefined,
    nextTiles: DiffableTile[] | undefined,
): DashboardOperationLogEvent[] => {
    const prevById = new Map(
        (previousTiles || [])
            .filter((t): t is DiffableTile & { uuid: string } => !!t.uuid)
            .map((t) => [t.uuid, t]),
    );
    const nextById = new Map(
        (nextTiles || [])
            .filter((t): t is DiffableTile & { uuid: string } => !!t.uuid)
            .map((t) => [t.uuid, t]),
    );
    const events: DashboardOperationLogEvent[] = [];

    const added: ReturnType<typeof describeTile>[] = [];
    const removed: ReturnType<typeof describeTile>[] = [];
    const layoutChanged: Array<Record<string, unknown>> = [];
    const chartChanged: Array<Record<string, unknown>> = [];

    for (const [uuid, next] of nextById) {
        const prev = prevById.get(uuid);
        if (!prev) {
            added.push(describeTile(next));
            continue;
        }

        const prevDesc = describeTile(prev);
        const nextDesc = describeTile(next);
        const positionDiffers = (['x', 'y', 'w', 'h'] as const).some(
            (key) => prevDesc[key] !== nextDesc[key],
        );
        if (positionDiffers) {
            layoutChanged.push({
                tileUuid: uuid,
                title: nextDesc.title,
                previous: {
                    x: prevDesc.x,
                    y: prevDesc.y,
                    w: prevDesc.w,
                    h: prevDesc.h,
                },
                next: {
                    x: nextDesc.x,
                    y: nextDesc.y,
                    w: nextDesc.w,
                    h: nextDesc.h,
                },
            });
        }

        if (prevDesc.tabUuid !== nextDesc.tabUuid) {
            events.push({
                action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TILES_TAB_ASSIGNMENT_CHANGED,
                summary: {
                    tileUuid: uuid,
                    title: nextDesc.title,
                    previousTabUuid: prevDesc.tabUuid,
                    nextTabUuid: nextDesc.tabUuid,
                },
            });
        }

        if (prev.type !== next.type) {
            events.push({
                action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TILES_CHART_KIND_CHANGED,
                summary: {
                    tileUuid: uuid,
                    title: nextDesc.title,
                    previousType: prev.type,
                    nextType: next.type,
                },
            });
        }

        if (
            prev.type === DashboardTileTypes.SAVED_CHART ||
            next.type === DashboardTileTypes.SAVED_CHART
        ) {
            if (prevDesc.savedChartUuid !== nextDesc.savedChartUuid) {
                events.push({
                    action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TILES_CHART_LINK_CHANGED,
                    summary: {
                        tileUuid: uuid,
                        title: nextDesc.title,
                        previousSavedChartUuid: prevDesc.savedChartUuid,
                        nextSavedChartUuid: nextDesc.savedChartUuid,
                        previousChartName: prevDesc.chartName,
                        nextChartName: nextDesc.chartName,
                    },
                });
            } else if (
                prevDesc.chartName !== nextDesc.chartName ||
                prevDesc.title !== nextDesc.title
            ) {
                chartChanged.push({
                    tileUuid: uuid,
                    previous: {
                        savedChartUuid: prevDesc.savedChartUuid,
                        chartName: prevDesc.chartName,
                        title: prevDesc.title,
                    },
                    next: {
                        savedChartUuid: nextDesc.savedChartUuid,
                        chartName: nextDesc.chartName,
                        title: nextDesc.title,
                    },
                });
            }
        }
    }

    for (const [uuid, prev] of prevById) {
        if (!nextById.has(uuid)) {
            removed.push(describeTile(prev));
        }
    }

    const prevChartUuids = new Set(
        [...prevById.values()]
            .filter((t) => t.type === DashboardTileTypes.SAVED_CHART)
            .map((t) => {
                const properties = t.properties as {
                    savedChartUuid?: string | null;
                };
                return properties.savedChartUuid;
            })
            .filter((id): id is string => !!id),
    );
    const copied = added.filter(
        (tile) =>
            tile.type === 'saved_chart' &&
            !!tile.savedChartUuid &&
            prevChartUuids.has(tile.savedChartUuid),
    );
    const copiedUuids = new Set(copied.map((t) => t.tileUuid));
    const trulyAdded = added.filter((t) => !copiedUuids.has(t.tileUuid));

    for (const tile of copied) {
        events.push({
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TILES_COPIED,
            summary: {
                newTileUuid: tile.tileUuid,
                chartName: tile.chartName || tile.title,
                savedChartUuid: tile.savedChartUuid,
            },
        });
    }

    if (
        trulyAdded.length > 0 ||
        removed.length > 0 ||
        layoutChanged.length > 0 ||
        chartChanged.length > 0
    ) {
        events.push({
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TILES_LAYOUT_UPDATED,
            summary: {
                added: trulyAdded,
                removed,
                layoutChanged,
                chartChanged,
            },
        });
    }

    return events;
};

type DashboardVersionedSnapshot = {
    filters?: DashboardFilters;
    tiles?: DiffableTile[];
    tabs?: Dashboard['tabs'];
    parameters?: Dashboard['parameters'];
    config?: Dashboard['config'];
};

export const diffDashboardVersionedContent = (
    previous: DashboardVersionedSnapshot,
    next: DashboardVersionedSnapshot,
): DashboardOperationLogEvent[] => {
    const events: DashboardOperationLogEvent[] = [
        ...diffDashboardFilters(
            previous.filters,
            next.filters,
            next.tiles || [],
        ),
        ...diffDiffableTiles(previous.tiles, next.tiles),
    ];

    const prevTabs = previous.tabs || [];
    const nextTabs = next.tabs || [];
    if (stableJson(prevTabs) !== stableJson(nextTabs)) {
        const prevById = new Map(prevTabs.map((tab) => [tab.uuid, tab]));
        const nextById = new Map(nextTabs.map((tab) => [tab.uuid, tab]));

        for (const [uuid, tab] of nextById) {
            const prev = prevById.get(uuid);
            if (!prev) {
                events.push({
                    action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TABS_CREATED,
                    summary: {
                        tabUuid: uuid,
                        name: tab.name,
                        order: tab.order,
                    },
                });
            } else if (prev.name !== tab.name) {
                events.push({
                    action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TABS_RENAMED,
                    summary: {
                        tabUuid: uuid,
                        previousName: prev.name,
                        nextName: tab.name,
                    },
                });
            }
        }

        for (const [uuid, tab] of prevById) {
            if (!nextById.has(uuid)) {
                events.push({
                    action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TABS_DELETED,
                    summary: {
                        tabUuid: uuid,
                        name: tab.name,
                        order: tab.order,
                    },
                });
            }
        }

        const prevOrder = prevTabs.map((tab) => tab.uuid).join(',');
        const nextOrder = nextTabs.map((tab) => tab.uuid).join(',');
        if (
            prevOrder !== nextOrder &&
            prevById.size === nextById.size &&
            [...prevById.keys()].every((uuid) => nextById.has(uuid))
        ) {
            events.push({
                action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_TABS_REORDERED,
                summary: {
                    previousOrder: prevTabs.map((tab) => ({
                        uuid: tab.uuid,
                        name: tab.name,
                        order: tab.order,
                    })),
                    nextOrder: nextTabs.map((tab) => ({
                        uuid: tab.uuid,
                        name: tab.name,
                        order: tab.order,
                    })),
                },
            });
        }
    }

    if (
        stableJson(previous.parameters || {}) !==
        stableJson(next.parameters || {})
    ) {
        events.push({
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_UPDATED,
            summary: {
                kind: 'parameters',
                previousParameterKeys: Object.keys(previous.parameters || {}),
                nextParameterKeys: Object.keys(next.parameters || {}),
            },
        });
    }

    if (stableJson(previous.config || {}) !== stableJson(next.config || {})) {
        events.push({
            action: PROJECT_OPERATION_LOG_ACTIONS.DASHBOARD_UPDATED,
            summary: {
                kind: 'config',
                previous: previous.config || null,
                next: next.config || null,
            },
        });
    }

    return events;
};
