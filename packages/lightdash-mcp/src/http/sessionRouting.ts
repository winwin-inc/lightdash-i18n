import type { McpSessionEntry } from './mcpSessionRegistry';

export type SessionMissingReason =
    | 'missing-header'
    | 'unknown-session'
    | 'owner-mismatch';

export type SessionRouteResult =
    | { kind: 'found'; entry: McpSessionEntry }
    | { kind: 'initialize' }
    | { kind: 'compat' }
    | { kind: 'missing'; reason: SessionMissingReason };

export type SessionRoutingRegistry = {
    getForOwner: (
        sessionId: string,
        ownerKey: string,
    ) => McpSessionEntry | undefined;
    getOwnerKeyForSession: (sessionId: string) => string | undefined;
};

export function getJsonRpcMethod(body: unknown): string | undefined {
    if (body === null || body === undefined) {
        return undefined;
    }
    if (Array.isArray(body)) {
        for (const item of body) {
            const method = getJsonRpcMethod(item);
            if (method) {
                return method;
            }
        }
        return undefined;
    }
    if (typeof body !== 'object') {
        return undefined;
    }
    const method = (body as { method?: unknown }).method;
    return typeof method === 'string' ? method : undefined;
}

export function isInitializeRequest(body: unknown): boolean {
    if (body === null || body === undefined) {
        return false;
    }
    if (Array.isArray(body)) {
        return body.some((item) => isInitializeRequest(item));
    }
    if (typeof body !== 'object') {
        return false;
    }
    return (body as { method?: string }).method === 'initialize';
}

export function parseMcpSessionIdHeader(
    header: string | string[] | undefined,
): string | undefined {
    if (typeof header === 'string' && header.length > 0) {
        return header;
    }
    if (Array.isArray(header)) {
        const last = header[header.length - 1];
        if (typeof last === 'string' && last.length > 0) {
            return last;
        }
    }
    return undefined;
}

export function resolveSessionRoute(
    registry: SessionRoutingRegistry,
    method: string,
    body: unknown,
    sessionIdHeader: string | undefined,
    ownerKey: string,
): SessionRouteResult {
    if (sessionIdHeader) {
        const entry = registry.getForOwner(sessionIdHeader, ownerKey);
        if (entry) {
            return { kind: 'found', entry };
        }
        if (method === 'POST' && isInitializeRequest(body)) {
            return { kind: 'initialize' };
        }
        const storedOwner = registry.getOwnerKeyForSession(sessionIdHeader);
        if (storedOwner !== undefined && storedOwner !== ownerKey) {
            return { kind: 'missing', reason: 'owner-mismatch' };
        }
        return { kind: 'missing', reason: 'unknown-session' };
    }
    if (method === 'POST' && isInitializeRequest(body)) {
        return { kind: 'initialize' };
    }
    // Compat path: legacy clients POST tools/call|list without Session-Id.
    // Do not open GET/SSE or DELETE without a session.
    if (method === 'POST') {
        return { kind: 'compat' };
    }
    return { kind: 'missing', reason: 'missing-header' };
}

export function formatSessionMissingReason(
    reason: SessionMissingReason,
): string {
    switch (reason) {
        case 'missing-header':
            return 'missing Mcp-Session-Id header';
        case 'unknown-session':
            return 'unknown or expired session id';
        case 'owner-mismatch':
            return 'session id belongs to another authenticated owner';
        default:
            return reason;
    }
}
