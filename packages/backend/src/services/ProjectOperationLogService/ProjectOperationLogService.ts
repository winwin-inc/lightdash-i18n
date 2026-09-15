import { subject } from '@casl/ability';
import {
    ForbiddenError,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    PROJECT_OPERATION_LOG_ACTIONS,
    SessionUser,
    type ProjectOperationLogList,
    type ProjectOperationLogListItem,
    type ProjectOperationLogPurgeResult,
} from '@lightdash/common';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    CreateProjectOperationLog,
    ProjectOperationLogModel,
} from '../../models/ProjectOperationLogModel/ProjectOperationLogModel';
import { BaseService } from '../BaseService';

const MIN_RETENTION_DAYS = 30;
const DEFAULT_PURGE_DAYS = 90;

export type RecordProjectOperationLog = {
    organizationUuid: string;
    projectUuid: string;
    actor: Pick<
        SessionUser,
        'userUuid' | 'email' | 'firstName' | 'lastName'
    >;
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

export type ProjectOperationLogListFilters = {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
    action?: string;
    actorUserUuid?: string;
    actorEmail?: string;
    resourceType?: string;
    resourceUuid?: string;
    q?: string;
};

type ProjectOperationLogServiceArguments = {
    projectOperationLogModel: ProjectOperationLogModel;
    projectModel: ProjectModel;
};

const actorNameFromUser = (
    actor: Pick<SessionUser, 'firstName' | 'lastName'>,
): string | null => {
    const name = `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim();
    return name.length > 0 ? name : null;
};

export class ProjectOperationLogService extends BaseService {
    private projectOperationLogModel: ProjectOperationLogModel;

    private projectModel: ProjectModel;

    constructor(args: ProjectOperationLogServiceArguments) {
        super({ serviceName: 'ProjectOperationLogService' });
        this.projectOperationLogModel = args.projectOperationLogModel;
        this.projectModel = args.projectModel;
    }

    private async assertCanManage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ organizationUuid: string }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { organizationUuid };
    }

    /**
     * Persist an operation log. Failures are logged and swallowed so business
     * writes are never blocked by audit logging.
     */
    async record(data: RecordProjectOperationLog): Promise<string | undefined> {
        try {
            const payload: CreateProjectOperationLog = {
                organizationUuid: data.organizationUuid,
                projectUuid: data.projectUuid,
                actorUserUuid: data.actor.userUuid,
                actorEmail: data.actor.email ?? null,
                actorName: actorNameFromUser(data.actor),
                action: data.action,
                resourceType: data.resourceType,
                resourceUuid: data.resourceUuid ?? null,
                resourceName: data.resourceName ?? null,
                status: data.status ?? 'success',
                summary: data.summary ?? null,
                requestId: data.requestId ?? null,
                ip: data.ip ?? null,
                userAgent: data.userAgent ?? null,
            };
            return await this.projectOperationLogModel.create(payload);
        } catch (error) {
            this.logger.error(
                `Failed to record operation log action=${data.action} project=${data.projectUuid}`,
                error,
            );
            return undefined;
        }
    }

    async list(
        user: SessionUser,
        projectUuid: string,
        filters: ProjectOperationLogListFilters,
    ): Promise<ProjectOperationLogList> {
        await this.assertCanManage(user, projectUuid);
        return this.projectOperationLogModel.list({
            projectUuid,
            page: filters.page,
            pageSize: filters.pageSize,
            from: filters.from ? new Date(filters.from) : undefined,
            to: filters.to ? new Date(filters.to) : undefined,
            action: filters.action
                ? filters.action.includes(',')
                    ? filters.action.split(',').map((a) => a.trim())
                    : filters.action
                : undefined,
            actorUserUuid: filters.actorUserUuid,
            actorEmail: filters.actorEmail,
            resourceType: filters.resourceType,
            resourceUuid: filters.resourceUuid,
            q: filters.q,
        });
    }

    async get(
        user: SessionUser,
        projectUuid: string,
        operationLogUuid: string,
    ): Promise<ProjectOperationLogListItem> {
        await this.assertCanManage(user, projectUuid);
        const row = await this.projectOperationLogModel.getByUuid(
            projectUuid,
            operationLogUuid,
        );
        if (!row) {
            throw new NotFoundError('Operation log not found');
        }
        return row;
    }

    async purge(
        user: SessionUser,
        projectUuid: string,
        body: { beforeDays?: number; before?: string },
    ): Promise<ProjectOperationLogPurgeResult> {
        const { organizationUuid } = await this.assertCanManage(
            user,
            projectUuid,
        );

        let cutoff: Date;
        let beforeDays: number | undefined = body.beforeDays;

        if (body.before) {
            cutoff = new Date(body.before);
            if (Number.isNaN(cutoff.getTime())) {
                throw new ParameterError('Invalid before date');
            }
            const ms = Date.now() - cutoff.getTime();
            const days = Math.floor(ms / (24 * 60 * 60 * 1000));
            if (days < MIN_RETENTION_DAYS) {
                throw new ParameterError(
                    `Retention minimum is ${MIN_RETENTION_DAYS} days`,
                );
            }
        } else {
            beforeDays = beforeDays ?? DEFAULT_PURGE_DAYS;
            if (beforeDays < MIN_RETENTION_DAYS) {
                throw new ParameterError(
                    `Retention minimum is ${MIN_RETENTION_DAYS} days`,
                );
            }
            cutoff = new Date();
            cutoff.setUTCDate(cutoff.getUTCDate() - beforeDays);
        }

        const deletedCount =
            await this.projectOperationLogModel.purgeBefore(
                projectUuid,
                cutoff,
            );

        await this.record({
            organizationUuid,
            projectUuid,
            actor: user,
            action: PROJECT_OPERATION_LOG_ACTIONS.OPERATION_LOG_PURGED,
            resourceType: 'operation_log',
            summary: {
                deletedCount,
                cutoff: cutoff.toISOString(),
                beforeDays: beforeDays ?? null,
            },
        });

        return { deletedCount, cutoff };
    }
}