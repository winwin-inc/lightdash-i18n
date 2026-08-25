/**
 * 独立 MCP 服务：Streamable HTTP。
 * 客户端 .mcp.json 使用 type + url + headers，无需本地 node args。
 */
import express from 'express';
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
import {
    createMcpSessionRegistry,
    hashMcpSessionOwnerKey,
    McpSessionCapacityError,
    type McpSessionEntry,
} from './http/mcpSessionRegistry';
import {
    formatSessionMissingReason,
    parseMcpSessionIdHeader,
    resolveSessionRoute,
    type SessionMissingReason,
} from './http/sessionRouting';
import {
    httpRequestApiKeyStore,
} from './lib/requestContext';

const authCache = createAuthCache();
const oauthCache = createOauthCache();

function logStartupConfig(config: ReturnType<typeof loadConfigFromEnv>): void {
    const projectLog =
        config.defaultProjectUuid ??
        '(未设置；调用需项目的工具前请先 set_project 或在工具参数传 projectUuid)';
    const hasApiKey = Boolean(config.apiKey && config.apiKey.length > 0);
    const oauthScopes =
        config.oauthRequiredScopes.length > 0
            ? config.oauthRequiredScopes.join(',')
            : '(empty)';
    process.stderr.write(
        `[Config] @lightdash/mcp=${getMcpPackageVersion()} | LIGHTDASH_SITE_URL=${config.baseUrl}\n` +
            `[Config] LIGHTDASH_PROJECT_UUID=${projectLog} | LIGHTDASH_MAX_LIMIT=${config.maxLimit}\n` +
            `[Config] MCP_OAUTH_ENABLED=${config.oauthEnabled} | OAUTH_REQUIRED_SCOPES=${oauthScopes}\n` +
            `[Config] OAUTH_RESOURCE_METADATA_URL=${config.oauthResourceMetadataUrl}\n` +
            `[Config] OAUTH_INTROSPECT_URL=${config.oauthIntrospectUrl} | LIGHTDASH_API_KEY_SET=${hasApiKey}\n` +
            `[Config] LIGHTDASH_MCP_MAX_SESSIONS=${config.maxSessions} | SESSION_TTL_MS=${config.sessionTtlMs} | PRUNE_INTERVAL_MS=${config.pruneIntervalMs}\n`,
    );
}

function handleSessionNotFound(
    res: express.Response,
    reason: SessionMissingReason,
    sessionHeader: string | undefined,
    userEmail: string,
): void {
    const sessionTag = sessionHeader
        ? ` | session=${sessionHeader.slice(0, 8)}...`
        : '';
    process.stderr.write(
        `[McpSession] 404 ${formatSessionMissingReason(reason)}${sessionTag} | ${userEmail}\n`,
    );
    res.status(404).json({
        error: 'Session not found',
        hint: 'Send POST initialize without Mcp-Session-Id to start a new session, or POST tools/call without Session-Id for legacy compat mode',
    });
}

function formatSessionLogTags(options: {
    sessionHeader: string | undefined;
    compat: boolean;
}): string {
    const parts: string[] = [];
    if (options.compat) {
        parts.push('compat=1');
    }
    if (options.sessionHeader) {
        parts.push(`session=${options.sessionHeader.slice(0, 8)}...`);
    }
    return parts.length > 0 ? ` | ${parts.join(' | ')}` : '';
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
    const sessionRegistry = createMcpSessionRegistry(config, {
        maxSessions: config.maxSessions,
        sessionTtlMs: config.sessionTtlMs,
        exploreCache,
    });

    const pruneTimer = setInterval(() => {
        void sessionRegistry.pruneIdleSessions().then((pruned) => {
            exploreCache.pruneExpired();
            if (pruned > 0) {
                process.stderr.write(
                    `[McpSession] scheduled prune complete | active=${sessionRegistry.getActiveCount()} compat=${sessionRegistry.getCompatCount()}\n`,
                );
            }
        });
    }, config.pruneIntervalMs);
    pruneTimer.unref();

    const shutdown = (): void => {
        clearInterval(pruneTimer);
        void sessionRegistry.closeAll().finally(() => {
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
            activeSessions: sessionRegistry.getActiveCount(),
            pendingSessions: sessionRegistry.getPendingCount(),
            compatSessions: sessionRegistry.getCompatCount(),
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
        const sessionHeader = parseMcpSessionIdHeader(
            req.headers['mcp-session-id'],
        );
        let usedCompat = false;

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

            const ownerKey = hashMcpSessionOwnerKey(effectiveKey, authSubject);

            const route = resolveSessionRoute(
                sessionRegistry,
                req.method,
                req.body,
                sessionHeader,
                ownerKey,
            );
            let sessionEntry: McpSessionEntry | undefined;
            if (route.kind === 'initialize') {
                try {
                    sessionEntry =
                        await sessionRegistry.createPendingSession(ownerKey);
                } catch (error) {
                    if (error instanceof McpSessionCapacityError) {
                        res.status(503).json({
                            error: 'Too many active MCP sessions, retry later',
                            maxSessions: config.maxSessions,
                        });
                        return;
                    }
                    throw error;
                }
            } else if (route.kind === 'compat') {
                usedCompat = true;
                try {
                    sessionEntry =
                        await sessionRegistry.getOrCreateCompatSession(ownerKey);
                } catch (error) {
                    if (error instanceof McpSessionCapacityError) {
                        res.status(503).json({
                            error: 'Too many active MCP sessions, retry later',
                            maxSessions: config.maxSessions,
                        });
                        return;
                    }
                    throw error;
                }
            } else if (route.kind === 'missing') {
                handleSessionNotFound(
                    res,
                    route.reason,
                    sessionHeader,
                    userEmail,
                );
                return;
            } else {
                sessionEntry = route.entry;
            }

            if (
                req.method === 'GET' &&
                sessionEntry.kind === 'stateful' &&
                sessionEntry.sessionId !== null &&
                sessionEntry.sessionId !== undefined
            ) {
                const sessionIdForLease = sessionEntry.sessionId;
                sessionRegistry.acquireSseLease(sessionIdForLease);
                res.once('close', () => {
                    sessionRegistry.releaseSseLease(sessionIdForLease);
                });
            }

            const releaseRequestLease =
                sessionRegistry.acquireRequestLease(sessionEntry);
            try {
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
                        sessionEntry!.transport.handleRequest(
                            req,
                            res,
                            req.method === 'POST' ? req.body : undefined,
                        ),
                );
            } finally {
                releaseRequestLease();
                if (
                    sessionEntry &&
                    sessionEntry.kind === 'stateful' &&
                    sessionEntry.sessionId === null &&
                    route.kind === 'initialize'
                ) {
                    await sessionRegistry.abortPendingSession(sessionEntry);
                }
            }
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
            const sessionTag = formatSessionLogTags({
                sessionHeader,
                compat: usedCompat,
            });
            if (status === 409) {
                process.stderr.write(
                    `[McpSse] 409 conflict${sessionTag} | activeSessions=${sessionRegistry.getActiveCount()} | ${userEmail}\n`,
                );
            }
            process.stderr.write(
                `[RequestLog] [Request] ${req.method} ${req.path} | ip: ${ip} | key: ${maskedKey} | ${status} | ${elapsed}ms${statusTag}${sessionTag} | ${userEmail}\n`,
            );
        }
    });

    // express.json 在进入 /mcp 之前失败时，默认会打出 SyntaxError 堆栈并返回 HTML 400。
    // 这里改成一行 RequestLog + 结构化 JSON，避免把客户端坏请求误当成服务端异常。
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
                process.stderr.write(
                    `[RequestLog] [Request] ${req.method} ${req.path} | ip: ${ip} | key: *** | 400 | 0ms | error(400) | invalid_json_body | ${message}\n`,
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
            process.stderr.write(
                `[RequestLog] [Request] ${req.method} ${req.path} | ip: ${ip} | key: *** | 500 | 0ms | error(500) | unhandled | ${message}\n`,
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
