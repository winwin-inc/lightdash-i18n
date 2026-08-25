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
    /** 进行中的业务请求（POST/DELETE）；>0 时禁止 TTL/LRU 淘汰 */
    activeRequestLeases: number;
    /** 进行中的 SSE 连接；不阻止 TTL/LRU，也不刷新业务活动时间 */
    activeSseLeases: number;
    state: 'pending' | 'active' | 'closed';
    closePromise: Promise<void> | null;
};

export type McpSessionRegistryOptions = {
    maxSessions: number;
    softSessionsPerOwner: number;
    maxSessionsPerOwner: number;
    lruMinIdleMs: number;
    sessionTtlMs: number;
    exploreCache: SharedExploreCache;
    createMcpServer?: typeof createLightdashMcpServer;
    createTransport?: (
        options: ConstructorParameters<
            typeof StreamableHTTPServerTransport
        >[0],
    ) => StreamableHTTPServerTransport;
};

export type McpSessionHealthStats = {
    activeSessions: number;
    pendingSessions: number;
    compatSessions: number;
    activeSseConnections: number;
    inFlightRequests: number;
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
    acquireRequestLease: (
        entry: McpSessionEntry,
        options?: { refreshBusinessActivity?: boolean },
    ) => () => void;
    pruneIdleSessions: () => Promise<number>;
    evictOldestSession: () => Promise<boolean>;
    getActiveCount: () => number;
    getPendingCount: () => number;
    getCompatCount: () => number;
    getOwnerActiveCount: (ownerKey: string) => number;
    getHealthStats: () => McpSessionHealthStats;
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
    const softSessionsPerOwner = Math.min(
        options.softSessionsPerOwner,
        options.maxSessionsPerOwner,
    );
    const maxSessionsPerOwner = Math.max(
        options.softSessionsPerOwner,
        options.maxSessionsPerOwner,
    );
    const lruMinIdleMs = options.lruMinIdleMs;

    const occupiedSlots = (): number =>
        sessions.size + compatByOwner.size + pendingEntries.size;

    const countOwnerStateful = (ownerKey: string): number => {
        let count = 0;
        for (const entry of sessions.values()) {
            if (entry.ownerKey === ownerKey) {
                count += 1;
            }
        }
        for (const entry of pendingEntries) {
            if (entry.kind === 'stateful' && entry.ownerKey === ownerKey) {
                count += 1;
            }
        }
        return count;
    };

    const isRequestBusy = (entry: McpSessionEntry): boolean =>
        entry.activeRequestLeases > 0;

    const isLruCandidate = (entry: McpSessionEntry, nowMs: number): boolean => {
        if (isRequestBusy(entry)) {
            return false;
        }
        return nowMs - entry.lastActivityAtMs >= lruMinIdleMs;
    };

    const logSessionEvent = (
        message: string,
        sessionId?: string | null,
        extra?: string,
    ): void => {
        const idPart =
            sessionId !== undefined && sessionId !== null
                ? ` id=${truncateSessionId(sessionId)}`
                : '';
        const extraPart = extra ? ` | ${extra}` : '';
        process.stderr.write(
            `[McpSession] ${message}${idPart}${extraPart} | active=${sessions.size} compat=${compatByOwner.size} pending=${pendingEntries.size}\n`,
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
            logSessionEvent('closed', sessionId, 'reason=client_delete');
        }
    };

    const removeSession = async (
        sessionId: string,
        reason: string,
    ): Promise<void> => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        const ownerKey = entry.ownerKey;
        sessions.delete(sessionId);
        const target = entry;
        target.state = 'closed';
        await closeEntry(target);
        logSessionEvent(
            `closed reason=${reason}`,
            sessionId,
            `ownerSessions=${countOwnerStateful(ownerKey)}`,
        );
    };

    const removeCompatSession = async (
        ownerKey: string,
        reason: string,
    ): Promise<void> => {
        const entry = compatByOwner.get(ownerKey);
        if (!entry) {
            return;
        }
        compatByOwner.delete(ownerKey);
        entry.state = 'closed';
        await closeEntry(entry);
        logSessionEvent(
            `compat closed owner=${ownerKey.slice(0, 8)}... reason=${reason}`,
        );
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
        logSessionEvent('abort_pending', target.sessionId);
    };

    const findOldestEvictable = (args?: {
        ownerKey?: string;
        includeCompat?: boolean;
    }):
        | { type: 'stateful'; id: string }
        | { type: 'compat'; ownerKey: string }
        | null => {
        const nowMs = Date.now();
        let oldestActivity = Number.POSITIVE_INFINITY;
        let oldestStateful: string | null = null;
        let oldestCompatOwner: string | null = null;
        const ownerFilter = args?.ownerKey;
        const includeCompat = args?.includeCompat !== false;

        for (const [sessionId, entry] of sessions) {
            if (ownerFilter && entry.ownerKey !== ownerFilter) {
                continue;
            }
            if (!isLruCandidate(entry, nowMs)) {
                continue;
            }
            if (entry.lastActivityAtMs < oldestActivity) {
                oldestActivity = entry.lastActivityAtMs;
                oldestStateful = sessionId;
                oldestCompatOwner = null;
            }
        }
        if (includeCompat && !ownerFilter) {
            for (const [ownerKey, entry] of compatByOwner) {
                if (!isLruCandidate(entry, nowMs)) {
                    continue;
                }
                if (entry.lastActivityAtMs < oldestActivity) {
                    oldestActivity = entry.lastActivityAtMs;
                    oldestStateful = null;
                    oldestCompatOwner = ownerKey;
                }
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

    const evictOldestSessionUnlocked = async (args?: {
        ownerKey?: string;
        includeCompat?: boolean;
        reason?: string;
    }): Promise<boolean> => {
        const oldest = findOldestEvictable({
            ownerKey: args?.ownerKey,
            includeCompat: args?.includeCompat,
        });
        if (!oldest) {
            return false;
        }
        const reason = args?.reason ?? 'lru';
        if (oldest.type === 'stateful') {
            await removeSession(oldest.id, reason);
            return true;
        }
        await removeCompatSession(oldest.ownerKey, reason);
        return true;
    };

    const prunePendingSessions = async (): Promise<number> => {
        const now = Date.now();
        const staleEntries = [...pendingEntries].filter(
            (entry) => now - entry.createdAtMs >= options.sessionTtlMs,
        );
        await Promise.all(
            staleEntries.map((entry) => abortPendingSessionUnlocked(entry)),
        );
        if (staleEntries.length > 0) {
            logSessionEvent(`prunedPending=${staleEntries.length} reason=ttl`);
        }
        return staleEntries.length;
    };

    const pruneIdleSessionsUnlocked = async (): Promise<number> => {
        const prunedPending = await prunePendingSessions();
        const now = Date.now();
        const expiredIds: string[] = [];
        for (const [sessionId, entry] of sessions) {
            if (
                !isRequestBusy(entry) &&
                now - entry.lastActivityAtMs >= options.sessionTtlMs
            ) {
                expiredIds.push(sessionId);
            }
        }
        await Promise.all(
            expiredIds.map((sessionId) => removeSession(sessionId, 'ttl')),
        );

        const expiredCompatOwners: string[] = [];
        for (const [ownerKey, entry] of compatByOwner) {
            if (
                !isRequestBusy(entry) &&
                now - entry.lastActivityAtMs >= options.sessionTtlMs
            ) {
                expiredCompatOwners.push(ownerKey);
            }
        }
        await Promise.all(
            expiredCompatOwners.map((ownerKey) =>
                removeCompatSession(ownerKey, 'ttl'),
            ),
        );

        const pruned =
            prunedPending + expiredIds.length + expiredCompatOwners.length;
        if (expiredIds.length > 0 || expiredCompatOwners.length > 0) {
            logSessionEvent(
                `pruned=${expiredIds.length} prunedCompat=${expiredCompatOwners.length} reason=ttl`,
            );
        }
        return pruned;
    };

    /**
     * 新 pending 已计入后：超过软上限尝试 owner-local LRU；
     * 超过硬上限且无候选则拒绝。
     */
    const ensureOwnerCapacity = async (ownerKey: string): Promise<void> => {
        if (countOwnerStateful(ownerKey) <= softSessionsPerOwner) {
            return;
        }

        await evictOldestSessionUnlocked({
            ownerKey,
            includeCompat: false,
            reason: 'owner_lru',
        });

        if (countOwnerStateful(ownerKey) > maxSessionsPerOwner) {
            logSessionEvent(
                `rejected: owner at hard cap (soft=${softSessionsPerOwner} hard=${maxSessionsPerOwner})`,
                null,
                `ownerSessions=${countOwnerStateful(ownerKey)}`,
            );
            throw new McpSessionCapacityError(maxSessionsPerOwner);
        }
    };

    const ensureCapacityAfterReservation = async (): Promise<void> => {
        await pruneIdleSessionsUnlocked();
        options.exploreCache.pruneExpired();

        while (occupiedSlots() > options.maxSessions) {
            const evicted = await evictOldestSessionUnlocked({
                includeCompat: true,
                reason: 'lru',
            });
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
                activeRequestLeases: 0,
                activeSseLeases: 0,
                state: 'pending',
                closePromise: null,
            };
            pendingEntries.add(entry);
            try {
                await ensureOwnerCapacity(ownerKey);
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
                        touchEntry(entry);
                        logSessionEvent(
                            'created',
                            sessionId,
                            `ownerSessions=${countOwnerStateful(ownerKey)}`,
                        );
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
                activeRequestLeases: 0,
                activeSseLeases: 0,
                state: 'pending',
                closePromise: null,
            };
            pendingEntries.add(entry);
            try {
                // compat 不占 soft/hard owner 额度，但仍计入全局容量
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
        lifecycleMutex.run(() => removeSession(sessionId, 'client_delete'));

    const evictOldestSession = async (): Promise<boolean> =>
        lifecycleMutex.run(() =>
            evictOldestSessionUnlocked({ includeCompat: true, reason: 'lru' }),
        );

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
        // 不在此处刷新业务活动时间：GET/SSE 查找不得续命
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
        const target = entry;
        target.activeSseLeases += 1;
    };

    const releaseSseLease = (sessionId: string): void => {
        const entry = sessions.get(sessionId);
        if (!entry) {
            return;
        }
        const target = entry;
        target.activeSseLeases = Math.max(0, target.activeSseLeases - 1);
    };

    const acquireRequestLease = (
        entry: McpSessionEntry,
        leaseOptions?: { refreshBusinessActivity?: boolean },
    ): (() => void) => {
        if (entry.state === 'closed') {
            return () => undefined;
        }
        const target = entry;
        target.activeRequestLeases += 1;
        if (leaseOptions?.refreshBusinessActivity !== false) {
            touchEntry(target);
        }
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            target.activeRequestLeases = Math.max(
                0,
                target.activeRequestLeases - 1,
            );
            // 释放时不刷新业务活动时间，避免短请求反复续命
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
        await Promise.all(
            ids.map((sessionId) => removeSession(sessionId, 'shutdown')),
        );

        const owners = [...compatByOwner.keys()];
        await Promise.all(
            owners.map((ownerKey) =>
                removeCompatSession(ownerKey, 'shutdown'),
            ),
        );
    };

    const closeAll = async (): Promise<void> =>
        lifecycleMutex.run(closeAllUnlocked);

    const getHealthStats = (): McpSessionHealthStats => {
        let activeSseConnections = 0;
        let inFlightRequests = 0;
        for (const entry of sessions.values()) {
            activeSseConnections += entry.activeSseLeases;
            inFlightRequests += entry.activeRequestLeases;
        }
        for (const entry of compatByOwner.values()) {
            activeSseConnections += entry.activeSseLeases;
            inFlightRequests += entry.activeRequestLeases;
        }
        for (const entry of pendingEntries) {
            inFlightRequests += entry.activeRequestLeases;
        }
        return {
            activeSessions: sessions.size,
            pendingSessions: pendingEntries.size,
            compatSessions: compatByOwner.size,
            activeSseConnections,
            inFlightRequests,
        };
    };

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
        getOwnerActiveCount: (ownerKey: string) =>
            countOwnerStateful(ownerKey),
        getHealthStats,
        closeAll,
    };
}
