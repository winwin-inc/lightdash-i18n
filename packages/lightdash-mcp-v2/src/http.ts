/**
 * 独立 MCP 服务：Streamable HTTP（MCP 2026-07-28 sessionless）。
 * 兼容模式：createMcpHandler({ legacy: 'stateless' })，按无状态方式接 2025 时代流量（不建服务端 Session）。
 */
import express from 'express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { loadConfigFromEnv } from './config';
import { getMcpPackageVersion } from './lib/mcpPackageVersion';
import { getSharedExploreCache } from './lib/sharedExploreCache';
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
import { createLightdashMcpServer } from './mcp/createMcpServer';
import { httpRequestApiKeyStore } from './lib/requestContext';
import { writeStderrLog } from './lib/stderrLog';

const authCache = createAuthCache();
const oauthCache = createOauthCache();

/** 当前进程内正在处理的 /mcp 请求数（仅观测，非 Session）。 */
let inFlightRequests = 0;

function logStartupConfig(config: ReturnType<typeof loadConfigFromEnv>): void {
    const projectLog =
        config.defaultProjectUuid ??
        '(未设置；调用需项目的工具时请在参数中传 projectUuid，或配置 LIGHTDASH_PROJECT_UUID)';
    const hasApiKey = Boolean(config.apiKey && config.apiKey.length > 0);
    const oauthScopes =
        config.oauthRequiredScopes.length > 0
            ? config.oauthRequiredScopes.join(',')
            : '(empty)';
    writeStderrLog(
        `[Config] @lightdash/mcp-v2=${getMcpPackageVersion()} | LIGHTDASH_SITE_URL=${config.baseUrl}`,
    );
    writeStderrLog(
        `[Config] LIGHTDASH_PROJECT_UUID=${projectLog} | LIGHTDASH_MAX_LIMIT=${config.maxLimit}`,
    );
    writeStderrLog(
        `[Config] MCP_OAUTH_ENABLED=${config.oauthEnabled} | OAUTH_REQUIRED_SCOPES=${oauthScopes}`,
    );
    writeStderrLog(
        `[Config] OAUTH_RESOURCE_METADATA_URL=${config.oauthResourceMetadataUrl}`,
    );
    writeStderrLog(
        `[Config] OAUTH_INTROSPECT_URL=${config.oauthIntrospectUrl} | LIGHTDASH_API_KEY_SET=${hasApiKey}`,
    );
    writeStderrLog(
        `[Config] MCP_PROTOCOL=2026-07-28 sessionless | legacy=stateless`,
    );
}

/** body-parser / express.json 解析失败时抛出的错误（非法或空 JSON body）。 */
function isJsonBodyParseError(err: unknown): boolean {
    if (!(err instanceof SyntaxError)) {
        return false;
    }
    const parseErr = err as SyntaxError & { type?: string; status?: number };
    return (
        parseErr.type === 'entity.parse.failed' || parseErr.status === 400
    );
}

async function main(): Promise<void> {
    const config = loadConfigFromEnv();
    logStartupConfig(config);

    const exploreCache = getSharedExploreCache();

    const mcpHandler = createMcpHandler(
        () => createLightdashMcpServer(config, { exploreCache }),
        { legacy: 'stateless' },
    );
    const nodeMcp = toNodeHandler(mcpHandler);

    const shutdown = (): void => {
        void mcpHandler.close().finally(() => {
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '4mb' }));

    app.get('/health', (_req: express.Request, res: express.Response) => {
        res.status(200).json({
            ok: true as const,
            package: '@lightdash/mcp-v2',
            protocol: '2026-07-28',
            legacy: 'stateless',
            inFlightRequests,
        });
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

        inFlightRequests += 1;
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
                    oauthAccessToken:
                        authType === 'oauth' ? bearerToken : undefined,
                    oauthScopes,
                    authSubject,
                    userEmail,
                    maskedKey,
                    userAttributesHeader: parseUserAttributesHeader(req),
                },
                () =>
                    new Promise<void>((resolve, reject) => {
                        try {
                            void Promise.resolve(
                                nodeMcp(req, res, req.body),
                            ).then(() => resolve(), reject);
                        } catch (error) {
                            reject(error);
                        }
                    }),
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            if (
                message.includes('OAuth introspect failed with') ||
                message.includes('OAuth introspect requires')
            ) {
                if (!res.headersSent) {
                    res.status(503).json({
                        error: 'Auth service unavailable',
                        message,
                    });
                }
                return;
            }
            const isAuthError =
                message.includes('OAuth token') ||
                message.includes('Failed to authorize user') ||
                message.includes('missing required scopes');
            if (isAuthError) {
                if (!res.headersSent) {
                    res.set(
                        'WWW-Authenticate',
                        `Bearer resource_metadata="${config.oauthResourceMetadataUrl}"`,
                    );
                    res.status(401).json({
                        error: 'Unauthorized',
                        message,
                    });
                }
                return;
            }
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal server error',
                    message,
                });
            }
            return;
        } finally {
            inFlightRequests = Math.max(0, inFlightRequests - 1);
            const elapsed = Date.now() - start;
            const status = res.statusCode || 0;
            const statusTag = status >= 400 ? ` | error(${status})` : '';
            writeStderrLog(
                `[RequestLog] [Request] ${req.method} ${req.path} | ip: ${ip} | key: ${maskedKey} | ${status} | ${elapsed}ms${statusTag} | ${userEmail}`,
            );
        }
    });

    app.use(
        (
            err: unknown,
            req: express.Request,
            res: express.Response,
            next: express.NextFunction,
        ) => {
            if (isJsonBodyParseError(err)) {
                const ip = resolveClientIp(req);
                const message =
                    err instanceof Error ? err.message : 'Invalid JSON';
                writeStderrLog(
                    `[RequestLog] [Request] ${req.method} ${req.path} | ip: ${ip} | key: *** | 400 | 0ms | error(400) | invalid_json_body | ${message}`,
                );
                if (!res.headersSent) {
                    res.status(400).json({
                        error: 'Invalid JSON body',
                        hint: 'POST /mcp requires a valid JSON-RPC object with Content-Type: application/json',
                    });
                }
                return;
            }
            next(err);
        },
    );

    app.use(
        (
            err: unknown,
            req: express.Request,
            res: express.Response,
            next: express.NextFunction,
        ) => {
            const ip = resolveClientIp(req);
            const message = err instanceof Error ? err.message : String(err);
            writeStderrLog(
                `[RequestLog] [Request] ${req.method} ${req.path} | ip: ${ip} | key: *** | 500 | 0ms | error(500) | unhandled | ${message}`,
            );
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal server error',
                });
                return;
            }
            next(err);
        },
    );

    const port = Number(process.env.LIGHTDASH_MCP_HTTP_PORT ?? 3333);
    if (!Number.isFinite(port) || port <= 0) {
        throw new Error('LIGHTDASH_MCP_HTTP_PORT must be a positive number');
    }
    app.listen(port, '0.0.0.0', () => {
        writeStderrLog(
            `Lightdash MCP v2 (2026-07-28 sessionless, legacy=stateless) listening on http://0.0.0.0:${port}/mcp`,
        );
    });
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    writeStderrLog(msg);
    process.exit(1);
});
