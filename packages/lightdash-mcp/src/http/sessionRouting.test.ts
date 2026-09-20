import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    formatSessionMissingReason,
    getJsonRpcMethod,
    isInitializeRequest,
    parseMcpSessionIdHeader,
    resolveSessionRoute,
} from './sessionRouting';

describe('sessionRouting', () => {
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

    it('getJsonRpcMethod reads method from object or batch', () => {
        assert.equal(
            getJsonRpcMethod({ jsonrpc: '2.0', method: 'tools/call', id: 1 }),
            'tools/call',
        );
        assert.equal(
            getJsonRpcMethod([
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
            ]),
            'tools/list',
        );
        assert.equal(getJsonRpcMethod(undefined), undefined);
    });

    it('parseMcpSessionIdHeader reads string or array header', () => {
        assert.equal(parseMcpSessionIdHeader('abc'), 'abc');
        assert.equal(parseMcpSessionIdHeader(['a', 'b']), 'b');
        assert.equal(parseMcpSessionIdHeader(undefined), undefined);
    });

    it('resolveSessionRoute returns compat for POST without session id', () => {
        const registry = {
            getForOwner: () => undefined,
            getOwnerKeyForSession: () => undefined,
        };
        assert.deepEqual(
            resolveSessionRoute(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
                undefined,
                'owner-a',
            ),
            { kind: 'compat' },
        );
        assert.deepEqual(
            resolveSessionRoute(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'tools/call', id: 2 },
                undefined,
                'owner-a',
            ),
            { kind: 'compat' },
        );
    });

    it('resolveSessionRoute returns missing-header for GET without session id', () => {
        const registry = {
            getForOwner: () => undefined,
            getOwnerKeyForSession: () => undefined,
        };
        assert.deepEqual(
            resolveSessionRoute(
                registry,
                'GET',
                undefined,
                undefined,
                'owner-a',
            ),
            { kind: 'missing', reason: 'missing-header' },
        );
    });

    it('resolveSessionRoute ignores stale session id on initialize', () => {
        const registry = {
            getForOwner: () => undefined,
            getOwnerKeyForSession: () => undefined,
        };
        assert.deepEqual(
            resolveSessionRoute(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'initialize', id: 1 },
                'stale-session',
                'owner-a',
            ),
            { kind: 'initialize' },
        );
    });

    it('resolveSessionRoute returns unknown-session for expired id', () => {
        const registry = {
            getForOwner: () => undefined,
            getOwnerKeyForSession: () => undefined,
        };
        assert.deepEqual(
            resolveSessionRoute(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
                'expired-session',
                'owner-a',
            ),
            { kind: 'missing', reason: 'unknown-session' },
        );
    });

    it('resolveSessionRoute returns owner-mismatch for foreign owner session', () => {
        const registry = {
            getForOwner: () => undefined,
            getOwnerKeyForSession: () => 'owner-b',
        };
        assert.deepEqual(
            resolveSessionRoute(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
                'foreign-session',
                'owner-a',
            ),
            { kind: 'missing', reason: 'owner-mismatch' },
        );
    });

    it('resolveSessionRoute returns found for valid session', () => {
        const entry = { sessionId: 'session-1' };
        const registry = {
            getForOwner: () => entry,
            getOwnerKeyForSession: () => 'owner-a',
        };
        assert.deepEqual(
            resolveSessionRoute(
                registry,
                'POST',
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
                'session-1',
                'owner-a',
            ),
            { kind: 'found', entry },
        );
    });

    it('formatSessionMissingReason maps reasons to log text', () => {
        assert.equal(
            formatSessionMissingReason('missing-header'),
            'missing Mcp-Session-Id header',
        );
        assert.equal(
            formatSessionMissingReason('unknown-session'),
            'unknown or expired session id',
        );
        assert.equal(
            formatSessionMissingReason('owner-mismatch'),
            'session id belongs to another authenticated owner',
        );
    });
});
