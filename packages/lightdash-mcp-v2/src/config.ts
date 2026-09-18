import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Node 不会自动读 .env；仅本地兜底，不覆盖已有 process.env（K8s envFrom 优先）
loadDotenv({
    path: path.join(__dirname, '..', '.env'),
    override: false,
});

/** 启动必填环境变量（K8s ConfigMap / Secret 或本地 .env） */
export const REQUIRED_ENV_KEYS = [
    'LIGHTDASH_SITE_URL',
    'KEYCLOAK_REALM_URL',
    'MCP_PUBLIC_URL',
    'LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET',
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

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

function envPresent(name: string): boolean {
    const value = process.env[name]?.trim();
    return value !== undefined && value.length > 0;
}

/** 返回 trim 后为空或未设置的必填环境变量名（只看 process.env） */
export function listMissingRequiredEnv(): string[] {
    return REQUIRED_ENV_KEYS.filter((name) => !envPresent(name));
}

/**
 * 启动诊断：各必填键 SET / MISSING（密钥不打印值）。
 * 返回与 listMissingRequiredEnv 相同的缺失列表。
 */
export function describeRequiredEnvPresence(): {
    missing: string[];
    lines: string[];
} {
    const lines: string[] = [];
    const missing: string[] = [];
    for (const name of REQUIRED_ENV_KEYS) {
        if (envPresent(name)) {
            lines.push(`${name}=SET`);
        } else {
            lines.push(`${name}=MISSING`);
            missing.push(name);
        }
    }
    return { missing, lines };
}

/** 缺配置时给运维的中文提示（K8s 优先，本地才提 .env） */
export function missingEnvHint(missing: string[]): string {
    return (
        `缺少必填环境变量: ${missing.join(', ')}。` +
        `K8s 请检查 ConfigMap lightdash-mcp-config 与 Secret lightdash-mcp-secret（envFrom），` +
        `改完后需重建 Pod；本地开发可参考 .env.example。`
    );
}

/** 缺配置时 /health、/mcp 的 503 body（供路由与单测共用） */
export function buildDegradedServiceBody(missingEnv: string[]): {
    ok: false;
    ready: false;
    package: '@lightdash/mcp-v2';
    missingEnv: string[];
    hint: string;
} {
    return {
        ok: false,
        ready: false,
        package: '@lightdash/mcp-v2',
        missingEnv,
        hint: missingEnvHint(missingEnv),
    };
}

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(
            `${name} 未注入（环境变量为空或不存在）。` +
                `K8s：检查 ConfigMap/Secret 是否 apply 且 Pod envFrom 已挂载；` +
                `本地：在 .env 中配置，参见 .env.example`,
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
        process.env.MCP_OAUTH_AUDIENCE?.trim() || `${mcpPublicUrl}/mcp`;
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
