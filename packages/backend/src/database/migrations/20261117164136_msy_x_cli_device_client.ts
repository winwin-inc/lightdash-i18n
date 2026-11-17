import { Knex } from 'knex';

/**
 * 为 msy-x-cli 增加设备码流程（RFC 8628）专用公开客户端。
 *
 * msy-x 的浏览器 OAuth 走 DCR 动态注册（confidential client + 回环回调），
 * 无法用于无浏览器环境；设备码流程需要一个固定 client_id 的公开客户端。
 * scopes 仅 mcp:read：msy-x-cli 只调用 MCP 端点。
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        INSERT INTO oauth2_clients (client_id, client_secret, redirect_uris, grants, scopes, client_name)
        VALUES (
            'msy-x-cli',
            null,
            ARRAY[]::TEXT[],
            ARRAY['urn:ietf:params:oauth:grant-type:device_code'],
            ARRAY['mcp:read'],
            'MSY X CLI (device flow)'
        )
        ON CONFLICT (client_id) DO NOTHING;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DELETE FROM oauth2_clients WHERE client_id = 'msy-x-cli';
    `);
}
