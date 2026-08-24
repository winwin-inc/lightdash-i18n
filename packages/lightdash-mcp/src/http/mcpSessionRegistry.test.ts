import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import type { LightdashMcpEnvConfig } from '../config';
import {
    createSharedExploreCache,
    resetSharedExploreCacheForTests,
} from '../lib/sharedExploreCache';
import {
    createMcpSessionRegistry,
    isInitializeRequest,
    McpSessionCapacityError,
    parseMcpSessionIdHeader,
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
    req: EventEmitter & Record<string, unknown>;
    res: EventEmitter & Record<string, unknown>;
} {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
    req.method = method;
    req.headers = {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    };
    if (body !== undefined) {
        req.body = body;
    }

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

    return { req, res };
}

async function initializeSession(
    registry: ReturnType<typeof createMcpSessionRegistry>,
): Promise<string> {
    const entry = await registry.createPendingSession();
    const { req, res } = createMockReqRes('POST', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
        },
        id: 1,
    });
    await entry.transport.handleRequest(req, res, req.body);
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
        assert.ok(registry.get(sessionId));
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

        await new Promise((r) => setTimeout(r, 30));
        const pruned = await registry.pruneIdleSessions();
        assert.equal(pruned, 1);
        assert.equal(registry.getActiveCount(), 0);
        assert.equal(registry.get(sessionId), undefined);
    });

    it('LRU evicts oldest session when at capacity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 1,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        const firstSessionId = await initializeSession(registry);
        assert.equal(registry.getActiveCount(), 1);

        registry.get(firstSessionId);
        await new Promise((r) => setTimeout(r, 15));

        const secondSessionId = await initializeSession(registry);
        assert.equal(registry.getActiveCount(), 1);
        assert.equal(registry.get(firstSessionId), undefined);
        assert.ok(registry.get(secondSessionId));
        await registry.closeAll();
    });

    it('throws McpSessionCapacityError when pending and active fill capacity', async () => {
        const exploreCache = createSharedExploreCache();
        const registry = createMcpSessionRegistry(testConfig, {
            maxSessions: 1,
            sessionTtlMs: 600_000,
            exploreCache,
        });

        const pending = await registry.createPendingSession();
        await assert.rejects(
            () => registry.createPendingSession(),
            McpSessionCapacityError,
        );
        await registry.abortPendingSession(pending);
    });
});
