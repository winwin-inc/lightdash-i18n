import { Knex } from 'knex';

const TABLE_NAME = 'saved_queries_version_table_calculations';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(TABLE_NAME, 'total_mode');
    if (hasColumn) return;

    await knex.schema.alterTable(TABLE_NAME, (tableBuilder) => {
        tableBuilder.text('total_mode').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(TABLE_NAME, 'total_mode');
    if (!hasColumn) return;

    await knex.schema.alterTable(TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('total_mode');
    });
}
