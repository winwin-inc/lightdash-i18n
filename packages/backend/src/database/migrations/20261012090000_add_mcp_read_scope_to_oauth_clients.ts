import { Knex } from 'knex';

/**
 * OAuth clients registered before MCP scope enforcement could have been
 * registered without any `mcp:` scope. Adding `mcp:read` keeps those clients
 * usable with the MCP server.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        UPDATE oauth2_clients
        SET scopes = scopes || 'mcp:read'
        WHERE NOT ('mcp:read' = ANY(scopes));
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        UPDATE oauth2_clients
        SET scopes = ARRAY(
            SELECT unnest(scopes) EXCEPT SELECT unnest(ARRAY['mcp:read'])
        )
        WHERE 'mcp:read' = ANY(scopes);
    `);
}
