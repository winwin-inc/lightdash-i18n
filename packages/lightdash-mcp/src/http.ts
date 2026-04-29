/**
 * 独立 MCP 服务：Streamable HTTP。
 * 客户端 .mcp.json 使用 type + url + headers，无需本地 node args。
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfigFromEnv } from './config';
import { createLightdashMcpServer } from './mcp/createMcpServer';
import {
    createAuthCache,
    maskApiKey,
    parseApiKeyFromRequest,
    parseUserAttributesHeader,
    resolveClientIp,
    validateApiKeyAndGetEmail,
} from './http/authAndCache';
import {
    httpRequestApiKeyStore,
} from './lib/requestContext';

const authCache = createAuthCache();

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
        const start = Date.now();
        const ip = resolveClientIp(req);
        const headerKey = parseApiKeyFromRequest(req);
        const effectiveKey = headerKey ?? config.apiKey;
        const maskedKey = maskApiKey(effectiveKey);
        let userEmail = 'unknown';

        try {
            if (effectiveKey) {
                userEmail = await validateApiKeyAndGetEmail(
                    authCache,
                    config.baseUrl,
                    effectiveKey,
                    maskedKey,
                );
            }
            await httpRequestApiKeyStore.run(
                {
                    apiKey: effectiveKey,
                    userEmail,
                    maskedKey,
                    userAttributesHeader: parseUserAttributesHeader(req),
                },
                () =>
                    transport.handleRequest(
                        req,
                        res,
                        req.method === 'POST' ? req.body : undefined,
                    ),
            );
        } finally {
            const elapsed = Date.now() - start;
            const status = res.statusCode || 0;
            const statusTag = status >= 400 ? ` | error(${status})` : '';
            process.stderr.write(
                `[RequestLog] [Request] ${req.method} ${req.path} | ip: ${ip} | key: ${maskedKey} | ${status} | ${elapsed}ms${statusTag} | ${userEmail}\n`,
            );
        }
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
