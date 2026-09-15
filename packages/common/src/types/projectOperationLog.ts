export const PROJECT_OPERATION_LOG_ACTIONS = {
    DASHBOARD_CREATED: 'dashboard.created',
    DASHBOARD_UPDATED: 'dashboard.updated',
    DASHBOARD_DELETED: 'dashboard.deleted',
    DASHBOARD_DUPLICATED: 'dashboard.duplicated',
    DASHBOARD_MOVED: 'dashboard.moved',
    DASHBOARD_TILES_COPIED: 'dashboard.tiles.copied',
    DASHBOARD_TILES_LAYOUT_UPDATED: 'dashboard.tiles.layout_updated',
    DASHBOARD_FILTERS_CREATED: 'dashboard.filters.created',
    DASHBOARD_FILTERS_UPDATED: 'dashboard.filters.updated',
    DASHBOARD_FILTERS_DELETED: 'dashboard.filters.deleted',
    DASHBOARD_FILTERS_TILE_TARGETS_UPDATED:
        'dashboard.filters.tile_targets_updated',
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

export type ProjectOperationLogPurgeBody = {
    beforeDays?: number;
    before?: string;
};