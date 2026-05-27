/**
 * 独立 MCP 服务：Streamable HTTP。
 * 客户端 .mcp.json 使用 type + url + headers，无需本地 node args。
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfigFromEnv } from './config';
import { getMcpPackageVersion } from './lib/mcpPackageVersion';
import { createLightdashMcpServer } from './mcp/createMcpServer';
import {
    createAuthCache,
    createOauthCache,
    maskApiKey,
    parseApiKeyFromRequest,
    parseBearerTokenFromRequest,
    parseUserAttributesHeader,
    resolveClientIp,
    validateApiKeyAndGetEmail,
    validateOauthToken,
} from './http/authAndCache';
import {
    httpRequestApiKeyStore,
} from './lib/requestContext';

const authCache = createAuthCache();
const oauthCache = createOauthCache();

async function main(): Promise<void> {
    const config = loadConfigFromEnv();
    const projectLog =
        config.defaultProjectUuid ??
        '(未设置；调用需项目的工具前请先 set_project 或在工具参数传 projectUuid)';
    process.stderr.write(
        `[Config] @lightdash/mcp=${getMcpPackageVersion()} | LIGHTDASH_SITE_URL=${config.baseUrl}\n[Config] LIGHTDASH_PROJECT_UUID=${projectLog}\n`,
    );
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
        const bearerToken = parseBearerTokenFromRequest(req);
        const headerKey = parseApiKeyFromRequest(req);
        const effectiveKey =
            headerKey ?? (config.oauthEnabled ? undefined : config.apiKey);
        const maskedKey = maskApiKey(effectiveKey);
        let userEmail = 'unknown';
        let authType: 'apikey' | 'oauth' | undefined;
        let oauthScopes: string[] = [];
        let authSubject: string | undefined;

        try {
            if (bearerToken && config.oauthEnabled) {
                const oauthResult = await validateOauthToken(oauthCache, {
                    introspectUrl: config.oauthIntrospectUrl,
                    introspectApiKey: config.apiKey,
                    token: bearerToken,
                    requiredScopes: config.oauthRequiredScopes,
                });
                authType = 'oauth';
                oauthScopes = oauthResult.scopes;
                authSubject = oauthResult.subject;
                userEmail = oauthResult.subject;
            } else if (effectiveKey) {
                userEmail = await validateApiKeyAndGetEmail(
                    authCache,
                    config.baseUrl,
                    effectiveKey,
                    maskedKey,
                );
                authType = 'apikey';
            } else {
                res.set(
                    'WWW-Authenticate',
                    `Bearer resource_metadata="${config.oauthResourceMetadataUrl}"`,
                );
                res.status(401).json({
                    error: 'Unauthorized',
                    hint: 'Provide Authorization: Bearer <token> or x-api-key',
                });
                return;
            }
            await httpRequestApiKeyStore.run(
                {
                    apiKey: effectiveKey,
                    authType,
                    oauthAccessToken: authType === 'oauth' ? bearerToken : undefined,
                    oauthScopes,
                    authSubject,
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
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('OAuth introspect failed with')) {
                res.status(503).json({
                    error: 'Auth service unavailable',
                    message,
                });
                return;
            }
            if (message.includes('OAuth introspect requires')) {
                res.status(503).json({
                    error: 'Auth service unavailable',
                    message,
                });
                return;
            }
            const isAuthError =
                message.includes('OAuth token') ||
                message.includes('Failed to authorize user') ||
                message.includes('missing required scopes');
            if (isAuthError) {
                res.set(
                    'WWW-Authenticate',
                    `Bearer resource_metadata="${config.oauthResourceMetadataUrl}"`,
                );
                res.status(401).json({
                    error: 'Unauthorized',
                    message,
                });
                return;
            }
            res.status(500).json({
                error: 'Internal server error',
                message,
            });
            return;
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
