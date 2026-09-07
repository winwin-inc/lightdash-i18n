import { Knex } from 'knex';

const SandboxRegistryTableName = 'sandbox_registry';

/**
 * Persistent sandbox registry for Data Apps / SandboxManager.
 * Simplified from upstream: creates the table only (no ai_writeback backfill).
 */
export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SandboxRegistryTableName)) {
        return;
    }

    await knex.schema.createTable(SandboxRegistryTableName, (table) => {
        table
            .uuid('sandbox_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        // Which backend owns the sandbox: 'e2b' | 'docker' | …
        table.text('provider').notNullable();
        // Provider's own id for the live sandbox; null while suspended on
        // non-native-pause backends.
        table.text('provider_sandbox_id').nullable();
        // 'running' | 'suspended'
        table.text('status').notNullable().defaultTo('running');
        // SnapshotRef of persisted state; null while running.
        table.jsonb('snapshot_ref').nullable();
        // PersistentWorkspace declared at acquire time.
        table.jsonb('workspace').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.index(['status']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SandboxRegistryTableName);
}
