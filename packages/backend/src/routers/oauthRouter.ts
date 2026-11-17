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
import { randomBytes } from 'crypto';
import express from 'express';
import Logger from '../logging/logger';
import { DEFAULT_OAUTH_CLIENT_ID } from '../models/OAuth2Model';
import {
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
 * Device sessions live in memory: they only bridge a 10-minute login,
 * and the backend runs as a single instance. Tokens themselves are
 * persisted in the oauth2_access_tokens table like any other token.
 * ---------------------------------------------------------------------- */

const DEVICE_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEVICE_POLL_INTERVAL_SECONDS = 5;
// Cap on concurrent device sessions (memory abuse guard on the public
// POST /device endpoint); oldest expired entries are swept first.
const DEVICE_MAX_SESSIONS = 10_000;
// Alphabet without ambiguous characters (0/O, 1/I)
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type DeviceSession = {
    deviceCode: string;
    userCode: string;
    clientId: string;
    status: 'pending' | 'authorized' | 'denied';
    userId?: number;
    organizationUuid?: string;
    expiresAt: number;
};

const deviceSessions = new Map<string, DeviceSession>();

const generateUserCode = (): string => {
    const bytes = randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i += 1) {
        code += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
    }
    return `${code.slice(0, 4)}-${code.slice(4)}`;
};

const findDeviceSessionByUserCode = (
    userCode: string,
): DeviceSession | undefined =>
    [...deviceSessions.values()].find(
        (session) => session.userCode === userCode.toUpperCase(),
    );

const isExpired = (session: DeviceSession): boolean =>
    session.expiresAt < Date.now();

/** Drops expired sessions; returns true if anything was swept. */
const sweepExpiredDeviceSessions = (): boolean => {
    let swept = false;
    for (const [deviceCode, session] of deviceSessions) {
        if (isExpired(session)) {
            deviceSessions.delete(deviceCode);
            swept = true;
        }
    }
    return swept;
};

const getVerificationUri = (req: express.Request): string =>
    `${getOAuthService(req)
        .getSiteUrl()
        .replace(/\/+$/, '')}/api/v1/oauth/device/activate`;

// 1. CLI requests a device code (public endpoint, no session)
oauthRouter.post('/device', async (req, res) => {
    const clientId = req.body?.client_id || DEFAULT_OAUTH_CLIENT_ID;
    // Only public CLI clients pre-registered in oauth2_clients may use the
    // device flow (lightdash-cli / msy-x-cli). DCR-registered clients are
    // tied to a loopback redirect and must use the browser flow.
    const allowedDeviceClients = [DEFAULT_OAUTH_CLIENT_ID, 'msy-x-cli'];
    if (!allowedDeviceClients.includes(clientId)) {
        return res.status(400).json({
            error: 'unauthorized_client',
            error_description: `Device flow is restricted to known CLI clients`,
        });
    }

    sweepExpiredDeviceSessions();
    if (deviceSessions.size >= DEVICE_MAX_SESSIONS) {
        Logger.warn('OAuth device session store full; rejecting new request');
        return res.status(429).json({
            error: 'slow_down',
            error_description: 'Too many pending device logins, retry later',
        });
    }

    const deviceCode = randomBytes(32).toString('base64url');
    const userCode = generateUserCode();
    deviceSessions.set(deviceCode, {
        deviceCode,
        userCode,
        clientId,
        status: 'pending',
        expiresAt: Date.now() + DEVICE_CODE_TTL_MS,
    });

    const verificationUri = getVerificationUri(req);
    return res.status(200).json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: verificationUri,
        verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(
            userCode,
        )}`,
        expires_in: DEVICE_CODE_TTL_MS / 1000,
        interval: DEVICE_POLL_INTERVAL_SECONDS,
    });
});

// 2. User opens this page (by scanning the QR or typing the URL) and
//    approves the terminal login. Requires a browser session.
oauthRouter.get('/device/activate', async (req, res) => {
    if (!req.user) {
        const loginUrl = `/login?redirect=${encodeURIComponent(
            req.originalUrl || req.url,
        )}`;
        return res.redirect(loginUrl);
    }
    const userCode = String(req.query.user_code || '').toUpperCase();
    const session = userCode
        ? findDeviceSessionByUserCode(userCode)
        : undefined;
    if (!session) {
        res.status(400);
        return res.send(
            generateOAuthErrorResponse('Invalid Code', [
                `The code "${userCode}" is not valid.`,
                'Check the code shown in your terminal and try again.',
            ]),
        );
    }
    if (isExpired(session)) {
        deviceSessions.delete(session.deviceCode);
        res.status(400);
        return res.send(
            generateOAuthErrorResponse('Code Expired', [
                'This code has expired.',
                'Run the login command again in your terminal to get a new code.',
            ]),
        );
    }
    if (session.status !== 'pending') {
        res.status(400);
        return res.send(
            generateOAuthErrorResponse('Code Already Used', [
                'This code has already been used.',
                'Run the login command again in your terminal to get a new code.',
            ]),
        );
    }

    res.set('Content-Type', 'text/html');
    return res.send(
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
});

// 3. Confirm (or deny) the terminal login (session-protected)
oauthRouter.post('/device/activate', async (req, res) => {
    if (!req.user) {
        return res.status(401).send('Unauthorized');
    }
    if (!req.user.userId || !req.user.organizationUuid) {
        return res.status(400).send('Missing userUuid or organizationUuid');
    }
    const userCode = String(req.body?.user_code || '').toUpperCase();
    const session = userCode
        ? findDeviceSessionByUserCode(userCode)
        : undefined;
    if (!session || isExpired(session)) {
        if (session) deviceSessions.delete(session.deviceCode);
        res.status(400);
        return res.send(
            generateOAuthErrorResponse('Invalid Code', [
                'The code is invalid or has expired.',
                'Run the login command again in your terminal to get a new code.',
            ]),
        );
    }
    if (session.status !== 'pending') {
        res.status(400);
        return res.send(
            generateOAuthErrorResponse('Code Already Used', [
                'This code has already been used.',
            ]),
        );
    }

    if (req.body?.approve === 'false') {
        session.status = 'denied';
        res.status(200);
        return res.send(
            generateOAuthErrorResponse('Access Denied', [
                'You denied the terminal login request.',
                'You can close this window and return to the CLI.',
            ]),
        );
    }

    session.status = 'authorized';
    session.userId = req.user.userId;
    session.organizationUuid = req.user.organizationUuid;
    res.set('Content-Type', 'text/html');
    return res.send(
        generateOAuthSuccessResponse('Terminal Login Approved!', [
            'You can close this window and return to your terminal.',
            'The login will complete automatically within a few seconds.',
        ]),
    );
});

// 4. CLI polls for the token (public endpoint, RFC 8628 token errors)
oauthRouter.post('/device/token', async (req, res) => {
    const grantType = 'urn:ietf:params:oauth:grant-type:device_code';
    if (req.body?.grant_type !== grantType) {
        return res.status(400).json({
            error: 'unsupported_grant_type',
            error_description: `Use grant_type=${grantType}`,
        });
    }
    const deviceCode = String(req.body?.device_code || '');
    const session = deviceSessions.get(deviceCode);
    if (!session) {
        return res.status(400).json({ error: 'invalid_grant' });
    }
    if (isExpired(session)) {
        deviceSessions.delete(deviceCode);
        return res.status(400).json({ error: 'expired_token' });
    }
    if (session.status === 'denied') {
        deviceSessions.delete(deviceCode);
        return res.status(400).json({ error: 'access_denied' });
    }
    if (session.status === 'pending') {
        return res.status(400).json({ error: 'authorization_pending' });
    }

    try {
        const oauthService = getOAuthService(req);
        const token = await oauthService.createDeviceToken({
            clientId: session.clientId,
            userId: session.userId!,
            organizationUuid: session.organizationUuid!,
        });
        // one-time use
        deviceSessions.delete(deviceCode);
        return res.json({
            access_token: token.accessToken,
            token_type: 'Bearer',
            expires_in: Math.floor(
                (token.accessTokenExpiresAt.getTime() - Date.now()) / 1000,
            ),
            refresh_token: token.refreshToken,
            scope: token.scope.join(' '),
        });
    } catch (error) {
        Logger.error(`Device token endpoint error: ${error}`);
        return res.status(400).json({ error: 'invalid_grant' });
    }
});

export default oauthRouter;
