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
    isInitializeRequest,
    McpSessionCapacityError,
    type McpSessionEntry,
    type McpSessionRegistryOptions,
    parseMcpSessionIdHeader,
    resolveSessionEntry,
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
    sessionTtlMs: 1_800_000,
    pruneIntervalMs: 300_000,
};

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
    it('isInitializeRequest detects initialize method', () => {
        assert.equal(
            isInitializeRequest({
                jsonrpc: '2.0',
                method: 'initialize',
                id: 1,
            }),
            true,
        );
        assert.equal(
            isInitializeRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
            false,
        );
    });

    it('parseMcpSessionIdHeader reads string or array header', () => {
        assert.equal(parseMcpSessionIdHeader('abc'), 'abc');
        assert.equal(parseMcpSessionIdHeader(['a', 'b']), 'b');
        assert.equal(parseMcpSessionIdHeader(undefined), undefined);
    });

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

    it('resolveSessionEntry ignores stale session id on initialize', () => {
        const registry = {
            getForOwner: () => undefined,
        };
        assert.equal(
            resolveSessionEntry(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'initialize', id: 1 },
                'stale-session',
                'owner-a',
            ),
            'initialize',
        );
    });

    it('resolveSessionEntry returns missing for foreign owner session', () => {
        const registry = {
            getForOwner: () => undefined,
        };
        assert.equal(
            resolveSessionEntry(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
                'foreign-session',
                'owner-a',
            ),
            'missing',
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
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 5,
            sessionTtlMs: 60_000,
            exploreCache,
        });

        const sessionId = await initializeSession(registry);
        assert.ok(registry.getForOwner(sessionId, 'owner-a'));
        assert.equal(registry.getActiveCount(), 1);
        await registry.closeAll();
    });

    it('prunes idle sessions after TTL', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 5,
            sessionTtlMs: 20,
            exploreCache,
        });

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
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 1,
            sessionTtlMs: 600_000,
            exploreCache,
        });

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
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 1,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        const pending = await registry.createPendingSession('owner-a');
        await assert.rejects(
            () => registry.createPendingSession('owner-b'),
            McpSessionCapacityError,
        );
        assert.equal(registry.getPendingCount(), 1);
        await registry.abortPendingSession(pending);
        assert.equal(registry.getPendingCount(), 0);
    });

    it('replaces previous sessions for the same owner on re-initialize', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 10,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        const firstSessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getActiveCount(), 1);

        const secondSessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getActiveCount(), 1);
        assert.equal(registry.getForOwner(firstSessionId, 'owner-a'), undefined);
        assert.ok(registry.getForOwner(secondSessionId, 'owner-a'));
        await registry.closeAll();
    });

    it('keeps sessions for different owners', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 10,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        await initializeSession(registry, 'owner-a');
        await initializeSession(registry, 'owner-b');
        assert.equal(registry.getActiveCount(), 2);
        await registry.closeAll();
    });

    it('getForOwner rejects cross-owner access without touching activity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 10,
            sessionTtlMs: 20,
            exploreCache,
        });

        const sessionId = await initializeSession(registry, 'owner-a');
        assert.equal(registry.getForOwner(sessionId, 'owner-b'), undefined);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const pruned = await registry.pruneIdleSessions();
        assert.equal(pruned, 1);
        await registry.closeAll();
    });

    it('concurrent initialize for same owner keeps only one active session', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 10,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        const results = await Promise.allSettled([
            initializeSession(registry, 'owner-a'),
            initializeSession(registry, 'owner-a'),
        ]);

        assert.equal(registry.getActiveCount(), 1);
        assert.equal(
            results.filter((result) => result.status === 'fulfilled').length,
            1,
        );
        assert.equal(
            results.filter((result) => result.status === 'rejected').length,
            1,
        );
        await registry.closeAll();
    });

    it('does not register a superseded pending session initialized late', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 10,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        const superseded = await registry.createPendingSession('owner-a');
        const current = await registry.createPendingSession('owner-a');

        await initializeEntry(superseded);
        await initializeEntry(current);

        assert.equal(registry.getActiveCount(), 1);
        assert.equal(superseded.state, 'closed');
        assert.equal(superseded.sessionId, null);
        assert.equal(current.state, 'active');
        assert.ok(current.sessionId);
        assert.ok(registry.getForOwner(current.sessionId, 'owner-a'));
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
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 10,
            sessionTtlMs: 600_000,
            exploreCache: createSharedExploreCache(),
            createMcpServer: () => mockServer,
        });

        await assert.rejects(
            () => registry.createPendingSession('owner-a'),
            /connect failed/,
        );
        assert.equal(closeCalls, 1);
        assert.equal(registry.getPendingCount(), 0);
        assert.equal(registry.getActiveCount(), 0);
    });

    it('concurrent initialize for different owners respects maxSessions', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 2,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        await Promise.all([
            initializeSession(registry, 'owner-a'),
            initializeSession(registry, 'owner-b'),
            initializeSession(registry, 'owner-c'),
        ]);

        assert.ok(registry.getActiveCount() <= 2);
        assert.ok(registry.getPendingCount() <= 1);
        await registry.closeAll();
    });

    it('keeps session alive while SSE lease is active', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 5,
            sessionTtlMs: 20,
            exploreCache,
        });

        const sessionId = await initializeSession(registry, 'owner-a');
        registry.acquireSseLease(sessionId);

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const pruned = await registry.pruneIdleSessions();
        assert.equal(pruned, 0);
        assert.ok(registry.getForOwner(sessionId, 'owner-a'));

        registry.releaseSseLease(sessionId);
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
        });
        const prunedAfterRelease = await registry.pruneIdleSessions();
        assert.equal(prunedAfterRelease, 1);
        await registry.closeAll();
    });

    it('allows GET SSE reconnect after disconnect without destroying session', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 5,
            sessionTtlMs: 600_000,
            exploreCache,
        });

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
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 5,
            sessionTtlMs: 600_000,
            exploreCache,
        });

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
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 5,
            sessionTtlMs: 20,
            exploreCache,
        });

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
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 5,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        await registry.createPendingSession('owner-a');
        assert.equal(registry.getPendingCount(), 1);

        await registry.closeAll();
        assert.equal(registry.getPendingCount(), 0);
        assert.equal(registry.getActiveCount(), 0);
    });
});
