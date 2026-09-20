/**
 * 独立 MCP 服务：Streamable HTTP（MCP 2026-07-28 sessionless）。
 * Keycloak OAuth resource server + 邮箱换票 → 短期 PAT 调 Lightdash REST。
 */
import express from 'express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { AuthInfo, OAuthMetadata } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
    getOAuthProtectedResourceMetadataUrl,
    mcpAuthMetadataRouter,
    requireBearerAuth,
} from '@modelcontextprotocol/express';
import {
    buildDegradedServiceBody,
    describeRequiredEnvPresence,
    listMissingRequiredEnv,
    loadConfigFromEnv,
    missingEnvHint,
} from './config';
import { getMcpPackageVersion } from './lib/mcpPackageVersion';
import { getSharedExploreCache } from './lib/sharedExploreCache';
import {
    maskApiKey,
    parseUserAttributesHeader,
    resolveClientIp,
} from './http/authAndCache';
import {
    createKeycloakTokenVerifier,
    fetchKeycloakOAuthMetadata,
} from './http/keycloakJwt';
import {
    createPatCache,
    getOrExchangePat,
    invalidatePatCache,
} from './http/tokenExchange';
import { createLightdashMcpServer } from './mcp/createMcpServer';
import { httpRequestApiKeyStore } from './lib/requestContext';
import { writeStderrLog } from './lib/stderrLog';
import { ensureContentTypeUtf8Charset } from './http/utf8Charset';
import { buildOAuthProtectedResourceMetadata } from './http/oauthProtectedResourceMetadata';

const patCache = createPatCache();

/** 当前进程内正在处理的 /mcp 请求数（仅观测，非 Session）。 */
let inFlightRequests = 0;

type RequestWithAuth = express.Request & {
    auth?: AuthInfo;
};

function resolveListenPort(): number {
    const port = Number(
        process.env.LIGHTDASH_MCP_HTTP_PORT ?? process.env.PORT ?? 3333,
    );
    if (!Number.isFinite(port) || port <= 0) {
        throw new Error(
            'LIGHTDASH_MCP_HTTP_PORT / PORT must be a positive number',
        );
    }
    return port;
}

function logStartupConfig(config: ReturnType<typeof loadConfigFromEnv>): void {
    const projectLog =
        config.defaultProjectUuid ??
        '(未设置；调用需项目的工具时请在参数中传 projectUuid，或配置 LIGHTDASH_PROJECT_UUID)';
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
        `[Config] KEYCLOAK_REALM_URL=${config.keycloakRealmUrl} | MCP_PUBLIC_URL=${config.mcpPublicUrl}`,
    );
    writeStderrLog(
        `[Config] MCP_OAUTH_AUDIENCE=${config.oauthAudience} | OAUTH_REQUIRED_SCOPES=${oauthScopes}`,
    );
    writeStderrLog(`[Config] LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET_SET=true`);
    writeStderrLog(
        `[Config] MCP_PROTOCOL=2026-07-28 sessionless | legacy=stateless | auth=keycloak`,
    );
}

function emailFromAuthInfo(auth: AuthInfo | undefined): string | undefined {
    const extra = auth?.extra as
        | { email?: unknown; authSubject?: unknown }
        | undefined;
    if (typeof extra?.email === 'string' && extra.email.length > 0) {
        return extra.email;
    }
    return undefined;
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

/** 缺必填 env：只 listen，/health 与 /mcp 返回 503，不拉 Keycloak */
function startDegradedServer(missingEnv: string[]): void {
    const presence = describeRequiredEnvPresence();
    writeStderrLog(
        `[Config] degraded: required env incomplete | ${presence.lines.join(' | ')}`,
        'error',
    );
    writeStderrLog(`[Config] ${missingEnvHint(missingEnv)}`, 'error');

    const body = buildDegradedServiceBody(missingEnv);
    const app = express();
    app.disable('x-powered-by');

    app.get('/health', (_req: express.Request, res: express.Response) => {
        res.status(503).json(body);
    });

    app.all('/mcp', (_req: express.Request, res: express.Response) => {
        res.status(503).json(body);
    });

    const port = resolveListenPort();
    app.listen(port, '0.0.0.0', () => {
        writeStderrLog(
            `Lightdash MCP v2 degraded (missing env, not fetching Keycloak) listening on http://0.0.0.0:${port} — /health and /mcp return 503`,
            'error',
        );
    });
}

async function startFullServer(): Promise<void> {
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

    const resourceServerUrl = new URL(`${config.mcpPublicUrl}/mcp`);
    const resourceMetadataUrl =
        getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
    const oauthMetadata = (await fetchKeycloakOAuthMetadata(
        config.keycloakRealmUrl,
    )) as OAuthMetadata;

    const verifier = createKeycloakTokenVerifier({
        keycloakRealmUrl: config.keycloakRealmUrl,
        audience: config.oauthAudience,
        requiredScopes: config.oauthRequiredScopes,
    });
    const bearerAuth = requireBearerAuth({
        verifier,
        requiredScopes: config.oauthRequiredScopes,
        resourceMetadataUrl,
    });

    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '4mb' }));

    const rootProtectedResourceMetadata =
        buildOAuthProtectedResourceMetadata({
            resourceServerUrl,
            authorizationServerUrl: config.keycloakRealmUrl,
            scopesSupported: config.oauthRequiredScopes,
        });
    app.get(
        '/.well-known/oauth-protected-resource',
        (_req: express.Request, res: express.Response) => {
            res.status(200).json(rootProtectedResourceMetadata);
        },
    );

    app.use(
        mcpAuthMetadataRouter({
            oauthMetadata,
            resourceServerUrl,
        }),
    );

    app.get('/health', (_req: express.Request, res: express.Response) => {
        res.status(200).json({
            ok: true as const,
            package: '@lightdash/mcp-v2',
            protocol: '2026-07-28',
            legacy: 'stateless',
            auth: 'keycloak',
            inFlightRequests,
        });
    });

    app.all(
        '/mcp',
        bearerAuth,
        async (req: RequestWithAuth, res: express.Response) => {
            ensureContentTypeUtf8Charset(res);
            const start = Date.now();
            const ip = resolveClientIp(req);
            let userEmail = 'unknown';
            let maskedKey = '***';
            let authSubject: string | undefined;

            inFlightRequests += 1;
            try {
                const auth = req.auth;
                const email = emailFromAuthInfo(auth);
                if (!email) {
                    res.set(
                        'WWW-Authenticate',
                        `Bearer resource_metadata="${resourceMetadataUrl}"`,
                    );
                    res.status(401).json({
                        error: 'Unauthorized',
                        message:
                            'OAuth token missing email claim for token exchange',
                    });
                    return;
                }
                userEmail = email;
                authSubject =
                    typeof auth?.extra?.authSubject === 'string'
                        ? auth.extra.authSubject
                        : auth?.clientId;

                const pat = await getOrExchangePat({
                    cache: patCache,
                    baseUrl: config.baseUrl,
                    tokenExchangeSecret: config.tokenExchangeSecret,
                    email,
                });
                maskedKey = maskApiKey(pat.accessToken);

                const refreshApiKey = async (): Promise<string> => {
                    invalidatePatCache(patCache, email);
                    const next = await getOrExchangePat({
                        cache: patCache,
                        baseUrl: config.baseUrl,
                        tokenExchangeSecret: config.tokenExchangeSecret,
                        email,
                        forceRefresh: true,
                    });
                    maskedKey = maskApiKey(next.accessToken);
                    return next.accessToken;
                };

                await httpRequestApiKeyStore.run(
                    {
                        apiKey: pat.accessToken,
                        authType: 'keycloak',
                        oauthAccessToken: auth?.token,
                        oauthScopes: auth?.scopes ?? [],
                        authSubject,
                        userEmail,
                        maskedKey,
                        refreshApiKey,
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
                    message.includes('token-exchange failed with network') ||
                    message.includes('Failed to fetch Keycloak')
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
                    message.includes('Keycloak JWT') ||
                    message.includes('OAuth token') ||
                    message.includes('token-exchange') ||
                    message.includes('missing required scopes') ||
                    message.includes('missing email');
                if (isAuthError) {
                    if (!res.headersSent) {
                        res.set(
                            'WWW-Authenticate',
                            `Bearer resource_metadata="${resourceMetadataUrl}"`,
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
                    status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug',
                );
            }
        },
    );

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
                    'warn',
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
                'error',
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

    const port = resolveListenPort();
    app.listen(port, '0.0.0.0', () => {
        writeStderrLog(
            `Lightdash MCP v2 (2026-07-28 sessionless, Keycloak OAuth) listening on http://0.0.0.0:${port}/mcp`,
        );
    });
}

async function main(): Promise<void> {
    const missingEnv = listMissingRequiredEnv();
    if (missingEnv.length > 0) {
        startDegradedServer(missingEnv);
        return;
    }
    await startFullServer();
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    writeStderrLog(msg, 'error');
    process.exit(1);
});
