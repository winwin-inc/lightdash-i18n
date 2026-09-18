import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Node 不会自动读 .env；与 packages/lightdash-mcp-v2/.env.example 对齐
loadDotenv({ path: path.join(__dirname, '..', '.env') });

export type LightdashMcpEnvConfig = {
    baseUrl: string;
    /** 未配置时须在各工具可选 projectUuid 参数中提供项目 */
    defaultProjectUuid: string | null;
    maxLimit: number;
    /** Keycloak realm 根 URL，如 https://keycloak.example/realms/mcp */
    keycloakRealmUrl: string;
    /** MCP 对外根 URL（audience / resource），如 http://localhost:3333 */
    mcpPublicUrl: string;
    /** JWT aud；默认 MCP_PUBLIC_URL 或 {MCP_PUBLIC_URL}/mcp */
    oauthAudience: string;
    oauthRequiredScopes: string[];
    /** 调后端换票的共享密钥 */
    tokenExchangeSecret: string;
};

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(
            `${name} is required（请设置环境变量，或在服务启动目录的 .env 中配置，参见 .env.example）`,
        );
    }
    return value;
}

export function loadConfigFromEnv(): LightdashMcpEnvConfig {
    const raw = requireEnv('LIGHTDASH_SITE_URL');
    const baseUrl = raw.replace(/\/$/, '');
    const projectRaw = process.env.LIGHTDASH_PROJECT_UUID?.trim() ?? '';
    const defaultProjectUuid = projectRaw.length > 0 ? projectRaw : null;
    const maxLimitRaw = process.env.LIGHTDASH_MAX_LIMIT;
    const maxLimit =
        maxLimitRaw !== undefined &&
        Number.isFinite(Number(maxLimitRaw)) &&
        Number(maxLimitRaw) > 0
            ? Number(maxLimitRaw)
            : 5000;

    const keycloakRealmUrl = requireEnv('KEYCLOAK_REALM_URL').replace(
        /\/$/,
        '',
    );
    const mcpPublicUrl = requireEnv('MCP_PUBLIC_URL').replace(/\/$/, '');
    const oauthAudience =
        process.env.MCP_OAUTH_AUDIENCE?.trim() ||
        `${mcpPublicUrl}/mcp`;
    const oauthRequiredScopesRaw =
        process.env.OAUTH_REQUIRED_SCOPES?.trim() || 'openid,mcp:read';
    const oauthRequiredScopes = oauthRequiredScopesRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    const tokenExchangeSecret = requireEnv(
        'LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET',
    );

    return {
        baseUrl,
        defaultProjectUuid,
        maxLimit,
        keycloakRealmUrl,
        mcpPublicUrl,
        oauthAudience,
        oauthRequiredScopes,
        tokenExchangeSecret,
    };
}
