import { Knex } from 'knex';

const projectsTable = 'projects';
const isCustomerUseColumn = 'is_customer_use';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(projectsTable, isCustomerUseColumn))) {
        await knex.schema.table(projectsTable, (tableBuilder) => {
            tableBuilder
                .boolean(isCustomerUseColumn)
                .notNullable()
                .defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(projectsTable, isCustomerUseColumn)) {
        await knex.schema.table(projectsTable, (tableBuilder) => {
            tableBuilder.dropColumn(isCustomerUseColumn);
        });
    }
}

