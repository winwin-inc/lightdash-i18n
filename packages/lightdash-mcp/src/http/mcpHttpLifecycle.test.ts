import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';
import type { LightdashMcpEnvConfig } from '../config';
import { createSharedExploreCache } from '../lib/sharedExploreCache';
import {
    createMcpSessionRegistry,
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
    lruMinIdleMs: 0,
    sessionTtlMs: 600_000,
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
    };
    const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
    res.statusCode = 200;
    res.writeHead = (code: number): typeof res => {
        res.statusCode = code;
        return res;
    };
    res.end = (): typeof res => res;
    res.flushHeaders = (): typeof res => res;
    res.write = (): boolean => true;
    return {
        req: req as unknown as IncomingMessage,
        res: res as unknown as ServerResponse,
        body,
    };
}

async function initializeEntry(entry: McpSessionEntry): Promise<string> {
    const { req, res, body } = createMockReqRes('POST', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'http-lifecycle', version: '1.0.0' },
        },
        id: 1,
    });
    await entry.transport.handleRequest(req, res, body);
    assert.ok(entry.sessionId);
    return entry.sessionId;
}

/**
 * 模拟 http.ts 中 GET/POST/DELETE 的 lease 生命周期（不启动完整 Express）。
 */
describe('mcp http session lifecycle wiring', () => {
    it('res.close-style SSE release drops activeSseConnections', async () => {
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({ exploreCache: createSharedExploreCache() }),
        );
        const pending = await registry.createPendingSession('owner-http');
        const sessionId = await initializeEntry(pending);

        // http.ts: acquireSseLease + res.once('close', releaseSseLease)
        registry.acquireSseLease(sessionId);
        assert.equal(registry.getHealthStats().activeSseConnections, 1);

        const sseRes = new EventEmitter();
        sseRes.once('close', () => {
            registry.releaseSseLease(sessionId);
        });
        sseRes.emit('close');

        assert.equal(registry.getHealthStats().activeSseConnections, 0);
        await registry.closeAll();
    });

    it('DELETE-style closeSession releases slot immediately', async () => {
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 1,
                exploreCache: createSharedExploreCache(),
            }),
        );
        const pending = await registry.createPendingSession('owner-a');
        const sessionId = await initializeEntry(pending);
        assert.equal(registry.getActiveCount(), 1);

        await registry.closeSession(sessionId);
        assert.equal(registry.getActiveCount(), 0);

        const next = await registry.createPendingSession('owner-b');
        assert.ok(next);
        await registry.closeAll();
    });

    it('capacity error maps to 503-style payload fields', async () => {
        const registry = createMcpSessionRegistry(
            testConfig,
            registryOptions({
                maxSessions: 1,
                softSessionsPerOwner: 1,
                maxSessionsPerOwner: 1,
                lruMinIdleMs: 60_000,
                exploreCache: createSharedExploreCache(),
            }),
        );
        await registry.createPendingSession('owner-a');
        try {
            await registry.createPendingSession('owner-b');
            assert.fail('expected capacity error');
        } catch (error) {
            assert.ok(error instanceof McpSessionCapacityError);
            // 与 http.ts 503 响应字段对齐
            const payload = {
                error: 'Too many active MCP sessions, retry later',
                maxSessions: 1,
            };
            assert.equal(payload.maxSessions, 1);
            assert.match(error.message, /Too many active MCP sessions/);
        }
        await registry.closeAll();
    });
});
