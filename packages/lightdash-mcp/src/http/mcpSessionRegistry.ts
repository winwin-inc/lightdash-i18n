import { createHash, randomUUID } from 'node:crypto';
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
    ownerKey: string;
    transport: StreamableHTTPServerTransport;
    mcpServer: McpServer;
    createdAtMs: number;
    lastActivityAtMs: number;
    activeSseLeases: number;
    state: 'pending' | 'active' | 'closed';
    closePromise: Promise<void> | null;
};

export type McpSessionRegistryOptions = {
    maxSessions: number;
    sessionTtlMs: number;
    exploreCache: SharedExploreCache;
    createMcpServer?: typeof createLightdashMcpServer;
    createTransport?: (
        options: ConstructorParameters<
            typeof StreamableHTTPServerTransport
        >[0],
    ) => StreamableHTTPServerTransport;
};

export type McpSessionRegistry = {
    createPendingSession: (ownerKey: string) => Promise<McpSessionEntry>;
    abortPendingSession: (entry: McpSessionEntry) => Promise<void>;
    closeSession: (sessionId: string) => Promise<void>;
    getForOwner: (
        sessionId: string,
        ownerKey: string,
    ) => McpSessionEntry | undefined;
    getOwnerKeyForSession: (sessionId: string) => string | undefined;
    touch: (sessionId: string) => void;
    acquireSseLease: (sessionId: string) => void;
    releaseSseLease: (sessionId: string) => void;
    pruneIdleSessions: () => Promise<number>;
    evictOldestSession: () => Promise<boolean>;
    getActiveCount: () => number;
    getPendingCount: () => number;
    closeAll: () => Promise<void>;
};

function truncateSessionId(sessionId: string): string {
    return sessionId.length <= 8 ? sessionId : `${sessionId.slice(0, 8)}...`;
}

function createAsyncMutex() {
    let chain: Promise<void> = Promise.resolve();
    return {
        async run<T>(fn: () => Promise<T>): Promise<T> {
            let release: () => void = () => {};
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            const previous = chain;
            chain = previous.then(() => gate);
            await previous;
            try {
                return await fn();
            } finally {
                release();
            }
        },
    };
}

export function hashMcpSessionOwnerKey(
    apiKey: string | undefined,
    authSubject: string | undefined,
): string {
    if (authSubject && authSubject.length > 0) {
        return `oauth:${authSubject}`;
    }
    if (apiKey && apiKey.length > 0) {
        return createHash('sha256').update(apiKey, 'utf8').digest('hex');
    }
    return 'anonymous';
}

export function createMcpSessionRegistry(
    config: LightdashMcpEnvConfig,
    options: McpSessionRegistryOptions,
): McpSessionRegistry {
    const sessions = new Map<string, McpSessionEntry>();
    const pendingEntries = new Set<McpSessionEntry>();
    const lifecycleMutex = createAsyncMutex();
    const createServer =
        options.createMcpServer ?? createLightdashMcpServer;
    const createTransport =
        options.createTransport ??
        ((transportOptions) =>
            new StreamableHTTPServerTransport(transportOptions));

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
        const target = entry;
        if (target.closePromise) {
            await target.closePromise;
            return;
        }

        target.state = 'closed';
        target.closePromise = (async () => {
            if (target.mcpServer) {
                try {
                    await target.mcpServer.close();
                } catch {
                    // ignore close errors during eviction
                }
                return;
            }
            if (target.transport) {
                try {
                    await target.transport.close();
                } catch {
                    // ignore close errors during eviction
                }
            }
        })();
        await target.closePromise;
    };

    const unregisterSession = (
        sessionId: string,
        entry: McpSessionEntry,
    ): void => {
        if (sessions.get(sessionId) === entry) {
            sessions.delete(sessionId);
            const target = entry;
            target.state = 'closed';
            logSessionEvent('closed', sessionId);
        }
    };

    const removeSession = async (sessionId: string): Promise<void> => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        sessions.delete(sessionId);
        entry.state = 'closed';
        await closeEntry(entry);
    };

    const abortPendingSessionUnlocked = async (
        entry: McpSessionEntry,
    ): Promise<void> => {
        const target = entry;
        if (target.state !== 'pending') {
            return;
        }
        pendingEntries.delete(target);
        target.state = 'closed';
        await closeEntry(target);
    };

    const evictOldestSessionUnlocked = async (): Promise<boolean> => {
        let oldestId: string | null = null;
        let oldestActivity = Number.POSITIVE_INFINITY;
        for (const [sessionId, entry] of sessions) {
            if (
                entry.activeSseLeases === 0 &&
                entry.lastActivityAtMs < oldestActivity
            ) {
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

    const prunePendingSessions = async (): Promise<number> => {
        const now = Date.now();
        const staleEntries = [...pendingEntries].filter(
            (entry) => now - entry.createdAtMs >= options.sessionTtlMs,
        );
        await Promise.all(
            staleEntries.map((entry) =>
                abortPendingSessionUnlocked(entry),
            ),
        );
        if (staleEntries.length > 0) {
            logSessionEvent(`prunedPending=${staleEntries.length}`);
        }
        return staleEntries.length;
    };

    const pruneIdleSessionsUnlocked = async (): Promise<number> => {
        const prunedPending = await prunePendingSessions();
        const now = Date.now();
        const expiredIds: string[] = [];
        for (const [sessionId, entry] of sessions) {
            if (
                entry.activeSseLeases === 0 &&
                now - entry.lastActivityAtMs >= options.sessionTtlMs
            ) {
                expiredIds.push(sessionId);
            }
        }
        await Promise.all(
            expiredIds.map((sessionId) => removeSession(sessionId)),
        );
        if (expiredIds.length > 0) {
            logSessionEvent(`pruned=${expiredIds.length} evicted=0`);
        }
        return prunedPending + expiredIds.length;
    };

    const ensureCapacityAfterReservation = async (): Promise<void> => {
        await pruneIdleSessionsUnlocked();
        options.exploreCache.pruneExpired();

        const evictUntilWithinCapacity = async (): Promise<void> => {
            if (
                sessions.size + pendingEntries.size <=
                options.maxSessions
            ) {
                return;
            }
            const evicted = await evictOldestSessionUnlocked();
            if (evicted) {
                await evictUntilWithinCapacity();
            }
        };
        await evictUntilWithinCapacity();

        if (sessions.size + pendingEntries.size > options.maxSessions) {
            logSessionEvent(
                `rejected: at capacity (max=${options.maxSessions})`,
            );
            throw new McpSessionCapacityError(options.maxSessions);
        }
    };

    const createPendingSession = async (
        ownerKey: string,
    ): Promise<McpSessionEntry> =>
        lifecycleMutex.run(async () => {
            const entry: McpSessionEntry = {
                sessionId: null,
                ownerKey,
                transport:
                    undefined as unknown as StreamableHTTPServerTransport,
                mcpServer: undefined as unknown as McpServer,
                createdAtMs: Date.now(),
                lastActivityAtMs: Date.now(),
                activeSseLeases: 0,
                state: 'pending',
                closePromise: null,
            };
            pendingEntries.add(entry);
            try {
                await ensureCapacityAfterReservation();
            } catch (error) {
                pendingEntries.delete(entry);
                entry.state = 'closed';
                await closeEntry(entry);
                throw error;
            }

            try {
                const transport = createTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sessionId: string) => {
                        if (
                            entry.state !== 'pending' ||
                            !pendingEntries.has(entry)
                        ) {
                            throw new Error(
                                'MCP session initialization was superseded',
                            );
                        }
                        entry.sessionId = sessionId;
                        entry.state = 'active';
                        pendingEntries.delete(entry);
                        sessions.set(sessionId, entry);
                        logSessionEvent('created', sessionId);
                    },
                    onsessionclosed: async (sessionId: string) => {
                        unregisterSession(sessionId, entry);
                    },
                });

                const mcpServer = createServer(config, {
                    exploreCache: options.exploreCache,
                });
                entry.transport = transport;
                entry.mcpServer = mcpServer;
                await mcpServer.connect(transport);

                return entry;
            } catch (error) {
                pendingEntries.delete(entry);
                entry.state = 'closed';
                await closeEntry(entry);
                throw error;
            }
        });

    const abortPendingSession = async (
        entry: McpSessionEntry,
    ): Promise<void> =>
        lifecycleMutex.run(() => abortPendingSessionUnlocked(entry));

    const closeSession = async (sessionId: string): Promise<void> =>
        lifecycleMutex.run(() => removeSession(sessionId));

    const evictOldestSession = async (): Promise<boolean> =>
        lifecycleMutex.run(evictOldestSessionUnlocked);

    const pruneIdleSessions = async (): Promise<number> =>
        lifecycleMutex.run(pruneIdleSessionsUnlocked);

    const getForOwner = (
        sessionId: string,
        ownerKey: string,
    ): McpSessionEntry | undefined => {
        const entry = sessions.get(sessionId);
        if (!entry || entry.ownerKey !== ownerKey) {
            return undefined;
        }
        entry.lastActivityAtMs = Date.now();
        return entry;
    };

    const getOwnerKeyForSession = (
        sessionId: string,
    ): string | undefined => sessions.get(sessionId)?.ownerKey;

    const touch = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (entry) {
            entry.lastActivityAtMs = Date.now();
        }
    };

    const acquireSseLease = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        entry.activeSseLeases += 1;
        entry.lastActivityAtMs = Date.now();
    };

    const releaseSseLease = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        entry.activeSseLeases = Math.max(0, entry.activeSseLeases - 1);
        entry.lastActivityAtMs = Date.now();
    };

    const closeAllUnlocked = async (): Promise<void> => {
        const pending = [...pendingEntries];
        pendingEntries.clear();
        pending.forEach((entry) => {
            const target = entry;
            target.state = 'closed';
        });
        await Promise.all(pending.map((entry) => closeEntry(entry)));

        const ids = [...sessions.keys()];
        await Promise.all(ids.map((sessionId) => removeSession(sessionId)));
    };

    const closeAll = async (): Promise<void> =>
        lifecycleMutex.run(closeAllUnlocked);

    return {
        createPendingSession,
        abortPendingSession,
        closeSession,
        getForOwner,
        getOwnerKeyForSession,
        touch,
        acquireSseLease,
        releaseSseLease,
        pruneIdleSessions,
        evictOldestSession,
        getActiveCount: () => sessions.size,
        getPendingCount: () => pendingEntries.size,
        closeAll,
    };
}
