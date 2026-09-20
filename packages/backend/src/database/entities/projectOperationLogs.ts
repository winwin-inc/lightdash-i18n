import { Knex } from 'knex';

export const ProjectOperationLogsTableName = 'project_operation_logs';

export type DbProjectOperationLog = {
    operation_log_id: number;
    operation_log_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_at: Date;
    actor_user_uuid: string | null;
    actor_email: string | null;
    actor_name: string | null;
    action: string;
    resource_type: string;
    resource_uuid: string | null;
    resource_name: string | null;
    status: string;
    summary: Record<string, unknown> | null;
    request_id: string | null;
    ip: string | null;
    user_agent: string | null;
};

export type DbProjectOperationLogInsert = Omit<
    DbProjectOperationLog,
    'operation_log_id' | 'operation_log_uuid' | 'created_at'
> & {
    operation_log_uuid?: string;
    created_at?: Date;
};

declare module 'knex/types/tables' {
    interface Tables {
        [ProjectOperationLogsTableName]: Knex.CompositeTableType<
            DbProjectOperationLog,
            DbProjectOperationLogInsert
        >;
    }
}