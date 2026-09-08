import { Knex } from 'knex';

const SavedQueriesVersionAdditionalMetricsTableName =
    'saved_queries_version_additional_metrics';

const POP_COLUMNS = [
    'generation_type',
    'base_metric_id',
    'time_dimension_id',
    'granularity',
    'period_offset',
] as const;

/**
 * Period-over-Period (PoP) is stored as explicit additional metrics with
 * generation metadata — no separate period_over_period_config column.
 */
export async function up(knex: Knex): Promise<void> {
    const missing: string[] = [];
    for (const column of POP_COLUMNS) {
        // eslint-disable-next-line no-await-in-loop
        const exists = await knex.schema.hasColumn(
            SavedQueriesVersionAdditionalMetricsTableName,
            column,
        );
        if (!exists) missing.push(column);
    }
    if (missing.length === 0) return;

    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            if (missing.includes('generation_type')) {
                table.text('generation_type').nullable();
            }
            if (missing.includes('base_metric_id')) {
                table.text('base_metric_id').nullable();
            }
            if (missing.includes('time_dimension_id')) {
                table.text('time_dimension_id').nullable();
            }
            if (missing.includes('granularity')) {
                table.text('granularity').nullable();
            }
            if (missing.includes('period_offset')) {
                table.integer('period_offset').nullable();
            }
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            for (const column of POP_COLUMNS) {
                table.dropColumn(column);
            }
        },
    );
}
