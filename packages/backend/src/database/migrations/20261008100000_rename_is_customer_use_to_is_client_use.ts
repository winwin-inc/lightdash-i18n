import { Knex } from 'knex';

const projectsTable = 'projects';
const oldColumn = 'is_customer_use';
const newColumn = 'is_client_use';

export async function up(knex: Knex): Promise<void> {
    const hasOldColumn = await knex.schema.hasColumn(projectsTable, oldColumn);
    const hasNewColumn = await knex.schema.hasColumn(projectsTable, newColumn);

    if (hasOldColumn && !hasNewColumn) {
        await knex.schema.table(projectsTable, (tableBuilder) => {
            tableBuilder.renameColumn(oldColumn, newColumn);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasOldColumn = await knex.schema.hasColumn(projectsTable, oldColumn);
    const hasNewColumn = await knex.schema.hasColumn(projectsTable, newColumn);

    if (hasNewColumn && !hasOldColumn) {
        await knex.schema.table(projectsTable, (tableBuilder) => {
            tableBuilder.renameColumn(newColumn, oldColumn);
        });
    }
}
