/* eslint-disable @typescript-eslint/naming-convention */
import {
    generateOAuthAuthorizePage,
    generateOAuthDevicePage,
    generateOAuthErrorResponse,
    generateOAuthRedirectPage,
    generateOAuthSuccessResponse,
    getErrorMessage,
    OAuthIntrospectResponse,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import express from 'express';
import Logger from '../logging/logger';
import {
    DEFAULT_OAUTH_CLIENT_ID,
    DeviceCodeSession,
} from '../models/OAuth2Model';
import {
    DEVICE_CODE_TTL_MS,
    DEVICE_POLL_INTERVAL_SECONDS,
    MCP_SUPPORTED_SCOPES,
    OAuthScope,
    OAuthService,
} from '../services/OAuthService/OAuthService';

const oauthRouter = express.Router({ mergeParams: true });

// Get OAuth service from request
function getOAuthService(req: express.Request): OAuthService {
    return req.services.getOauthService();
}

// Get authorization - use OAuth2Server
oauthRouter.get('/authorize', async (req, res, next) => {
    if (!req.user) {
        const loginUrl = `/login?redirect=${encodeURIComponent(
            req.originalUrl || req.url,
        )}`;
        return res.redirect(loginUrl);
    }
    const {
        client_id,
        redirect_uri,
        scope,
        state,
        code_challenge,
        code_challenge_method,
    } = req.query;
    if (!client_id || !redirect_uri) {
        return res.status(400).send('Missing required parameters');
    }

    // Render authorize page using Handlebars template
    res.set('Content-Type', 'text/html');
    return res.send(
        generateOAuthAuthorizePage({
            action: '/api/v1/oauth/authorize',
            client_id: client_id as string,
            scope: scope as string,
            user: {
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                organizationName: req.user.organizationName!,
            },
            hiddenInputs: [
                {
                    name: 'response_type',
                    value: (req.query.response_type ||
                        req.body.response_type ||
                        'code') as string,
                },
                {
                    name: 'client_id',
                    value: client_id as string,
                },
                {
                    name: 'redirect_uri',
                    value: redirect_uri as string,
                },
                {
                    name: 'scope',
                    value: scope as string,
                },
                {
                    name: 'state',
                    value: (state || '') as string,
                },
                {
                    name: 'code_challenge',
                    value: (code_challenge || '') as string,
                },
                {
                    name: 'code_challenge_method',
                    value: (code_challenge_method || '') as string,
                },
            ],
        }),
    );
});

oauthRouter.post('/authorize', async (req, res) => {
    if (req.body.approve === 'false') {
        // Denied
        res.set('Content-Type', 'text/html');
        const redirectUri = req.body.redirect_uri;
        if (!redirectUri) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing redirect_uri',
            });
        }
        const url = new URL(redirectUri);
        url.searchParams.set('error', 'access_denied');
        if (req.body.state) {
            url.searchParams.set('state', req.body.state);
        }
        return res.send(
            generateOAuthRedirectPage({
                redirectUrl: url.toString(),
                message:
                    'Access denied. Redirecting you back to your application...',
            }),
        );
    }
    if (!req.user) {
        return res.status(401).send('Unauthorized');
    }
    if (!req.user.userId || !req.user.organizationUuid) {
        return res.status(400).send('Missing userUuid or organizationUuid');
    }

    // Normalize scope parameter directly on the request object
    if (req.body.scope && Array.isArray(req.body.scope)) {
        req.body.scope = req.body.scope.join(' ');
    }
    if (req.query.scope && Array.isArray(req.query.scope)) {
        req.query.scope = req.query.scope.join(' ');
    }

    const oauthService = getOAuthService(req);
    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);
    try {
        const authorizationCode = await oauthService.authorize(
            oauthReq,
            oauthRes,
            {
                userId: req.user.userId,
                organizationUuid: req.user.organizationUuid,
            },
        );
        const redirectUri = req.body.redirect_uri;
        if (!redirectUri) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing redirect_uri',
            });
        }
        const url = new URL(redirectUri);
        url.searchParams.set('code', authorizationCode.authorizationCode);
        if (req.body.state) {
            url.searchParams.set('state', req.body.state);
        }

        res.set('Content-Type', 'text/html');
        return res.send(
            generateOAuthRedirectPage({
                redirectUrl: url.toString(),
                message: 'Redirecting you back to your application...',
            }),
        );
    } catch (error) {
        Logger.error(`Authorization error: ${error}`);
        const redirectUrl = new URL(req.body.redirect_uri);
        redirectUrl.searchParams.set('error', 'server_error');
        if (req.body.state)
            redirectUrl.searchParams.set('state', req.body.state);
        res.set('Content-Type', 'text/html');
        return res.send(
            generateOAuthRedirectPage({
                redirectUrl: redirectUrl.toString(),
                message:
                    'An error occurred. Redirecting you back to your application...',
            }),
        );
    }
});

// Post token - use OAuth2Server
oauthRouter.post('/token', async (req, res, next) => {
    const oauthService = getOAuthService(req);

    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);

    try {
        const token = await oauthService.token(oauthReq, oauthRes);
        res.json({
            access_token: token.accessToken,
            token_type: 'Bearer',
            expires_in: token.accessTokenExpiresAt
                ? Math.floor(
                      (token.accessTokenExpiresAt.getTime() - Date.now()) /
                          1000,
                  )
                : undefined,
            refresh_token: token.refreshToken,
            scope: Array.isArray(token.scope)
                ? token.scope.join(' ')
                : token.scope,
        });
    } catch (error) {
        Logger.error(`Token endpoint error: ${error}`);
        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

        // Return 401 for authentication errors, 400 for other errors
        const statusCode =
            errorMessage.includes('Invalid') ||
            errorMessage.includes('required')
                ? 401
                : 400;
        res.status(statusCode).json({ error: errorMessage });
    }
});

// Token introspection endpoint
oauthRouter.post('/introspect', async (req, res) => {
    const { token } = req.body;

    if (!req.user) {
        return res.status(401).json({ error: 'invalid_request' });
    }
    if (!token) {
        return res.status(400).json({ error: 'invalid_request' });
    }

    try {
        const oauthService = getOAuthService(req);
        const oauthReq = new OAuth2Server.Request(req);
        const oauthRes = new OAuth2Server.Response(res);

        // Try to authenticate the token
        const tokenData = await oauthService.authenticate(oauthReq, oauthRes);
        if (tokenData && tokenData.accessTokenExpiresAt) {
            const introspectResponse: OAuthIntrospectResponse = {
                active: true,
                scope: Array.isArray(tokenData.scope)
                    ? tokenData.scope.join(' ')
                    : tokenData.scope,
                token_type: 'access_token',
                exp: Math.floor(
                    tokenData.accessTokenExpiresAt.getTime() / 1000, // Token expires timestamp
                ),
                iat: Math.floor(
                    tokenData.accessTokenExpiresAt.getTime() / 1000 - 3600, // issued at: token cretaed timestamp
                ),
                sub: tokenData.user.userUuid, // subject: Unique user identifier
                aud: tokenData.client.id, // audience: Client identifier
                iss: 'lightdash', // issuer
                jti: tokenData.accessToken, // JWT ID: Unique token identifier
                client_id: DEFAULT_OAUTH_CLIENT_ID,
                username: tokenData.user.userUuid,
            };
            return res.json(introspectResponse);
        }

        return res.json({ active: false });
    } catch (error) {
        Logger.error(`Introspection error: ${error}`);
        return res.json({ active: false });
    }
});

// Token revocation endpoint
oauthRouter.post('/revoke', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'invalid_request' });
    }

    try {
        const oauthService = getOAuthService(req);
        await oauthService.revokeToken(token);
    } catch (error) {
        Logger.error(`Revocation error: ${error}`);
    }
    return res.status(200).send();
});

// Dynamic Client Registration endpoint (RFC 7591)
// This endpoint is used to register a new OAuth client
// to be used with the MCP server
// Scopes and grant types are hardcoded for now
oauthRouter.post('/register', async (req, res) => {
    try {
        const { client_name, redirect_uris, scope, grantTypes } = req.body;

        Logger.info(
            `Registering Oauth client ${client_name} with redirect_uris ${redirect_uris} and scopes ${scope}`,
        );

        // Validate required fields
        if (!client_name || !redirect_uris || !Array.isArray(redirect_uris)) {
            return res.status(400).json({
                error: 'invalid_client_metadata',
                error_description: 'client_name and redirect_uris are required',
            });
        }

        const requestedScopes = (
            typeof scope === 'string' ? scope.split(' ') : []
        ).filter((sc) => sc.length > 0);
        /*
        Only MCP scopes are supported. Unknown scopes are dropped and, when no
        valid scope is requested, the client gets the default read scope.
        */
        const scopes = requestedScopes.filter((sc) =>
            MCP_SUPPORTED_SCOPES.includes(sc),
        );
        if (scopes.length === 0) {
            scopes.push(OAuthScope.MCP_READ);
        }
        if (scopes.length !== requestedScopes.length) {
            Logger.warn(
                `Ignoring unsupported scopes for Oauth client ${client_name}: requested ${requestedScopes.join(
                    ' ',
                )}`,
            );
        }

        const client = await getOAuthService(req).registerClient({
            clientName: client_name,
            redirectUris: redirect_uris,
            grantTypes,
            scopes,
        });

        return res.status(201).json({
            client_id: client.clientId,
            client_secret: client.clientSecret,
            client_name: client.clientName,
            redirect_uris: client.redirectUris,
            grant_types: client.grantTypes,
            scope: client.scopes.join(' '),
            client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        });
    } catch (error) {
        Logger.error(`Client registration error: ${getErrorMessage(error)}`);
        return res.status(500).json({
            error: 'server_error',
            error_description:
                'Internal server error during client registration',
        });
    }
});

// OAuth2 Discovery endpoint
// This endpoint should only be used for the MCP server to discover the OAuth2 server
// To create new clients
// We limit the scopes to MCP_READ and MCP_WRITE for now
export function oauthConfig(baseUrl: string) {
    return {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/api/v1/oauth/authorize`,
        token_endpoint: `${baseUrl}/api/v1/oauth/token`,
        introspection_endpoint: `${baseUrl}/api/v1/oauth/introspect`,
        revocation_endpoint: `${baseUrl}/api/v1/oauth/revoke`,
        registration_endpoint: `${baseUrl}/api/v1/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: [
            'authorization_code',
            'refresh_token',
            'client_credentials',
        ],
        token_endpoint_auth_methods_supported: [
            'client_secret_basic',
            'client_secret_post',
        ],
        code_challenge_methods_supported: ['S256', 'plain'],
        scopes_supported: [OAuthScope.MCP_READ, OAuthScope.MCP_WRITE],
        pkce_required: false, // PKCE is optional but recommended
    };
}

// Export the handler for reuse at root level
export const oauthAuthorizationServerHandler = (
    req: express.Request,
    res: express.Response,
) => {
    const baseUrl = getOAuthService(req).getSiteUrl();
    res.json(oauthConfig(baseUrl));
};

oauthRouter.get(
    '/.well-known/oauth-authorization-server',
    oauthAuthorizationServerHandler,
);

// MCP server discovery endpoint
// This endpoint is used to discover the MCP server
// Required by some tools
oauthRouter.get(
    '/.well-known/oauth-authorization-server/api/v1/mcp',
    oauthAuthorizationServerHandler,
);

// OAuth2 Protected Resource configuration
export function oauthProtectedResourceConfig(baseUrl: string) {
    return {
        resource: `${baseUrl}/api/v1/mcp`,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ['header'],
        scopes_supported: [OAuthScope.MCP_READ, OAuthScope.MCP_WRITE],
        resource_documentation: `${baseUrl}/api/v1/oauth/.well-known/oauth-authorization-server`,
        introspection_endpoint: `${baseUrl}/api/v1/oauth/introspect`,
        revocation_endpoint: `${baseUrl}/api/v1/oauth/revoke`,
    };
}

// OAuth2 Protected Resource Discovery endpoint
// This endpoint provides metadata about the protected resource server
// This will be requested by the MCP client if authentication fails,
// The endpoint is provided by the returnHeaderIfUnauthenticated method in mcpRouter.ts
// Export the handler for reuse at root level
export const oauthProtectedResourceHandler = (
    req: express.Request,
    res: express.Response,
) => {
    const baseUrl = getOAuthService(req).getSiteUrl();
    res.json(oauthProtectedResourceConfig(baseUrl));
};

oauthRouter.get(
    '/.well-known/oauth-protected-resource',
    oauthProtectedResourceHandler,
);

// MCP server protected resource discovery endpoint
// This endpoint is used to discover the protected resource for MCP
// Required by some MCP clients
oauthRouter.get(
    '/.well-known/oauth-protected-resource/api/v1/mcp',
    oauthProtectedResourceHandler,
);

/* -------------------------------------------------------------------------
 * Device flow (RFC 8628) — browserless / QR login for the CLI.
 *
 *   CLI                                  Lightdash
 *   |-- POST /device ------------------>| create device_code + user_code
 *   |<-- verification_uri(_complete) ---|
 *   |   (renders QR in terminal)        |
 *   |   user scans QR on phone  ------> | GET /device/activate (session)
 *   |                                   | POST /device/activate (approve)
 *   |-- POST /device/token (polling) -->|
 *   |<-- authorization_pending ---------| until approved
 *   |<-- access_token ------------------| then CLI swaps it for a PAT
 *
 * Device sessions live in Postgres (oauth2_device_codes): production runs
 * multiple replicas behind a headless Service, so the replica serving the
 * CLI's polling is not necessarily the one the phone's activation request
 * hits — process memory cannot bridge the two. Tokens themselves are
 * persisted in the oauth2_access_tokens table like any other token.
 * ---------------------------------------------------------------------- */

const isExpired = (session: DeviceCodeSession): boolean =>
    session.expiresAt.getTime() < Date.now();

const getVerificationUri = (req: express.Request): string =>
    `${getOAuthService(req)
        .getSiteUrl()
        .replace(/\/+$/, '')}/api/v1/oauth/device/activate`;

// 1. CLI requests a device code (public endpoint, no session)
oauthRouter.post('/device', async (req, res, next) => {
    try {
        const clientId = req.body?.client_id || DEFAULT_OAUTH_CLIENT_ID;
        // Only public CLI clients pre-registered in oauth2_clients may use the
        // device flow (lightdash-cli / msy-x-cli). DCR-registered clients are
        // tied to a loopback redirect and must use the browser flow.
        const allowedDeviceClients = [DEFAULT_OAUTH_CLIENT_ID, 'msy-x-cli'];
        if (!allowedDeviceClients.includes(clientId)) {
            res.status(400).json({
                error: 'unauthorized_client',
                error_description: `Device flow is restricted to known CLI clients`,
            });
            return;
        }

        const oauthService = getOAuthService(req);
        // Sweep expired rows first (abuse guard mirrors the old in-memory sweep)
        await oauthService.deleteExpiredDeviceCodes();
        if (await oauthService.isDeviceFlowAtCapacity()) {
            Logger.warn(
                'OAuth device session store full; rejecting new request',
            );
            res.status(429).json({
                error: 'slow_down',
                error_description:
                    'Too many pending device logins, retry later',
            });
            return;
        }

        const session = await oauthService.createDeviceCodeSession(clientId);
        const verificationUri = getVerificationUri(req);
        res.status(200).json({
            device_code: session.deviceCode,
            user_code: session.userCode,
            verification_uri: verificationUri,
            verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(
                session.userCode,
            )}`,
            expires_in: DEVICE_CODE_TTL_MS / 1000,
            interval: DEVICE_POLL_INTERVAL_SECONDS,
        });
    } catch (error) {
        if (!res.headersSent) next(error);
    }
});

// 2. User opens this page (by scanning the QR or typing the URL) and
//    approves the terminal login. Requires a browser session.
oauthRouter.get('/device/activate', async (req, res, next) => {
    try {
        if (!req.user) {
            const loginUrl = `/login?redirect=${encodeURIComponent(
                req.originalUrl || req.url,
            )}`;
            res.redirect(loginUrl);
            return;
        }
        const userCode = String(req.query.user_code || '').toUpperCase();
        const oauthService = getOAuthService(req);
        const session = userCode
            ? await oauthService.getDeviceCodeSessionByUserCode(userCode)
            : null;
        if (!session) {
            res.status(400);
            res.send(
                generateOAuthErrorResponse('Invalid Code', [
                    `The code "${userCode}" is not valid.`,
                    'Check the code shown in your terminal and try again.',
                ]),
            );
            return;
        }
        if (isExpired(session)) {
            await oauthService.deleteDeviceCode(session.deviceCode);
            res.status(400);
            res.send(
                generateOAuthErrorResponse('Code Expired', [
                    'This code has expired.',
                    'Run the login command again in your terminal to get a new code.',
                ]),
            );
            return;
        }
        if (session.status !== 'pending') {
            res.status(400);
            res.send(
                generateOAuthErrorResponse('Code Already Used', [
                    'This code has already been used.',
                    'Run the login command again in your terminal to get a new code.',
                ]),
            );
            return;
        }

        res.set('Content-Type', 'text/html');
        res.send(
            generateOAuthDevicePage({
                action: '/api/v1/oauth/device/activate',
                userCode: session.userCode,
                user: {
                    firstName: req.user.firstName,
                    lastName: req.user.lastName,
                    organizationName: req.user.organizationName!,
                },
                hiddenInputs: [{ name: 'user_code', value: session.userCode }],
            }),
        );
    } catch (error) {
        if (!res.headersSent) next(error);
    }
});

// 3. Confirm (or deny) the terminal login (session-protected)
oauthRouter.post('/device/activate', async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(401).send('Unauthorized');
            return;
        }
        if (!req.user.userId || !req.user.organizationUuid) {
            res.status(400).send('Missing userUuid or organizationUuid');
            return;
        }
        const userCode = String(req.body?.user_code || '').toUpperCase();
        const oauthService = getOAuthService(req);
        const session = userCode
            ? await oauthService.getDeviceCodeSessionByUserCode(userCode)
            : null;
        if (!session || isExpired(session)) {
            if (session)
                await oauthService.deleteDeviceCode(session.deviceCode);
            res.status(400);
            res.send(
                generateOAuthErrorResponse('Invalid Code', [
                    'The code is invalid or has expired.',
                    'Run the login command again in your terminal to get a new code.',
                ]),
            );
            return;
        }
        if (session.status !== 'pending') {
            res.status(400);
            res.send(
                generateOAuthErrorResponse('Code Already Used', [
                    'This code has already been used.',
                ]),
            );
            return;
        }

        if (req.body?.approve === 'false') {
            const denied = await oauthService.denyDeviceCode(
                session.deviceCode,
            );
            if (denied) {
                Logger.info(
                    `OAuth device login denied for client ${session.clientId}`,
                );
            }
            res.status(200);
            res.send(
                generateOAuthErrorResponse('Access Denied', [
                    'You denied the terminal login request.',
                    'You can close this window and return to the CLI.',
                ]),
            );
            return;
        }

        const approved = await oauthService.approveDeviceCode({
            deviceCode: session.deviceCode,
            userId: req.user.userId,
            organizationUuid: req.user.organizationUuid,
        });
        if (!approved) {
            // Another request (or replica) resolved this code first
            res.status(400);
            res.send(
                generateOAuthErrorResponse('Code Already Used', [
                    'This code has already been used.',
                ]),
            );
            return;
        }
        Logger.info(
            `OAuth device login approved for client ${session.clientId}`,
        );
        res.set('Content-Type', 'text/html');
        res.send(
            generateOAuthSuccessResponse('Terminal Login Approved!', [
                'You can close this window and return to your terminal.',
                'The login will complete automatically within a few seconds.',
            ]),
        );
    } catch (error) {
        if (!res.headersSent) next(error);
    }
});

// 4. CLI polls for the token (public endpoint, RFC 8628 token errors)
oauthRouter.post('/device/token', async (req, res, next) => {
    try {
        const grantType = 'urn:ietf:params:oauth:grant-type:device_code';
        if (req.body?.grant_type !== grantType) {
            res.status(400).json({
                error: 'unsupported_grant_type',
                error_description: `Use grant_type=${grantType}`,
            });
            return;
        }
        const deviceCode = String(req.body?.device_code || '');
        const oauthService = getOAuthService(req);
        const session = await oauthService.getDeviceCodeSessionByDeviceCode(
            deviceCode,
        );
        if (!session) {
            res.status(400).json({ error: 'invalid_grant' });
            return;
        }
        if (isExpired(session)) {
            await oauthService.deleteDeviceCode(deviceCode);
            res.status(400).json({ error: 'expired_token' });
            return;
        }
        if (session.status === 'denied') {
            await oauthService.deleteDeviceCode(deviceCode);
            res.status(400).json({ error: 'access_denied' });
            return;
        }
        if (session.status === 'pending') {
            res.status(400).json({ error: 'authorization_pending' });
            return;
        }
        if (session.status === 'consumed') {
            // A concurrent poll won the consume race and already redeemed
            // the session
            res.status(400).json({ error: 'invalid_grant' });
            return;
        }

        // one-time use: consume before minting so a concurrent poll can
        // never redeem the same session twice
        const consumed = await oauthService.consumeDeviceCode(deviceCode);
        if (!consumed) {
            res.status(400).json({ error: 'invalid_grant' });
            return;
        }
        try {
            const token = await oauthService.createDeviceToken({
                clientId: consumed.clientId,
                userId: consumed.userId!,
                organizationUuid: consumed.organizationUuid!,
            });
            res.json({
                access_token: token.accessToken,
                token_type: 'Bearer',
                expires_in: Math.floor(
                    (token.accessTokenExpiresAt.getTime() - Date.now()) / 1000,
                ),
                refresh_token: token.refreshToken,
                scope: token.scope.join(' '),
            });
        } catch (error) {
            // Minting failed after the session was consumed: flip it back to
            // 'authorized' (best-effort compensation) so the CLI can retry
            // polling instead of having to re-scan the QR code.
            Logger.error(`Device token endpoint error: ${error}`);
            try {
                await oauthService.releaseDeviceCode(deviceCode);
            } catch (releaseError) {
                Logger.error(
                    `Failed to release device code after token error: ${releaseError}`,
                );
            }
            res.status(500).json({ error: 'server_error' });
        }
    } catch (error) {
        if (!res.headersSent) next(error);
    }
});

export default oauthRouter;
