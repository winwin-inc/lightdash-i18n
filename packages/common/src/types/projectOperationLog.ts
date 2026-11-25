export const PROJECT_OPERATION_LOG_ACTIONS = {
    DASHBOARD_CREATED: 'dashboard.created',
    DASHBOARD_UPDATED: 'dashboard.updated',
    DASHBOARD_DELETED: 'dashboard.deleted',
    DASHBOARD_DUPLICATED: 'dashboard.duplicated',
    DASHBOARD_MOVED: 'dashboard.moved',
    DASHBOARD_PROMOTED: 'dashboard.promoted',
    OPERATION_LOG_PURGED: 'operation_log.purged',
    PROJECT_MEMBER_ADDED: 'project_member.added',
    PROJECT_MEMBER_ROLE_UPDATED: 'project_member.role_updated',
    PROJECT_MEMBER_REMOVED: 'project_member.removed',
    PROJECT_GROUP_ACCESS_ADDED: 'project_group_access.added',
    PROJECT_GROUP_ACCESS_ROLE_UPDATED: 'project_group_access.role_updated',
    PROJECT_GROUP_ACCESS_REMOVED: 'project_group_access.removed',
} as const;

export type ProjectOperationLogAction =
    typeof PROJECT_OPERATION_LOG_ACTIONS[keyof typeof PROJECT_OPERATION_LOG_ACTIONS];

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
