import { Knex } from 'knex';

const ProjectsTable = 'projects';
const ColumnName = 'table_groups';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(ProjectsTable, ColumnName);
    if (hasColumn) {
        return;
    }

    await knex.schema.alterTable(ProjectsTable, (table) => {
        table.jsonb(ColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(ProjectsTable, ColumnName);
    if (!hasColumn) {
        return;
    }

    await knex.schema.alterTable(ProjectsTable, (table) => {
        table.dropColumn(ColumnName);
    });
}
