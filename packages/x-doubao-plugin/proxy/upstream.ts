/**
 * 上游连接：每次请求用「注入的 x-api-key」新建一个 MCP Client 连到 X 平台。
 *
 * 关键点：PAT 只在请求头里流转，不落日志、不进工具参数、不进模型上下文。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const API_KEY_HEADER = 'x-api-key';

export const UPSTREAM_URL =
    process.env.UPSTREAM_URL ?? 'https://mcp-x.brandct.com/mcp';

export type Upstream = {
    client: Client;
    close: () => Promise<void>;
};

export async function connectUpstream(apiKey: string): Promise<Upstream> {
    const transport = new StreamableHTTPClientTransport(new URL(UPSTREAM_URL), {
        requestInit: {
            headers: { [API_KEY_HEADER]: apiKey },
        },
    });

    const client = new Client(
        { name: 'x-batch-proxy', version: '0.1.0' },
        { capabilities: {} },
    );

    await client.connect(transport);

    return {
        client,
        close: async () => {
            await client.close();
        },
    };
}
