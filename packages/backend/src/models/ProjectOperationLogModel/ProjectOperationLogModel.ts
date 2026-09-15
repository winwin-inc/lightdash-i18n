import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import {
    ProjectOperationLogsTableName,
    type DbProjectOperationLog,
    type DbProjectOperationLogInsert,
} from '../database/entities/projectOperationLogs';

export type CreateProjectOperationLog = {
    organizationUuid: string;
    projectUuid: string;
    actorUserUuid?: string | null;
    actorEmail?: string | null;
    actorName?: string | null;
    action: string;
    resourceType: string;
    resourceUuid?: string | null;
    resourceName?: string | null;
    status?: 'success' | 'failure';
    summary?: Record<string, unknown> | null;
    requestId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
};

export type ProjectOperationLogFilters = {
    projectUuid: string;
    page?: number;
    pageSize?: number;
    from?: Date;
    to?: Date;
    action?: string | string[];
    actorUserUuid?: string;
    actorEmail?: string;
    resourceType?: string;
    resourceUuid?: string;
    q?: string;
};

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

const formatActorDisplay = (
    name: string | null,
    email: string | null,
): string => {
    if (name && email) return `${name} (${email})`;
    if (name) return name;
    if (email) return email;
    return 'unknown';
};

const mapRow = (row: DbProjectOperationLog): ProjectOperationLogListItem => ({
    operationLogUuid: row.operation_log_uuid,
    createdAt: row.created_at,
    actorUserUuid: row.actor_user_uuid,
    actorEmail: row.actor_email,
    actorName: row.actor_name,
    actorDisplay: formatActorDisplay(row.actor_name, row.actor_email),
    action: row.action,
    resourceType: row.resource_type,
    resourceUuid: row.resource_uuid,
    resourceName: row.resource_name,
    status: row.status,
    summary: row.summary,
});

type ProjectOperationLogModelArguments = {
    database: Knex;
};

export class ProjectOperationLogModel {
    private database: Knex;

    constructor(args: ProjectOperationLogModelArguments) {
        this.database = args.database;
    }

    async create(data: CreateProjectOperationLog): Promise<string> {
        const operationLogUuid = uuidv4();
        const insert: DbProjectOperationLogInsert = {
            operation_log_uuid: operationLogUuid,
            organization_uuid: data.organizationUuid,
            project_uuid: data.projectUuid,
            actor_user_uuid: data.actorUserUuid ?? null,
            actor_email: data.actorEmail ?? null,
            actor_name: data.actorName ?? null,
            action: data.action,
            resource_type: data.resourceType,
            resource_uuid: data.resourceUuid ?? null,
            resource_name: data.resourceName ?? null,
            status: data.status ?? 'success',
            summary: data.summary ?? null,
            request_id: data.requestId ?? null,
            ip: data.ip ?? null,
            user_agent: data.userAgent ?? null,
        };
        await this.database(ProjectOperationLogsTableName).insert(insert);
        return operationLogUuid;
    }

    async list(filters: ProjectOperationLogFilters): Promise<{
        data: ProjectOperationLogListItem[];
        pagination: {
            page: number;
            pageSize: number;
            totalPageCount: number;
            totalResults: number;
        };
    }> {
        const page = Math.max(1, filters.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

        let query = this.database(ProjectOperationLogsTableName).where(
            'project_uuid',
            filters.projectUuid,
        );

        if (filters.from) {
            query = query.andWhere('created_at', '>=', filters.from);
        }
        if (filters.to) {
            query = query.andWhere('created_at', '<=', filters.to);
        }
        if (filters.action) {
            const actions = Array.isArray(filters.action)
                ? filters.action
                : [filters.action];
            query = query.whereIn('action', actions);
        }
        if (filters.actorUserUuid) {
            query = query.andWhere('actor_user_uuid', filters.actorUserUuid);
        }
        if (filters.actorEmail) {
            query = query.andWhere(
                'actor_email',
                'ilike',
                `%${filters.actorEmail}%`,
            );
        }
        if (filters.resourceType) {
            query = query.andWhere('resource_type', filters.resourceType);
        }
        if (filters.resourceUuid) {
            query = query.andWhere('resource_uuid', filters.resourceUuid);
        }
        if (filters.q) {
            const q = `%${filters.q}%`;
            query = query.andWhere((builder) => {
                void builder
                    .whereILike('resource_name', q)
                    .orWhereILike('actor_email', q)
                    .orWhereILike('actor_name', q)
                    .orWhereILike('action', q);
            });
        }

        const countRow = await query
            .clone()
            .clearSelect()
            .clearOrder()
            .count<{ count: string }[]>({ count: '*' })
            .first();
        const totalResults = Number(countRow?.count ?? 0);

        const rows = await query
            .clone()
            .orderBy('created_at', 'desc')
            .limit(pageSize)
            .offset((page - 1) * pageSize)
            .select('*');

        return {
            data: (rows as DbProjectOperationLog[]).map(mapRow),
            pagination: {
                page,
                pageSize,
                totalPageCount:
                    pageSize > 0 ? Math.ceil(totalResults / pageSize) : 0,
                totalResults,
            },
        };
    }

    async getByUuid(
        projectUuid: string,
        operationLogUuid: string,
    ): Promise<ProjectOperationLogListItem | undefined> {
        const row = await this.database(ProjectOperationLogsTableName)
            .where({
                project_uuid: projectUuid,
                operation_log_uuid: operationLogUuid,
            })
            .first();
        return row ? mapRow(row as DbProjectOperationLog) : undefined;
    }

    async purgeBefore(
        projectUuid: string,
        before: Date,
    ): Promise<number> {
        const deleted = await this.database(ProjectOperationLogsTableName)
            .where('project_uuid', projectUuid)
            .andWhere('created_at', '<', before)
            .delete();
        return typeof deleted === 'number' ? deleted : 0;
    }
}