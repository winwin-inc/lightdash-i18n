import {
    assertUnreachable,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { type Dialect } from '@lightdash/formula';

/**
 * Map a warehouse adapter to a formula dialect.
 * Fork WarehouseTypes / SupportedDbtAdapter do not include athena/duckdb,
 * so those dialects are intentionally omitted here.
 */
export const mapAdapterToFormulaDialect = (
    adapter: SupportedDbtAdapter,
): Dialect => {
    switch (adapter) {
        case SupportedDbtAdapter.POSTGRES:
            return 'postgres';
        case SupportedDbtAdapter.REDSHIFT:
            return 'redshift';
        case SupportedDbtAdapter.BIGQUERY:
            return 'bigquery';
        case SupportedDbtAdapter.SNOWFLAKE:
            return 'snowflake';
        case SupportedDbtAdapter.DATABRICKS:
            return 'databricks';
        case SupportedDbtAdapter.CLICKHOUSE:
            return 'clickhouse';
        case SupportedDbtAdapter.TRINO:
            return 'trino';
        default:
            return assertUnreachable(adapter, `Unknown adapter: ${adapter}`);
    }
};
