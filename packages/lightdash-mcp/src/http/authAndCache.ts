import type express from 'express';
import {
    MAX_USER_ATTRIBUTES_HEADER_CHARS,
} from '../lib/requestContext';

export type AuthCacheEntry = {
    email: string;
    expiresAtMs: number;
};

export type OauthCacheEntry = {
    subject: string;
    scopes: string[];
    expiresAtMs: number;
};

export const AUTH_CACHE_TTL_MS = 90_000;

export function createAuthCache(): Map<string, AuthCacheEntry> {
    return new Map<string, AuthCacheEntry>();
}

export function createOauthCache(): Map<string, OauthCacheEntry> {
    return new Map<string, OauthCacheEntry>();
}

/**
 * Accept X-Lightdash-User-Attributes only when non-empty, under size cap, and
 * valid JSON (any JSON value). Malformed or overlong values are dropped.
 */
export function parseUserAttributesHeader(
    req: express.Request,
): string | undefined {
    const raw = req.headers['x-lightdash-user-attributes'];
    if (typeof raw !== 'string' || raw.length === 0) {
        return undefined;
    }
    if (raw.length > MAX_USER_ATTRIBUTES_HEADER_CHARS) {
        return undefined;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    try {
        JSON.parse(trimmed);
    } catch {
        return undefined;
    }
    return raw;
}

export function parseApiKeyFromRequest(
    req: express.Request,
): string | undefined {
    const xApiKey = req.headers['x-api-key'];
    if (typeof xApiKey === 'string' && xApiKey.length > 0) {
        return xApiKey;
    }
    const auth = req.headers.authorization;
    if (typeof auth === 'string') {
        const m = auth.match(/^ApiKey\s+(.+)$/i);
        if (m && m[1]) return m[1].trim();
    }
    return undefined;
}

export function parseBearerTokenFromRequest(
    req: express.Request,
): string | undefined {
    const auth = req.headers.authorization;
    if (typeof auth !== 'string') return undefined;
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m || !m[1]) return undefined;
    return m[1].trim();
}

export function maskApiKey(key: string | undefined): string {
    if (!key || key.length <= 3) return '***';
    return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

export function resolveClientIp(req: express.Request): string {
    const xfwd = req.headers['x-forwarded-for'];
    if (typeof xfwd === 'string' && xfwd.length > 0) {
        return xfwd.split(',')[0]?.trim() || req.ip || '-';
    }
    return req.ip || '-';
}

function readEmailFromUserResponse(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown';
    const p = payload as {
        results?: {
            email?: string;
            user?: { email?: string };
        };
    };
    return (
        p.results?.email ??
        p.results?.user?.email ??
        'unknown'
    );
}

type IntrospectResponse = {
    active?: boolean;
    scope?: string;
    sub?: string;
    username?: string;
};

export async function validateOauthToken(
    oauthCache: Map<string, OauthCacheEntry>,
    options: {
        introspectUrl: string;
        introspectApiKey: string | undefined;
        token: string;
        requiredScopes: string[];
    },
): Promise<{ subject: string; scopes: string[] }> {
    const now = Date.now();
    const cached = oauthCache.get(options.token);
    if (cached && cached.expiresAtMs > now) {
        return {
            subject: cached.subject,
            scopes: cached.scopes,
        };
    }
    if (!options.introspectApiKey) {
        throw new Error(
            'OAuth introspect requires LIGHTDASH_API_KEY',
        );
    }
    let response: Response;
    try {
        response = await fetch(options.introspectUrl, {
            method: 'POST',
            headers: {
                Authorization: `ApiKey ${options.introspectApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: options.token }),
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`OAuth introspect failed with network error: ${msg}`);
    }
    if (!response.ok) {
        throw new Error(
            `OAuth introspect failed with ${response.status} at ${options.introspectUrl}`,
        );
    }
    const payload = (await response.json()) as IntrospectResponse;
    if (!payload.active) {
        throw new Error('OAuth token is inactive');
    }
    const scopes = (payload.scope ?? '')
        .split(' ')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    const missingScopes = options.requiredScopes.filter(
        (requiredScope) => !scopes.includes(requiredScope),
    );
    if (missingScopes.length > 0) {
        throw new Error(
            `OAuth token missing required scopes: ${missingScopes.join(', ')}`,
        );
    }
    const subject = payload.sub ?? payload.username ?? 'oauth-user';
    oauthCache.set(options.token, {
        subject,
        scopes,
        expiresAtMs: now + AUTH_CACHE_TTL_MS,
    });
    return { subject, scopes };
}

export async function validateApiKeyAndGetEmail(
    authCache: Map<string, AuthCacheEntry>,
    baseUrl: string,
    apiKey: string,
    maskedKey: string,
): Promise<string> {
    const now = Date.now();
    const cached = authCache.get(apiKey);
    if (cached && cached.expiresAtMs > now) {
        const remainSec = Math.max(0, Math.floor((cached.expiresAtMs - now) / 1000));
        process.stderr.write(
            `[ApiAuth] ${maskedKey} 缓存命中 -> 有效（剩余 ${remainSec}s） | ${cached.email}\n`,
        );
        return cached.email;
    }

    const response = await fetch(`${baseUrl}/api/v1/user`, {
        method: 'GET',
        headers: {
            Authorization: `ApiKey ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        process.stderr.write(
            `[ApiAuth] ${maskedKey} 校验失败 -> ${response.status}\n`,
        );
        throw new Error(`Lightdash API ${response.status}: Failed to authorize user`);
    }
    const body = (await response.json()) as unknown;
    const email = readEmailFromUserResponse(body);
    authCache.set(apiKey, {
        email,
        expiresAtMs: now + AUTH_CACHE_TTL_MS,
    });
    process.stderr.write(`[ApiAuth] ${maskedKey} 校验通过 -> ${email}\n`);
    return email;
}
