import { Knex } from 'knex';

const USER_DASHBOARD_CATEGORY_TABLE = 'user_dashboard_category';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(USER_DASHBOARD_CATEGORY_TABLE))) {
        await knex.schema.createTable(USER_DASHBOARD_CATEGORY_TABLE, (table) => {
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
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(USER_DASHBOARD_CATEGORY_TABLE);
}

