import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';
import type { LightdashMcpEnvConfig } from '../config';
import {
    createSharedExploreCache,
    resetSharedExploreCacheForTests,
} from '../lib/sharedExploreCache';
import {
    createMcpSessionRegistry,
    hashMcpSessionOwnerKey,
    McpSessionCapacityError,
    type McpSessionEntry,
    type McpSessionRegistryOptions,
} from './mcpSessionRegistry';

const testConfig: LightdashMcpEnvConfig = {
    baseUrl: 'https://example.com',
    apiKey: undefined,
    defaultProjectUuid: null,
    maxLimit: 5000,
    oauthEnabled: false,
    oauthIntrospectUrl: 'https://example.com/api/v1/oauth/introspect',
    oauthRequiredScopes: ['mcp:read'],
    oauthResourceMetadataUrl:
        'https://example.com/api/v1/oauth/.well-known/oauth-protected-resource',
    maxSessions: 100,
    softSessionsPerOwner: 10,
    maxSessionsPerOwner: 20,
    lruMinIdleMs: 300_000,
    sessionTtlMs: 1_800_000,
    pruneIntervalMs: 300_000,
};

function registryOptions(
    overrides: Partial<McpSessionRegistryOptions> &
        Pick<McpSessionRegistryOptions, 'exploreCache'>,
): McpSessionRegistryOptions {
    return {
        maxSessions: 10,
        softSessionsPerOwner: 10,
        maxSessionsPerOwner: 20,
        lruMinIdleMs: 0,
        sessionTtlMs: 600_000,
        ...overrides,
    };
}

function createMockReqRes(
    method: string,
    body?: unknown,
    sessionId?: string,
): {
    req: IncomingMessage;
    res: ServerResponse;
    body: unknown;
} {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
    req.method = method;
    req.headers = {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    };

    const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
    res.statusCode = 200;
    res.writeHead = (
        code: number,
        headers?: Record<string, string>,
    ): typeof res => {
        res.statusCode = code;
        res.headers = headers;
        return res;
    };
    res.end = (data?: string): typeof res => {
        res.finished = true;
        res.body = data;
        res.emit('finish');
        return res;
    };
    res.flushHeaders = (): typeof res => res;
    res.write = (): boolean => true;

    return {
        req: req as unknown as IncomingMessage,
        res: res as unknown as ServerResponse,
        body,
    };
}

function createSseMockRes(): EventEmitter & Record<string, unknown> {
    const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
    res.statusCode = 200;
    res.writeHead = (code: number, headers?: Record<string, string>): typeof res => {
        res.statusCode = code;
        res.headers = headers;
        return res;
    };
    res.flushHeaders = (): typeof res => res;
    res.write = (): boolean => true;
    res.end = (): typeof res => res;
    return res;
}

async function initializeEntry(
    entry: McpSessionEntry,
): Promise<void> {
    const { req, res, body } = createMockReqRes('POST', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
        },
        id: 1,
    });
    await entry.transport.handleRequest(req, res, body);
}

async function initializeSession(
    registry: ReturnType<typeof createMcpSessionRegistry>,
    ownerKey = 'owner-a',
): Promise<string> {
    const entry = await registry.createPendingSession(ownerKey);
    await initializeEntry(entry);
    assert.ok(entry.sessionId, 'expected session id after initialize');
    return entry.sessionId;
}

describe('mcpSessionRegistry helpers', () => {
    it('hashMcpSessionOwnerKey prefers oauth subject over api key', () => {
        assert.equal(
            hashMcpSessionOwnerKey('pat-a', 'subject-a'),
            'oauth:subject-a',
        );
        assert.notEqual(
            hashMcpSessionOwnerKey('pat-a', undefined),
            hashMcpSessionOwnerKey('pat-b', undefined),
        );
    });
});

describe('sharedExploreCache', () => {
    it('shares entries across cache lookups', () => {
        resetSharedExploreCacheForTests();
        const cache = createSharedExploreCache();
        cache.set('p:explore', {
            expiresAtMs: Date.now() + 60_000,
            explore: { name: 'explore' },
            resolve: (field: string) => field,
            requiresDashboardContext: false,
        });
        assert.equal(cache.size(), 1);
        assert.ok(cache.get('p:explore'));
    });

    it('pruneExpired removes stale entries', () => {
        const cache = createSharedExploreCache();
        cache.set('stale', {
            expiresAtMs: Date.now() - 1,
            explore: {},
            resolve: (f) => f,
            requiresDashboardContext: false,
        });
        assert.equal(cache.pruneExpired(), 1);
        assert.equal(cache.size(), 0);
    });
});

describe('createMcpSessionRegistry', () => {
    it('registers session after initialize', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 60_000, exploreCache }));

        const sessionId = await initializeSession(registry);
        assert.ok(registry.getForOwner(sessionId, 'owner-a'));
        assert.equal(registry.getActiveCount(), 1);
        await registry.closeAll();
    });

    it('prunes idle sessions after TTL', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 20, exploreCache }));

        const sessionId = await initializeSession(registry);
        assert.equal(registry.getActiveCount(), 1);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const pruned = await registry.pruneIdleSessions();
        assert.equal(pruned, 1);
        assert.equal(registry.getActiveCount(), 0);
        assert.equal(registry.getForOwner(sessionId, 'owner-a'), undefined);
    });

    it('LRU evicts oldest session when at capacity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 1, sessionTtlMs: 600_000, exploreCache }));

        const firstSessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getActiveCount(), 1);

        registry.getForOwner(firstSessionId, 'owner-a');
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 15);
        });

        const secondSessionId = await initializeSession(registry, 'owner-b');
        assert.equal(registry.getActiveCount(), 1);
        assert.equal(registry.getForOwner(firstSessionId, 'owner-a'), undefined);
        assert.ok(registry.getForOwner(secondSessionId, 'owner-b'));
        await registry.closeAll();
    });

    it('throws McpSessionCapacityError when pending and active fill capacity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 1, sessionTtlMs: 600_000, exploreCache }));

        const pending = await registry.createPendingSession('owner-a');
        await assert.rejects(
            () => registry.createPendingSession('owner-b'),
            McpSessionCapacityError,
        );
        assert.equal(registry.getPendingCount(), 1);
        await registry.abortPendingSession(pending);
        assert.equal(registry.getPendingCount(), 0);
    });

    it('keeps multiple sessions for the same owner on re-initialize', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 10, sessionTtlMs: 600_000, exploreCache }));

        const firstSessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getActiveCount(), 1);

        const secondSessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getActiveCount(), 2);
        assert.ok(registry.getForOwner(firstSessionId, 'owner-a'));
        assert.ok(registry.getForOwner(secondSessionId, 'owner-a'));
        await registry.closeAll();
    });

    it('closing one session does not affect another session for same owner', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 10, sessionTtlMs: 600_000, exploreCache }));

        const firstSessionId = await initializeSession(registry, 'owner-a');
        const secondSessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getActiveCount(), 2);

        await registry.closeSession(firstSessionId);
        assert.equal(registry.getActiveCount(), 1);
        assert.equal(registry.getForOwner(firstSessionId, 'owner-a'), undefined);
        assert.ok(registry.getForOwner(secondSessionId, 'owner-a'));
        await registry.closeAll();
    });

    it('keeps sessions for different owners', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 10, sessionTtlMs: 600_000, exploreCache }));

        await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-b');
        assert.equal(registry.getActiveCount(), 2);
        await registry.closeAll();
    });

    it('getForOwner rejects cross-owner access without touching activity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 10, sessionTtlMs: 20, exploreCache }));

        const sessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getForOwner(sessionId, 'owner-b'), undefined);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const pruned = await registry.pruneIdleSessions();
        assert.equal(pruned, 1);
        await registry.closeAll();
    });

    it('concurrent initialize for same owner keeps all active sessions', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 10, sessionTtlMs: 600_000, exploreCache }));

        const results = await Promise.allSettled([
            initializeSession(registry, 'owner-a'),
            initializeSession(registry, 'owner-a'),
        ]);

        assert.equal(registry.getActiveCount(), 2);
        assert.equal(
            results.filter((result) => result.status === 'fulfilled').length,
            2,
        );
        await registry.closeAll();
    });

    it('allows multiple pending sessions for same owner to initialize', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 10, sessionTtlMs: 600_000, exploreCache }));

        const firstPending = await registry.createPendingSession('owner-a');
        const secondPending = await registry.createPendingSession('owner-a');

        await initializeEntry(firstPending);
        await initializeEntry(secondPending);

        assert.equal(registry.getActiveCount(), 2);
        assert.equal(firstPending.state, 'active');
        assert.equal(secondPending.state, 'active');
        assert.ok(firstPending.sessionId);
        assert.ok(secondPending.sessionId);
        assert.notEqual(firstPending.sessionId, secondPending.sessionId);
        await registry.closeAll();
    });

    it('closes the server when connect fails', async () => {
        let closeCalls = 0;
        const mockServer = {
            connect: async () => {
                throw new Error('connect failed');
            },
            close: async () => {
                closeCalls += 1;
            },
        } as unknown as ReturnType<
            NonNullable<McpSessionRegistryOptions['createMcpServer']>
        >;
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 10,
                sessionTtlMs: 600_000,
                exploreCache: createSharedExploreCache(),
                createMcpServer: () => mockServer,
            }),
        );

        await assert.rejects(
            () => registry.createPendingSession('owner-a'),
            /connect failed/,
        );
        assert.equal(closeCalls, 1);
        assert.equal(registry.getPendingCount(), 0);
        assert.equal(registry.getActiveCount(), 0);
    });

    it('same owner multiple sessions still respect global capacity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 2, sessionTtlMs: 600_000, exploreCache }));

        await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-b');

        assert.ok(registry.getActiveCount() <= 2);
        await registry.closeAll();
    });

    it('allows TTL prune of SSE-only sessions', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 20, exploreCache }));

        const sessionId = await initializeSession(registry, 'owner-a');
        registry.acquireSseLease(sessionId);
        assert.equal(registry.getHealthStats().activeSseConnections, 1);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const pruned = await registry.pruneIdleSessions();
        assert.equal(pruned, 1);
        assert.equal(registry.getForOwner(sessionId, 'owner-a'), undefined);
        assert.equal(registry.getHealthStats().activeSseConnections, 0);
        await registry.closeAll();
    });

    it('allows GET SSE reconnect after disconnect without destroying session', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 600_000, exploreCache }));

        const sessionId = await initializeSession(registry, 'owner-a');
        const firstGetReq = createMockReqRes('GET', undefined, sessionId);
        const firstGetRes = createSseMockRes();

        registry.acquireSseLease(sessionId);
        await registry
            .getForOwner(sessionId, 'owner-a')!
            .transport.handleRequest(firstGetReq.req, firstGetRes as unknown as ServerResponse, undefined);
        registry.releaseSseLease(sessionId);
        firstGetRes.emit('close');

        assert.ok(registry.getForOwner(sessionId, 'owner-a'));

        const secondGetReq = createMockReqRes('GET', undefined, sessionId);
        const secondGetRes = createSseMockRes();
        registry.acquireSseLease(sessionId);
        await registry
            .getForOwner(sessionId, 'owner-a')!
            .transport.handleRequest(secondGetReq.req, secondGetRes as unknown as ServerResponse, undefined);
        assert.equal(secondGetRes.statusCode, 200);
        registry.releaseSseLease(sessionId);
        await registry.closeAll();
    });

    it('DELETE removes session from registry while transport handles close', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 600_000, exploreCache }));

        const sessionId = await initializeSession(registry, 'owner-a');
        const { req, res } = createMockReqRes('DELETE', undefined, sessionId);
        req.headers['mcp-protocol-version'] = '2024-11-05';

        await registry
            .getForOwner(sessionId, 'owner-a')!
            .transport.handleRequest(req, res, undefined);

        assert.equal(res.statusCode, 200);
        assert.equal(registry.getForOwner(sessionId, 'owner-a'), undefined);
        assert.equal(registry.getActiveCount(), 0);
    });

    it('prunes stale pending sessions', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 20, exploreCache }));

        const pending = await registry.createPendingSession('owner-a');
        assert.equal(registry.getPendingCount(), 1);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const pruned = await registry.pruneIdleSessions();
        assert.equal(pruned, 1);
        assert.equal(registry.getPendingCount(), 0);
        assert.equal(pending.sessionId, null);
        await registry.closeAll();
    });

    it('closeAll closes pending sessions', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 600_000, exploreCache }));

        await registry.createPendingSession('owner-a');
        assert.equal(registry.getPendingCount(), 1);

        await registry.closeAll();
        assert.equal(registry.getPendingCount(), 0);
        assert.equal(registry.getActiveCount(), 0);
    });

    it('reuses one compat session per owner', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 10, sessionTtlMs: 600_000, exploreCache }));

        const first = await registry.getOrCreateCompatSession('owner-a');
        const second = await registry.getOrCreateCompatSession('owner-a');
        assert.equal(first, second);
        assert.equal(first.kind, 'compat');
        assert.equal(registry.getCompatCount(), 1);

        const other = await registry.getOrCreateCompatSession('owner-b');
        assert.notEqual(other, first);
        assert.equal(registry.getCompatCount(), 2);
        await registry.closeAll();
        assert.equal(registry.getCompatCount(), 0);
    });

    it('compat session handles tools/list without session id', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 600_000, exploreCache }));

        const entry = await registry.getOrCreateCompatSession('owner-a');
        assert.equal(entry.kind, 'compat');
        assert.equal(entry.state, 'active');
        assert.ok(entry.transport);

        const release = registry.acquireRequestLease(entry);
        try {
            const init = createMockReqRes('POST', {
                jsonrpc: '2.0',
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'compat-test', version: '1.0.0' },
                },
                id: 1,
            });
            await entry.transport.handleRequest(init.req, init.res, init.body);
            assert.equal(init.res.statusCode, 200);

            const list = createMockReqRes('POST', {
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 2,
            });
            await entry.transport.handleRequest(list.req, list.res, list.body);
            assert.equal(list.res.statusCode, 200);
        } finally {
            release();
        }

        assert.equal(registry.getCompatCount(), 1);
        await registry.closeAll();
    });

    it('request lease prevents TTL prune of compat session', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 5, sessionTtlMs: 20, exploreCache }));

        const entry = await registry.getOrCreateCompatSession('owner-a');
        const release = registry.acquireRequestLease(entry);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const prunedWhileBusy = await registry.pruneIdleSessions();
        assert.equal(prunedWhileBusy, 0);
        assert.equal(registry.getCompatCount(), 1);

        release();
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const prunedAfter = await registry.pruneIdleSessions();
        assert.equal(prunedAfter, 1);
        assert.equal(registry.getCompatCount(), 0);
        await registry.closeAll();
    });

    it('capacity accounts for compat and stateful sessions together', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, registryOptions({ maxSessions: 1, sessionTtlMs: 600_000, exploreCache }));

        await registry.getOrCreateCompatSession('owner-a');
        assert.equal(registry.getCompatCount(), 1);

        const sessionId = await initializeSession(registry, 'owner-b');
        assert.equal(registry.getActiveCount(), 1);
        assert.equal(registry.getCompatCount(), 0);
        assert.ok(registry.getForOwner(sessionId, 'owner-b'));
        await registry.closeAll();
    });

    it('owner soft cap LRU reclaims idle session on 11th initialize', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 50,
                softSessionsPerOwner: 10,
                maxSessionsPerOwner: 20,
                lruMinIdleMs: 0,
                sessionTtlMs: 600_000,
                exploreCache,
            }),
        );

        const sessionIds: string[] = [];
        for (let i = 0; i < 10; i += 1) {
            sessionIds.push(await initializeSession(registry, 'owner-a'));
        }
        assert.equal(registry.getOwnerActiveCount('owner-a'), 10);

        const eleventh = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getOwnerActiveCount('owner-a'), 10);
        assert.ok(registry.getForOwner(eleventh, 'owner-a'));
        assert.equal(
            sessionIds.filter((id) => registry.getForOwner(id, 'owner-a'))
                .length,
            9,
        );
        await registry.closeAll();
    });

    it('owner soft burst allows growth when no idle candidate', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 50,
                softSessionsPerOwner: 2,
                maxSessionsPerOwner: 4,
                lruMinIdleMs: 60_000,
                sessionTtlMs: 600_000,
                exploreCache,
            }),
        );

        await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-a');
        // 刚创建，未达 lruMinIdleMs，无法 owner LRU，允许软突发
        const third = await initializeSession(registry, 'owner-a');
        assert.ok(registry.getForOwner(third, 'owner-a'));
        assert.equal(registry.getOwnerActiveCount('owner-a'), 3);
        await registry.closeAll();
    });

    it('owner hard cap rejects when all sessions are busy or freshly active', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 50,
                softSessionsPerOwner: 2,
                maxSessionsPerOwner: 2,
                lruMinIdleMs: 60_000,
                sessionTtlMs: 600_000,
                exploreCache,
            }),
        );

        const first = await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-a');
        const release = registry.acquireRequestLease(
            registry.getForOwner(first, 'owner-a')!,
        );

        await assert.rejects(
            () => initializeSession(registry, 'owner-a'),
            McpSessionCapacityError,
        );
        release();
        assert.equal(registry.getOwnerActiveCount('owner-a'), 2);
        await registry.closeAll();
    });

    it('owner hard cap reclaims idle session when available', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 50,
                softSessionsPerOwner: 2,
                maxSessionsPerOwner: 2,
                lruMinIdleMs: 0,
                sessionTtlMs: 600_000,
                exploreCache,
            }),
        );

        const first = await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-a');
        const third = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getOwnerActiveCount('owner-a'), 2);
        assert.equal(registry.getForOwner(first, 'owner-a'), undefined);
        assert.ok(registry.getForOwner(third, 'owner-a'));
        await registry.closeAll();
    });

    it('request lease blocks TTL and LRU; SSE lease does not', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 1,
                softSessionsPerOwner: 10,
                maxSessionsPerOwner: 20,
                lruMinIdleMs: 0,
                sessionTtlMs: 20,
                exploreCache,
            }),
        );

        const busyId = await initializeSession(registry, 'owner-a');
        const entry = registry.getForOwner(busyId, 'owner-a')!;
        registry.acquireSseLease(busyId);
        const release = registry.acquireRequestLease(entry);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        assert.equal(await registry.pruneIdleSessions(), 0);

        await assert.rejects(
            () => initializeSession(registry, 'owner-b'),
            McpSessionCapacityError,
        );

        release();
        const nextId = await initializeSession(registry, 'owner-b');
        assert.equal(registry.getForOwner(busyId, 'owner-a'), undefined);
        assert.ok(registry.getForOwner(nextId, 'owner-b'));
        await registry.closeAll();
    });

    it('GET-style request lease does not refresh business activity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 5,
                sessionTtlMs: 40,
                exploreCache,
            }),
        );

        const sessionId = await initializeSession(registry, 'owner-a');
        const entry = registry.getForOwner(sessionId, 'owner-a')!;
        const activityBefore = entry.lastActivityAtMs;

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20);
        });
        // 模拟 http.ts GET：SSE lease + request lease 不刷新业务活动
        registry.acquireSseLease(sessionId);
        const release = registry.acquireRequestLease(entry, {
            refreshBusinessActivity: false,
        });
        release();
        registry.releaseSseLease(sessionId);

        assert.equal(entry.lastActivityAtMs, activityBefore);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        assert.equal(await registry.pruneIdleSessions(), 1);
        await registry.closeAll();
    });

    it('health stats report sse and in-flight request counts', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({ maxSessions: 5, exploreCache }),
        );

        const sessionId = await initializeSession(registry, 'owner-a');
        const entry = registry.getForOwner(sessionId, 'owner-a')!;
        registry.acquireSseLease(sessionId);
        const release = registry.acquireRequestLease(entry);

        const health = registry.getHealthStats();
        assert.equal(health.activeSessions, 1);
        assert.equal(health.activeSseConnections, 1);
        assert.equal(health.inFlightRequests, 1);

        release();
        registry.releaseSseLease(sessionId);
        assert.equal(registry.getHealthStats().inFlightRequests, 0);
        assert.equal(registry.getHealthStats().activeSseConnections, 0);
        await registry.closeAll();
    });

    it('compat does not consume owner soft/hard quota', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 20,
                softSessionsPerOwner: 2,
                maxSessionsPerOwner: 2,
                lruMinIdleMs: 60_000,
                exploreCache,
            }),
        );

        await registry.getOrCreateCompatSession('owner-a');
        await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-a');
        assert.equal(registry.getCompatCount(), 1);
        assert.equal(registry.getOwnerActiveCount('owner-a'), 2);

        await assert.rejects(
            () => initializeSession(registry, 'owner-a'),
            McpSessionCapacityError,
        );
        assert.equal(registry.getCompatCount(), 1);
        await registry.closeAll();
    });
});
