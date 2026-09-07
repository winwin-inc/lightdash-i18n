import { Knex } from 'knex';

const SavedQueriesVersionAdditionalMetricsTableName =
    'saved_queries_version_additional_metrics';

/**
 * Period-over-Period (PoP) is stored as explicit additional metrics with
 * generation metadata — no separate period_over_period_config column.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            table.text('generation_type').nullable();
            table.text('base_metric_id').nullable();
            table.text('time_dimension_id').nullable();
            table.text('granularity').nullable();
            table.integer('period_offset').nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            table.dropColumn('generation_type');
            table.dropColumn('base_metric_id');
            table.dropColumn('time_dimension_id');
            table.dropColumn('granularity');
            table.dropColumn('period_offset');
        },
    );
}
