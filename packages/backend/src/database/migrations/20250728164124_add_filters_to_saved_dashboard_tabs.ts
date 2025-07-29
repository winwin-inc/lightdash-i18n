import { Knex } from 'knex';

const DASHBOARD_TABS_TABLE_NAME = 'dashboard_tabs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARD_TABS_TABLE_NAME, (table) => {
        table.jsonb('filters').notNullable().defaultTo({
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARD_TABS_TABLE_NAME, (table) => {
        table.dropColumn('filters');
    });
}
