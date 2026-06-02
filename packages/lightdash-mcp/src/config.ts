import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Node 不会自动读 .env；与 packages/lightdash-mcp/.env.example 对齐
loadDotenv({ path: path.join(__dirname, '..', '.env') });

export type LightdashMcpEnvConfig = {
    baseUrl: string;
    apiKey: string | undefined;
    /** 未配置时须通过 set_project 或各工具可选 projectUuid 提供项目 */
    defaultProjectUuid: string | null;
    maxLimit: number;
    oauthEnabled: boolean;
    oauthIntrospectUrl: string;
    oauthRequiredScopes: string[];
    oauthResourceMetadataUrl: string;
};

export function loadConfigFromEnv(): LightdashMcpEnvConfig {
    const raw = process.env.LIGHTDASH_SITE_URL;
    const apiKey = process.env.LIGHTDASH_API_KEY;
    const projectRaw = process.env.LIGHTDASH_PROJECT_UUID?.trim() ?? '';
    const defaultProjectUuid =
        projectRaw.length > 0 ? projectRaw : null;
    if (!raw) {
        throw new Error(
            'LIGHTDASH_SITE_URL is required（请设置环境变量，或在服务启动目录的 .env 中配置，参考 .env.example）',
        );
    }
    const baseUrl = raw.replace(/\/$/, '');
    const maxLimitRaw = process.env.LIGHTDASH_MAX_LIMIT;
    const maxLimit =
        maxLimitRaw !== undefined &&
        Number.isFinite(Number(maxLimitRaw)) &&
        Number(maxLimitRaw) > 0
            ? Number(maxLimitRaw)
            : 5000;
    const oauthEnabled = (process.env.MCP_OAUTH_ENABLED ?? 'true') === 'true';
    const oauthIntrospectUrl =
        process.env.OAUTH_INTROSPECT_URL?.trim() ||
        `${baseUrl}/api/v1/oauth/introspect`;
    const oauthRequiredScopesRaw =
        process.env.OAUTH_REQUIRED_SCOPES?.trim() || 'mcp:read';
    const oauthRequiredScopes = oauthRequiredScopesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    const oauthResourceMetadataUrl =
        process.env.OAUTH_RESOURCE_METADATA_URL?.trim() ||
        `${baseUrl}/api/v1/oauth/.well-known/oauth-protected-resource`;
    return {
        baseUrl,
        apiKey,
        defaultProjectUuid,
        maxLimit,
        oauthEnabled,
        oauthIntrospectUrl,
        oauthRequiredScopes,
        oauthResourceMetadataUrl,
    };
}
