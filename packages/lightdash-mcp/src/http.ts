/**
 * 独立 MCP 服务：Streamable HTTP。
 * 客户端 .mcp.json 使用 type + url + headers，无需本地 node args。
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfigFromEnv } from './config';
import { createLightdashMcpServer } from './createMcpServer';
import { httpRequestApiKeyStore } from './requestContext';

type AuthCacheEntry = {
    email: string;
    expiresAtMs: number;
};

const AUTH_CACHE_TTL_MS = 90_000;
const authCache = new Map<string, AuthCacheEntry>();

function parseApiKeyFromRequest(req: express.Request): string | undefined {
    const xApiKey = req.headers['x-api-key'];
    if (typeof xApiKey === 'string' && xApiKey.length > 0) {
        return xApiKey;
    }
    return undefined;
}

function maskApiKey(key: string | undefined): string {
    if (!key || key.length <= 3) return '***';
    return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

function resolveClientIp(req: express.Request): string {
    const xfwd = req.headers['x-forwarded-for'];
    if (typeof xfwd === 'string' && xfwd.length > 0) {
        return xfwd.split(',')[0]?.trim() || req.ip || '-';
    }
    return req.ip || '-';
}

function readEmailFromUserResponse(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown';
    const p = payload as {
        results?: {
            email?: string;
            user?: { email?: string };
        };
    };
    return (
        p.results?.email ??
        p.results?.user?.email ??
        'unknown'
    );
}

async function validateApiKeyAndGetEmail(
    baseUrl: string,
    apiKey: string,
    maskedKey: string,
): Promise<string> {
    const now = Date.now();
    const cached = authCache.get(apiKey);
    if (cached && cached.expiresAtMs > now) {
        const remainSec = Math.max(0, Math.floor((cached.expiresAtMs - now) / 1000));
        process.stderr.write(
            `[ApiAuth] ${maskedKey} 缓存命中 -> 有效（剩余 ${remainSec}s） | ${cached.email}\n`,
        );
        return cached.email;
    }

    const response = await fetch(`${baseUrl}/api/v1/user`, {
        method: 'GET',
        headers: {
            Authorization: `ApiKey ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        process.stderr.write(
            `[ApiAuth] ${maskedKey} 校验失败 -> ${response.status}\n`,
        );
        throw new Error(`Lightdash API ${response.status}: Failed to authorize user`);
    }
    const body = (await response.json()) as unknown;
    const email = readEmailFromUserResponse(body);
    authCache.set(apiKey, {
        email,
        expiresAtMs: now + AUTH_CACHE_TTL_MS,
    });
    process.stderr.write(`[ApiAuth] ${maskedKey} 校验通过 -> ${email}\n`);
    return email;
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
        const start = Date.now();
        const ip = resolveClientIp(req);
        const headerKey = parseApiKeyFromRequest(req);
        const effectiveKey = headerKey ?? config.apiKey;
        const maskedKey = maskApiKey(effectiveKey);
        let userEmail = 'unknown';

        try {
            if (effectiveKey) {
                userEmail = await validateApiKeyAndGetEmail(
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
