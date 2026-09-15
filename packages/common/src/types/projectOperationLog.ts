export const PROJECT_OPERATION_LOG_ACTIONS = {
    DASHBOARD_CREATED: 'dashboard.created',
    DASHBOARD_UPDATED: 'dashboard.updated',
    DASHBOARD_DELETED: 'dashboard.deleted',
    DASHBOARD_DUPLICATED: 'dashboard.duplicated',
    DASHBOARD_MOVED: 'dashboard.moved',
    DASHBOARD_PROMOTED: 'dashboard.promoted',
    DASHBOARD_TILES_COPIED: 'dashboard.tiles.copied',
    DASHBOARD_TILES_LAYOUT_UPDATED: 'dashboard.tiles.layout_updated',
    DASHBOARD_TILES_CHART_KIND_CHANGED: 'dashboard.tiles.chart_kind_changed',
    DASHBOARD_TILES_TAB_ASSIGNMENT_CHANGED:
        'dashboard.tiles.tab_assignment_changed',
    DASHBOARD_TILES_CHART_LINK_CHANGED: 'dashboard.tiles.chart_link_changed',
    DASHBOARD_TABS_CREATED: 'dashboard.tabs.created',
    DASHBOARD_TABS_RENAMED: 'dashboard.tabs.renamed',
    DASHBOARD_TABS_DELETED: 'dashboard.tabs.deleted',
    DASHBOARD_TABS_REORDERED: 'dashboard.tabs.reordered',
    DASHBOARD_FILTERS_CREATED: 'dashboard.filters.created',
    DASHBOARD_FILTERS_UPDATED: 'dashboard.filters.updated',
    DASHBOARD_FILTERS_DELETED: 'dashboard.filters.deleted',
    DASHBOARD_FILTERS_TILE_TARGETS_UPDATED:
        'dashboard.filters.tile_targets_updated',
    DASHBOARD_FILTERS_CATEGORY_LEVEL_CHANGED:
        'dashboard.filters.category_level_changed',
    DASHBOARD_FILTERS_PARENT_BINDING_CHANGED:
        'dashboard.filters.parent_binding_changed',
    DASHBOARD_FILTERS_DATE_CONSTRAINT_CHANGED:
        'dashboard.filters.date_constraint_changed',
    DASHBOARD_FILTERS_DEFAULT_VALUES_CHANGED:
        'dashboard.filters.default_values_changed',
    DASHBOARD_FILTERS_TILE_BINDING_CHANGED:
        'dashboard.filters.tile_binding_changed',
    OPERATION_LOG_PURGED: 'operation_log.purged',
} as const;

export type ProjectOperationLogAction =
    (typeof PROJECT_OPERATION_LOG_ACTIONS)[keyof typeof PROJECT_OPERATION_LOG_ACTIONS];

export type ProjectOperationLogListItem = {
    operationLogUuid: string;
    createdAt: Date;
    actorUserUuid: string | null;
    actorEmail: string | null;
    actorName: string | null;
    actorDisplay: string;
    action: string;
    resourceType: string;
    resourceUuid: string | null;
    resourceName: string | null;
    status: string;
    summary: Record<string, unknown> | null;
};

export type ProjectOperationLogList = {
    data: ProjectOperationLogListItem[];
    pagination: {
        page: number;
        pageSize: number;
        totalPageCount: number;
        totalResults: number;
    };
};

export type ApiProjectOperationLogListResponse = {
    status: 'ok';
    results: ProjectOperationLogList;
};

export type ApiProjectOperationLogResponse = {
    status: 'ok';
    results: ProjectOperationLogListItem;
};

export type ProjectOperationLogPurgeResult = {
    deletedCount: number;
    cutoff: Date;
};

export type ApiProjectOperationLogPurgeResponse = {
    status: 'ok';
    results: ProjectOperationLogPurgeResult;
};

export type ProjectOperationLogPurgeMode = 'before_days' | 'all';

export type ProjectOperationLogPurgeBody = {
    /** before_days (default): delete older than beforeDays/before; all: clear project logs */
    mode?: ProjectOperationLogPurgeMode;
    beforeDays?: number;
    before?: string;
};

export type DashboardOperationEventScope = 'global' | 'tab';

export type DashboardOperationClientEvent = {
    schemaVersion: 1;
    occurredAt?: string;
    action: ProjectOperationLogAction | string;
    scope?: DashboardOperationEventScope;
    tabUuid?: string | null;
    tabName?: string | null;
    resourceType?: string;
    resourceUuid?: string | null;
    resourceName?: string | null;
    changeKind?: string;
    summary?: Record<string, unknown>;
};

export type DashboardClientEventsPayload = {
    clientEvents?: DashboardOperationClientEvent[];
};
