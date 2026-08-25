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
    kind: 'stateful' | 'compat';
    sessionId: string | null;
    ownerKey: string;
    transport: StreamableHTTPServerTransport;
    mcpServer: McpServer;
    createdAtMs: number;
    lastActivityAtMs: number;
    /** Combined SSE + in-flight POST request leases; blocks TTL/LRU eviction. */
    activeLeases: number;
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
    getOrCreateCompatSession: (ownerKey: string) => Promise<McpSessionEntry>;
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
    acquireRequestLease: (entry: McpSessionEntry) => () => void;
    pruneIdleSessions: () => Promise<number>;
    evictOldestSession: () => Promise<boolean>;
    getActiveCount: () => number;
    getPendingCount: () => number;
    getCompatCount: () => number;
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

function touchEntry(entry: McpSessionEntry): void {
    const target = entry;
    target.lastActivityAtMs = Date.now();
}

function acquireLease(entry: McpSessionEntry): void {
    const target = entry;
    target.activeLeases += 1;
    touchEntry(target);
}

function releaseLease(entry: McpSessionEntry): void {
    const target = entry;
    target.activeLeases = Math.max(0, target.activeLeases - 1);
    touchEntry(target);
}

export function createMcpSessionRegistry(
    config: LightdashMcpEnvConfig,
    options: McpSessionRegistryOptions,
): McpSessionRegistry {
    const sessions = new Map<string, McpSessionEntry>();
    const compatByOwner = new Map<string, McpSessionEntry>();
    const pendingEntries = new Set<McpSessionEntry>();
    const lifecycleMutex = createAsyncMutex();
    const createServer =
        options.createMcpServer ?? createLightdashMcpServer;
    const createTransport =
        options.createTransport ??
        ((transportOptions) =>
            new StreamableHTTPServerTransport(transportOptions));

    const occupiedSlots = (): number =>
        sessions.size + compatByOwner.size + pendingEntries.size;

    const logSessionEvent = (
        message: string,
        sessionId?: string | null,
    ): void => {
        const idPart =
            sessionId !== undefined && sessionId !== null
                ? ` id=${truncateSessionId(sessionId)}`
                : '';
        process.stderr.write(
            `[McpSession] ${message}${idPart} | active=${sessions.size} compat=${compatByOwner.size} pending=${pendingEntries.size}\n`,
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

    const removeCompatSession = async (ownerKey: string): Promise<void> => {
        const entry = compatByOwner.get(ownerKey);
        if (!entry) {
            return;
        }
        compatByOwner.delete(ownerKey);
        entry.state = 'closed';
        await closeEntry(entry);
        logSessionEvent(`compat closed owner=${ownerKey.slice(0, 8)}...`);
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

    const findOldestEvictable = ():
        | { type: 'stateful'; id: string }
        | { type: 'compat'; ownerKey: string }
        | null => {
        let oldestActivity = Number.POSITIVE_INFINITY;
        let oldestStateful: string | null = null;
        let oldestCompatOwner: string | null = null;

        for (const [sessionId, entry] of sessions) {
            if (
                entry.activeLeases === 0 &&
                entry.lastActivityAtMs < oldestActivity
            ) {
                oldestActivity = entry.lastActivityAtMs;
                oldestStateful = sessionId;
                oldestCompatOwner = null;
            }
        }
        for (const [ownerKey, entry] of compatByOwner) {
            if (
                entry.activeLeases === 0 &&
                entry.lastActivityAtMs < oldestActivity
            ) {
                oldestActivity = entry.lastActivityAtMs;
                oldestStateful = null;
                oldestCompatOwner = ownerKey;
            }
        }

        if (oldestStateful !== null) {
            return { type: 'stateful', id: oldestStateful };
        }
        if (oldestCompatOwner !== null) {
            return { type: 'compat', ownerKey: oldestCompatOwner };
        }
        return null;
    };

    const evictOldestSessionUnlocked = async (): Promise<boolean> => {
        const oldest = findOldestEvictable();
        if (!oldest) {
            return false;
        }
        if (oldest.type === 'stateful') {
            await removeSession(oldest.id);
            logSessionEvent('evicted LRU session', oldest.id);
            return true;
        }
        await removeCompatSession(oldest.ownerKey);
        logSessionEvent('evicted LRU compat session');
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
                entry.activeLeases === 0 &&
                now - entry.lastActivityAtMs >= options.sessionTtlMs
            ) {
                expiredIds.push(sessionId);
            }
        }
        await Promise.all(
            expiredIds.map((sessionId) => removeSession(sessionId)),
        );

        const expiredCompatOwners: string[] = [];
        for (const [ownerKey, entry] of compatByOwner) {
            if (
                entry.activeLeases === 0 &&
                now - entry.lastActivityAtMs >= options.sessionTtlMs
            ) {
                expiredCompatOwners.push(ownerKey);
            }
        }
        await Promise.all(
            expiredCompatOwners.map((ownerKey) =>
                removeCompatSession(ownerKey),
            ),
        );

        const pruned =
            prunedPending + expiredIds.length + expiredCompatOwners.length;
        if (expiredIds.length > 0 || expiredCompatOwners.length > 0) {
            logSessionEvent(
                `pruned=${expiredIds.length} prunedCompat=${expiredCompatOwners.length}`,
            );
        }
        return pruned;
    };

    const ensureCapacityAfterReservation = async (): Promise<void> => {
        await pruneIdleSessionsUnlocked();
        options.exploreCache.pruneExpired();

        while (occupiedSlots() > options.maxSessions) {
            const evicted = await evictOldestSessionUnlocked();
            if (!evicted) {
                break;
            }
        }

        if (occupiedSlots() > options.maxSessions) {
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
                kind: 'stateful',
                sessionId: null,
                ownerKey,
                transport:
                    undefined as unknown as StreamableHTTPServerTransport,
                mcpServer: undefined as unknown as McpServer,
                createdAtMs: Date.now(),
                lastActivityAtMs: Date.now(),
                activeLeases: 0,
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

    const getOrCreateCompatSession = async (
        ownerKey: string,
    ): Promise<McpSessionEntry> =>
        lifecycleMutex.run(async () => {
            const existing = compatByOwner.get(ownerKey);
            if (existing && existing.state === 'active') {
                touchEntry(existing);
                return existing;
            }

            const entry: McpSessionEntry = {
                kind: 'compat',
                sessionId: null,
                ownerKey,
                transport:
                    undefined as unknown as StreamableHTTPServerTransport,
                mcpServer: undefined as unknown as McpServer,
                createdAtMs: Date.now(),
                lastActivityAtMs: Date.now(),
                activeLeases: 0,
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
                // Stateless transport (0.3.4-compatible): no Mcp-Session-Id required.
                const transport = createTransport({
                    sessionIdGenerator: undefined,
                });
                const mcpServer = createServer(config, {
                    exploreCache: options.exploreCache,
                });
                entry.transport = transport;
                entry.mcpServer = mcpServer;
                await mcpServer.connect(transport);

                pendingEntries.delete(entry);
                entry.state = 'active';
                compatByOwner.set(ownerKey, entry);
                logSessionEvent(
                    `compat created owner=${ownerKey.slice(0, 8)}...`,
                );
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
        touchEntry(entry);
        return entry;
    };

    const getOwnerKeyForSession = (
        sessionId: string,
    ): string | undefined => sessions.get(sessionId)?.ownerKey;

    const touch = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (entry) {
            touchEntry(entry);
        }
    };

    const acquireSseLease = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        acquireLease(entry);
    };

    const releaseSseLease = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        releaseLease(entry);
    };

    const acquireRequestLease = (entry: McpSessionEntry): (() => void) => {
        if (entry.state === 'closed') {
            return () => undefined;
        }
        acquireLease(entry);
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            releaseLease(entry);
        };
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

        const owners = [...compatByOwner.keys()];
        await Promise.all(
            owners.map((ownerKey) => removeCompatSession(ownerKey)),
        );
    };

    const closeAll = async (): Promise<void> =>
        lifecycleMutex.run(closeAllUnlocked);

    return {
        createPendingSession,
        getOrCreateCompatSession,
        abortPendingSession,
        closeSession,
        getForOwner,
        getOwnerKeyForSession,
        touch,
        acquireSseLease,
        releaseSseLease,
        acquireRequestLease,
        pruneIdleSessions,
        evictOldestSession,
        getActiveCount: () => sessions.size,
        getPendingCount: () => pendingEntries.size,
        getCompatCount: () => compatByOwner.size,
        closeAll,
    };
}
