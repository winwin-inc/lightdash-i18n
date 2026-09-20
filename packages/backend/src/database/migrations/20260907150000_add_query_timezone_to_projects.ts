import { Knex } from 'knex';

const ProjectTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ProjectTableName))) return;

    const hasQueryTimezone = await knex.schema.hasColumn(
        ProjectTableName,
        'query_timezone',
    );
    if (!hasQueryTimezone) {
        await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
            tableBuilder.string('query_timezone').nullable();
        });
    }

    const hasFilterFlag = await knex.schema.hasColumn(
        ProjectTableName,
        'use_project_timezone_in_filters',
    );
    if (!hasFilterFlag) {
        await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
            tableBuilder
                .boolean('use_project_timezone_in_filters')
                .notNullable()
                .defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ProjectTableName))) return;

    if (
        await knex.schema.hasColumn(
            ProjectTableName,
            'use_project_timezone_in_filters',
        )
    ) {
        await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
            tableBuilder.dropColumn('use_project_timezone_in_filters');
        });
    }

    if (await knex.schema.hasColumn(ProjectTableName, 'query_timezone')) {
        await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
            tableBuilder.dropColumn('query_timezone');
        });
    }
}
