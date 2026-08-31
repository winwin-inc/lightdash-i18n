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
    /** 最大并发 MCP session 数（硬上限，防止 OOM；含 stateful + compat + pending） */
    maxSessions: number;
    /** 单 owner 标准 Session 软上限：超出后优先 LRU 空闲会话 */
    softSessionsPerOwner: number;
    /** 单 owner 标准 Session 硬上限：无可回收候选时拒绝新建 */
    maxSessionsPerOwner: number;
    /** LRU 候选最小空闲时间（毫秒）；短于此的会话视为刚活跃 */
    lruMinIdleMs: number;
    /** 无业务活动（POST/DELETE）后的 Session 回收 TTL（毫秒） */
    sessionTtlMs: number;
    /** 后台 prune 间隔（毫秒） */
    pruneIntervalMs: number;
};

function parsePositiveIntEnv(
    raw: string | undefined,
    fallback: number,
): number {
    if (raw === undefined) {
        return fallback;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        return fallback;
    }
    return n;
}

function parseNonNegativeIntEnv(
    raw: string | undefined,
    fallback: number,
): number {
    if (raw === undefined) {
        return fallback;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return fallback;
    }
    return n;
}

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
    const maxSessions = parsePositiveIntEnv(
        process.env.LIGHTDASH_MCP_MAX_SESSIONS,
        100,
    );
    const softSessionsPerOwner = parsePositiveIntEnv(
        process.env.LIGHTDASH_MCP_SOFT_SESSIONS_PER_OWNER,
        10,
    );
    const maxSessionsPerOwner = parsePositiveIntEnv(
        process.env.LIGHTDASH_MCP_MAX_SESSIONS_PER_OWNER,
        20,
    );
    const lruMinIdleMs = parseNonNegativeIntEnv(
        process.env.LIGHTDASH_MCP_LRU_MIN_IDLE_MS,
        300_000,
    );
    const sessionTtlMs = parsePositiveIntEnv(
        process.env.LIGHTDASH_MCP_SESSION_TTL_MS,
        900_000,
    );
    const pruneIntervalMs = parsePositiveIntEnv(
        process.env.LIGHTDASH_MCP_PRUNE_INTERVAL_MS,
        300_000,
    );
    return {
        baseUrl,
        apiKey,
        defaultProjectUuid,
        maxLimit,
        oauthEnabled,
        oauthIntrospectUrl,
        oauthRequiredScopes,
        oauthResourceMetadataUrl,
        maxSessions,
        softSessionsPerOwner: Math.min(softSessionsPerOwner, maxSessionsPerOwner),
        maxSessionsPerOwner: Math.max(softSessionsPerOwner, maxSessionsPerOwner),
        lruMinIdleMs,
        sessionTtlMs,
        pruneIntervalMs,
    };
}
