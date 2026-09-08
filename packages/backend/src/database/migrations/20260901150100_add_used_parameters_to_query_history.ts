import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';
const USED_PARAMETERS_COLUMN = 'used_parameters';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        QUERY_HISTORY_TABLE,
        USED_PARAMETERS_COLUMN,
    );
    if (hasColumn) {
        return;
    }

    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.jsonb(USED_PARAMETERS_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        QUERY_HISTORY_TABLE,
        USED_PARAMETERS_COLUMN,
    );
    if (!hasColumn) {
        return;
    }

    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn(USED_PARAMETERS_COLUMN);
    });
}
