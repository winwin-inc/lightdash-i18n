import { Knex } from 'knex';

const USER_DASHBOARD_CATEGORY_TABLE = 'user_dashboard_category';

const tableExists = async (knex: Knex) =>
    knex.schema.hasTable(USER_DASHBOARD_CATEGORY_TABLE);

export async function up(knex: Knex): Promise<void> {
    try {
        if (!(await tableExists(knex))) {
            await knex.schema.createTable(
                USER_DASHBOARD_CATEGORY_TABLE,
                (table) => {
                    table.string('id').primary();
                    table.integer('dashboard_id').notNullable();
                    table.integer('employee_id').notNullable();
                    table
                        .uuid('dashboard_uuid')
                        .notNullable()
                        .references('dashboard_uuid')
                        .inTable('dashboards')
                        .onDelete('CASCADE');
                    table
                        .uuid('space_uuid')
                        .notNullable()
                        .references('space_uuid')
                        .inTable('spaces')
                        .onDelete('CASCADE');
                    table.string('short_name').notNullable();
                    table.string('email').notNullable();
                    table.string('category_id').notNullable();
                    table.string('category').notNullable();
                    table
                        .timestamp('create_time', { useTz: false })
                        .notNullable()
                        .defaultTo(knex.fn.now());
                },
            );
        }
    } catch (error) {
        if ((error as { code?: string }).code !== '42P07') {
            console.error(
                'Failed to create user_dashboard_category table:',
                error,
            );
            return;
        }
        console.warn(
            'Table already exists, skipping creation for user_dashboard_category',
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(USER_DASHBOARD_CATEGORY_TABLE);
}
