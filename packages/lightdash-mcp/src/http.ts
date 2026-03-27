/**
 * 独立 MCP 服务：Streamable HTTP。
 * 客户端 .mcp.json 使用 type + url + headers，无需本地 node args。
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfigFromEnv } from './config';
import { createLightdashMcpServer } from './createMcpServer';
import { httpRequestApiKeyStore } from './requestContext';

function parseApiKeyFromRequest(req: express.Request): string | undefined {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('apikey ')) {
        return auth.slice(7).trim();
    }
    const x = req.headers['x-lightdash-api-key'];
    if (typeof x === 'string' && x.length > 0) {
        return x;
    }
    return undefined;
}

async function main(): Promise<void> {
    const config = loadConfigFromEnv();
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });
    const mcp = createLightdashMcpServer(config);
    await mcp.connect(transport);

    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '4mb' }));

    app.get('/health', (_req: express.Request, res: express.Response) => {
        res.status(200).json({ ok: true as const });
    });

    app.all('/mcp', async (req: express.Request, res: express.Response) => {
        const headerKey = parseApiKeyFromRequest(req);
        await httpRequestApiKeyStore.run({ apiKey: headerKey }, () =>
            transport.handleRequest(
                req,
                res,
                req.method === 'POST' ? req.body : undefined,
            ),
        );
    });

    const port = Number(process.env.LIGHTDASH_MCP_HTTP_PORT ?? 3333);
    if (!Number.isFinite(port) || port <= 0) {
        throw new Error('LIGHTDASH_MCP_HTTP_PORT must be a positive number');
    }
    app.listen(port, '0.0.0.0', () => {
        process.stderr.write(
            `Lightdash MCP (Streamable HTTP) listening on http://0.0.0.0:${port}/mcp\n`,
        );
    });
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
});
