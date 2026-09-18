import { Knex } from 'knex';

const TABLE = 'project_operation_logs';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    const exists = await knex.schema.hasTable(TABLE);
    if (!exists) {
        await knex.schema.createTable(TABLE, (table) => {
            table.bigIncrements('operation_log_id').primary();
            table
                .uuid('operation_log_uuid')
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .unique();
            table.uuid('organization_uuid').notNullable().index();
            table.uuid('project_uuid').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.uuid('actor_user_uuid').nullable().index();
            table.text('actor_email').nullable();
            table.text('actor_name').nullable();
            table.text('action').notNullable();
            table.text('resource_type').notNullable();
            table.uuid('resource_uuid').nullable();
            table.text('resource_name').nullable();
            table.text('status').notNullable().defaultTo('success');
            table.jsonb('summary').nullable();
            table.text('request_id').nullable();
            table.text('ip').nullable();
            table.text('user_agent').nullable();

            table.index(
                ['project_uuid', 'created_at'],
                'project_operation_logs_project_created_at_idx',
            );
            table.index(
                ['project_uuid', 'action', 'created_at'],
                'project_operation_logs_project_action_created_at_idx',
            );
            table.index(
                ['project_uuid', 'actor_user_uuid', 'created_at'],
                'project_operation_logs_project_actor_created_at_idx',
            );
            table.index(
                ['project_uuid', 'resource_type', 'resource_uuid'],
                'project_operation_logs_project_resource_idx',
            );
            table.index(['created_at'], 'project_operation_logs_created_at_idx');
        });
    }
    await knex.raw(`RESET lock_timeout`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    await knex.schema.dropTableIfExists(TABLE);
    await knex.raw(`RESET lock_timeout`);
}