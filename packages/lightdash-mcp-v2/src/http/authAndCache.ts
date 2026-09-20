import type express from 'express';
import {
    MAX_USER_ATTRIBUTES_HEADER_CHARS,
} from '../lib/requestContext';

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
