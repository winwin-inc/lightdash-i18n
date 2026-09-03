// STUB
import { Knex } from 'knex';

export function applyContentSearchFilter(
    query: Knex.QueryBuilder,
    _search: string | undefined,
    _columns: string[],
): Knex.QueryBuilder {
    return query;
}

export function applyContentNameSearch(
    query: Knex.QueryBuilder,
    ..._args: unknown[]
): Knex.QueryBuilder {
    return query;
}

export function getContentSearchRankSql(
    ..._args: unknown[]
): Knex.Raw | null {
    return null;
}
