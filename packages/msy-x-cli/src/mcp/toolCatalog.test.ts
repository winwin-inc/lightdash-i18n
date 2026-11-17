import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { ExitCode } from '../cli/exitCodes';
import type { McpClient, ToolDescriptor } from '../types';
import { getToolCatalog } from './toolCatalog';

test('description 缺省 null 且按 name 升序', async () => {
    const tools: ToolDescriptor[] = [
        { name: 'run_semantic_metric_query', description: '跑查询', inputSchema: { type: 'object' } },
        { name: 'list_explores', description: undefined as unknown as null, inputSchema: { type: 'object' } },
        { name: 'get_my_access', description: null, inputSchema: { type: 'object' } },
    ];
    const client: McpClient = {
        listTools: async () => tools,
        callTool: async () => {
            throw new Error('unused');
        },
        close: async () => {},
    };
    const catalog = await getToolCatalog(client);
    assert.deepEqual(
        catalog.map((tool) => [tool.name, tool.description]),
        [
            ['get_my_access', null],
            ['list_explores', null],
            ['run_semantic_metric_query', '跑查询'],
        ],
    );
});

test('listTools 抛错时经 mapMcpError 归一（401 → 3）', async () => {
    const client: McpClient = {
        listTools: async () => {
            throw new UnauthorizedError();
        },
        callTool: async () => {
            throw new Error('unused');
        },
        close: async () => {},
    };
    await assert.rejects(
        getToolCatalog(client),
        (error: unknown) => {
            const cliError = error as Error & { code?: string; exitCode?: number };
            assert.equal(cliError.code, 'AUTH_REQUIRED');
            assert.equal(cliError.exitCode, ExitCode.AUTH_REQUIRED);
            return true;
        },
    );
});
