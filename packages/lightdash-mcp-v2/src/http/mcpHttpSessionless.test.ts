import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { McpServer } from '@modelcontextprotocol/server';

describe('mcp v2 sessionless handler', () => {
    it('createMcpHandler accepts legacy stateless', async () => {
        const handler = createMcpHandler(
            () =>
                new McpServer({
                    name: 'test-mcp-v2',
                    version: '0.0.0',
                }),
            { legacy: 'stateless' },
        );
        assert.equal(typeof handler.fetch, 'function');
        assert.equal(typeof handler.close, 'function');
        await handler.close();
    });
});
