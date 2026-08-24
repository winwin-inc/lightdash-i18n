import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { LightdashMcpEnvConfig } from '../config';
import type { SharedExploreCache } from '../lib/sharedExploreCache';
import { createLightdashMcpServer } from '../mcp/createMcpServer';

export class McpSessionCapacityError extends Error {
    constructor(maxSessions: number) {
        super(`Too many active MCP sessions (max=${maxSessions})`);
        this.name = 'McpSessionCapacityError';
    }
}

export type McpSessionEntry = {
    sessionId: string | null;
    transport: StreamableHTTPServerTransport;
    mcpServer: McpServer;
    createdAtMs: number;
    lastActivityAtMs: number;
};

export type McpSessionRegistryOptions = {
    maxSessions: number;
    sessionTtlMs: number;
    exploreCache: SharedExploreCache;
};

export type McpSessionRegistry = {
    createPendingSession: () => Promise<McpSessionEntry>;
    abortPendingSession: (entry: McpSessionEntry) => Promise<void>;
    get: (sessionId: string) => McpSessionEntry | undefined;
    touch: (sessionId: string) => void;
    pruneIdleSessions: () => Promise<number>;
    evictOldestSession: () => Promise<boolean>;
    getActiveCount: () => number;
    closeAll: () => Promise<void>;
};

function truncateSessionId(sessionId: string): string {
    return sessionId.length <= 8 ? sessionId : `${sessionId.slice(0, 8)}...`;
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

export function createMcpSessionRegistry(
    config: LightdashMcpEnvConfig,
    options: McpSessionRegistryOptions,
): McpSessionRegistry {
    const sessions = new Map<string, McpSessionEntry>();
    const pendingEntries = new Set<McpSessionEntry>();

    const logSessionEvent = (
        message: string,
        sessionId?: string | null,
    ): void => {
        const idPart =
            sessionId !== undefined && sessionId !== null
                ? ` id=${truncateSessionId(sessionId)}`
                : '';
        process.stderr.write(
            `[McpSession] ${message}${idPart} | active=${sessions.size} pending=${pendingEntries.size}\n`,
        );
    };

    const closeEntry = async (entry: McpSessionEntry): Promise<void> => {
        try {
            await entry.mcpServer.close();
        } catch {
            // ignore close errors during eviction
        }
        try {
            await entry.transport.close();
        } catch {
            // ignore close errors during eviction
        }
    };

    const removeSession = async (sessionId: string): Promise<void> => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        sessions.delete(sessionId);
        await closeEntry(entry);
    };

    const evictOldestSession = async (): Promise<boolean> => {
        let oldestId: string | null = null;
        let oldestActivity = Number.POSITIVE_INFINITY;
        for (const [sessionId, entry] of sessions) {
            if (entry.lastActivityAtMs < oldestActivity) {
                oldestActivity = entry.lastActivityAtMs;
                oldestId = sessionId;
            }
        }
        if (oldestId === null) {
            return false;
        }
        await removeSession(oldestId);
        logSessionEvent('evicted LRU session', oldestId);
        return true;
    };

    const pruneIdleSessions = async (): Promise<number> => {
        const now = Date.now();
        const expiredIds: string[] = [];
        for (const [sessionId, entry] of sessions) {
            if (now - entry.lastActivityAtMs >= options.sessionTtlMs) {
                expiredIds.push(sessionId);
            }
        }
        for (const sessionId of expiredIds) {
            await removeSession(sessionId);
        }
        if (expiredIds.length > 0) {
            logSessionEvent(`pruned=${expiredIds.length} evicted=0`);
        }
        return expiredIds.length;
    };

    const ensureCapacity = async (): Promise<void> => {
        await pruneIdleSessions();
        options.exploreCache.pruneExpired();

        while (sessions.size + pendingEntries.size >= options.maxSessions) {
            const evicted = await evictOldestSession();
            if (!evicted) {
                break;
            }
        }

        if (sessions.size + pendingEntries.size >= options.maxSessions) {
            logSessionEvent(
                `rejected: at capacity (max=${options.maxSessions})`,
            );
            throw new McpSessionCapacityError(options.maxSessions);
        }
    };

    const createPendingSession = async (): Promise<McpSessionEntry> => {
        await ensureCapacity();

        const entry: McpSessionEntry = {
            sessionId: null,
            transport: undefined as unknown as StreamableHTTPServerTransport,
            mcpServer: undefined as unknown as McpServer,
            createdAtMs: Date.now(),
            lastActivityAtMs: Date.now(),
        };
        pendingEntries.add(entry);

        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (sessionId: string) => {
                    entry.sessionId = sessionId;
                    pendingEntries.delete(entry);
                    sessions.set(sessionId, entry);
                    logSessionEvent('created', sessionId);
                },
                onsessionclosed: async (sessionId: string) => {
                    await removeSession(sessionId);
                    logSessionEvent('closed', sessionId);
                },
            });

            const mcpServer = createLightdashMcpServer(config, {
                exploreCache: options.exploreCache,
            });
            await mcpServer.connect(transport);

            entry.transport = transport;
            entry.mcpServer = mcpServer;
            return entry;
        } catch (error) {
            pendingEntries.delete(entry);
            throw error;
        }
    };

    const abortPendingSession = async (
        entry: McpSessionEntry,
    ): Promise<void> => {
        if (entry.sessionId !== null) {
            return;
        }
        pendingEntries.delete(entry);
        await closeEntry(entry);
    };

    const get = (sessionId: string): McpSessionEntry | undefined => {
        const entry = sessions.get(sessionId);
        if (entry) {
            entry.lastActivityAtMs = Date.now();
        }
        return entry;
    };

    const touch = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (entry) {
            entry.lastActivityAtMs = Date.now();
        }
    };

    const closeAll = async (): Promise<void> => {
        const ids = [...sessions.keys()];
        for (const sessionId of ids) {
            await removeSession(sessionId);
        }
        pendingEntries.clear();
    };

    return {
        createPendingSession,
        abortPendingSession,
        get,
        touch,
        pruneIdleSessions,
        evictOldestSession,
        getActiveCount: () => sessions.size,
        closeAll,
    };
}
