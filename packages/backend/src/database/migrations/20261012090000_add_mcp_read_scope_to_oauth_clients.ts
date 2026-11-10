import { Knex } from 'knex';

/**
 * OAuth clients registered before MCP scope enforcement could have been
 * registered without any `mcp:` scope. Adding `mcp:read` keeps those clients
 * usable with the MCP server.
 */
export async function up(knex: Knex): Promise<void> {
    // NOTE: do NOT use `scopes || 'mcp:read'` — with an untyped string literal
    // PostgreSQL resolves `||` as array concatenation (anyarray || anyarray)
    // and fails parsing 'mcp:read' as an array literal
    // ("malformed array literal"). array_append keeps it an element append.
    await knex.raw(`
        UPDATE oauth2_clients
        SET scopes = array_append(scopes, 'mcp:read')
        WHERE NOT ('mcp:read' = ANY(scopes));
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        UPDATE oauth2_clients
        SET scopes = array_remove(scopes, 'mcp:read')
        WHERE 'mcp:read' = ANY(scopes);
    `);
}
