import { maskApiKey } from './authAndCache';
import { writeStderrLog } from '../lib/stderrLog';

export type TokenExchangeResult = {
    accessToken: string;
    tokenType: string;
    expiresAt: string;
    userUuid: string;
    email: string;
};

export type PatCacheEntry = {
    accessToken: string;
    expiresAtMs: number;
    userUuid: string;
    email: string;
};

/** Refresh PAT this many ms before backend expiresAt. */
export const PAT_CACHE_SKEW_MS = 60_000;

export function createPatCache(): Map<string, PatCacheEntry> {
    return new Map<string, PatCacheEntry>();
}

function cacheKey(email: string): string {
    return email.trim().toLowerCase();
}

export function isPatCacheValid(
    entry: PatCacheEntry | undefined,
    nowMs: number = Date.now(),
): entry is PatCacheEntry {
    if (!entry) {
        return false;
    }
    return entry.expiresAtMs - PAT_CACHE_SKEW_MS > nowMs;
}

export function invalidatePatCache(
    cache: Map<string, PatCacheEntry>,
    email: string,
): void {
    cache.delete(cacheKey(email));
}

type TokenExchangeApiResponse = {
    status?: string;
    results?: {
        accessToken?: string;
        tokenType?: string;
        expiresAt?: string;
        userUuid?: string;
        email?: string;
    };
    accessToken?: string;
    tokenType?: string;
    expiresAt?: string;
    userUuid?: string;
    email?: string;
};

function parseExchangePayload(
    payload: TokenExchangeApiResponse,
): TokenExchangeResult {
    const results = payload.results ?? payload;
    const accessToken = results.accessToken;
    const expiresAt = results.expiresAt;
    const userUuid = results.userUuid;
    const email = results.email;
    if (
        typeof accessToken !== 'string' ||
        accessToken.length === 0 ||
        typeof expiresAt !== 'string' ||
        typeof userUuid !== 'string' ||
        typeof email !== 'string'
    ) {
        throw new Error('token-exchange response missing required fields');
    }
    return {
        accessToken,
        tokenType:
            typeof results.tokenType === 'string'
                ? results.tokenType
                : 'ApiKey',
        expiresAt,
        userUuid,
        email,
    };
}

/**
 * Call Lightdash backend to mint a short-lived PAT for the given email.
 * Does not use cache; callers should check cache first.
 */
export async function exchangeEmailForPat(options: {
    baseUrl: string;
    tokenExchangeSecret: string;
    email: string;
}): Promise<TokenExchangeResult> {
    const url = `${options.baseUrl.replace(/\/$/, '')}/api/v1/mcp/token-exchange`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${options.tokenExchangeSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: options.email }),
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : String(error);
        const wrapped = `token-exchange failed with network error: ${message}`;
        writeStderrLog(
            `[TokenExchange] failed | ${options.email} | network | ${message}`,
            'warn',
        );
        throw new Error(wrapped);
    }

    if (response.status === 404) {
        writeStderrLog(
            `[TokenExchange] failed | ${options.email} | user not found`,
            'warn',
        );
        throw new Error(
            `token-exchange user not found for email: ${options.email}`,
        );
    }
    if (response.status === 401 || response.status === 403) {
        writeStderrLog(
            `[TokenExchange] failed | ${options.email} | unauthorized (${response.status})`,
            'warn',
        );
        throw new Error(
            `token-exchange unauthorized (${response.status}) — check LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET`,
        );
    }
    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        writeStderrLog(
            `[TokenExchange] failed | ${options.email} | ${response.status} | ${bodyText}`,
            'warn',
        );
        throw new Error(
            `token-exchange failed with ${response.status}: ${bodyText}`,
        );
    }

    const payload = (await response.json()) as TokenExchangeApiResponse;
    return parseExchangePayload(payload);
}

/**
 * Return a cached PAT or silently re-exchange when expired / missing.
 */
export async function getOrExchangePat(options: {
    cache: Map<string, PatCacheEntry>;
    baseUrl: string;
    tokenExchangeSecret: string;
    email: string;
    forceRefresh?: boolean;
}): Promise<PatCacheEntry> {
    const key = cacheKey(options.email);
    const now = Date.now();
    if (!options.forceRefresh) {
        const cached = options.cache.get(key);
        if (isPatCacheValid(cached, now)) {
            return cached;
        }
    }

    writeStderrLog(
        `[TokenExchange] exchanging PAT for ${options.email}${
            options.forceRefresh ? ' (force)' : ''
        }`,
        'debug',
    );

    const exchanged = await exchangeEmailForPat({
        baseUrl: options.baseUrl,
        tokenExchangeSecret: options.tokenExchangeSecret,
        email: options.email,
    });
    const expiresAtMs = Date.parse(exchanged.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
        writeStderrLog(
            `[TokenExchange] failed | ${options.email} | invalid expiresAt=${exchanged.expiresAt}`,
            'warn',
        );
        throw new Error(
            `token-exchange returned invalid expiresAt: ${exchanged.expiresAt}`,
        );
    }

    const entry: PatCacheEntry = {
        accessToken: exchanged.accessToken,
        expiresAtMs,
        userUuid: exchanged.userUuid,
        email: exchanged.email,
    };
    options.cache.set(key, entry);
    writeStderrLog(
        `[TokenExchange] ok | ${entry.email} | userUuid=${entry.userUuid} | key=${maskApiKey(entry.accessToken)} | expiresAt=${exchanged.expiresAt}${
            options.forceRefresh ? ' | force' : ''
        }`,
        'info',
    );
    return entry;
}
