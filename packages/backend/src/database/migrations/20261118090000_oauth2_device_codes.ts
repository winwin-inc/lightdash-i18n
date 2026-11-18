import { Knex } from 'knex';

/**
 * RFC 8628 设备码流程的共享会话存储。
 *
 * msy-x 扫码登录此前把 device session 放在 oauthRouter 的进程内存 Map 里。
 * 生产环境 replicas:2 + headless Service，POST /api/v1/oauth/device（CLI）
 * 与 GET /api/v1/oauth/device/activate（手机扫码）会落到不同副本，手机端
 * 查不到 code（线上约 50% 报 Invalid Code）。CLI 与手机浏览器没有共同
 * cookie，粘滞会话无法解决，必须落到共享存储。
 *
 * `expires_at` 用 TIMESTAMPTZ：过期判定在 SQL 里与 `now()` 直接比较，
 * 无时区列在会话时区非 UTC 时会把过期时间算错（与仓库新表 useTz: true 一致）。
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS oauth2_device_codes (
            device_code VARCHAR(255) PRIMARY KEY,
            user_code VARCHAR(16) NOT NULL,
            client_id VARCHAR(255) NOT NULL REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
            status VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','authorized','denied','consumed')),
            user_id INTEGER NULL REFERENCES users(user_id) ON DELETE CASCADE,
            organization_uuid UUID NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS oauth2_device_codes_user_code_key
            ON oauth2_device_codes(user_code);
        CREATE INDEX IF NOT EXISTS oauth2_device_codes_expires_at_idx
            ON oauth2_device_codes(expires_at);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DROP INDEX IF EXISTS oauth2_device_codes_expires_at_idx;
        DROP INDEX IF EXISTS oauth2_device_codes_user_code_key;
        DROP TABLE IF EXISTS oauth2_device_codes CASCADE;
    `);
}
