import { ParameterError, UserWithOrganizationUuid } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';
import { DatabaseError } from 'pg';
import { LightdashConfig } from '../../config/parseConfig';
import { DeviceCodeSession, OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

export enum OAuthScope {
    READ = 'read',
    WRITE = 'write',
    MCP_READ = 'mcp:read',
    MCP_WRITE = 'mcp:write',
}

/** Scopes that grant access to the MCP server */
export const MCP_SUPPORTED_SCOPES: string[] = [
    OAuthScope.MCP_READ,
    OAuthScope.MCP_WRITE,
];

/* ---------------------------------------------------------------------
 * Device flow (RFC 8628) — browserless / QR login for the CLI.
 * Session state lives in Postgres (oauth2_device_codes) so any replica
 * can serve both the CLI polling and the QR activation request.
 * ------------------------------------------------------------------- */
export const DEVICE_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const DEVICE_POLL_INTERVAL_SECONDS = 5;
// Cap on concurrent device sessions (abuse guard on the public
// POST /device endpoint); expired rows are swept first.
const DEVICE_MAX_SESSIONS = 10_000;
// user_code collisions on the UNIQUE index are retried a few times
const DEVICE_CODE_MAX_ATTEMPTS = 5;
// Alphabet without ambiguous characters (0/O, 1/I)
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateUserCode = (): string => {
    const bytes = randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i += 1) {
        code += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
    }
    return `${code.slice(0, 4)}-${code.slice(4)}`;
};

type OAuthServiceArguments = {
    userModel: UserModel;
    oauthModel: OAuth2Model;
    lightdashConfig: LightdashConfig;
};

export class OAuthService extends BaseService {
    protected oauthServer!: OAuth2Server;

    private userModel: UserModel;

    private oauthModel: OAuth2Model;

    private lightdashConfig: LightdashConfig;

    constructor({
        userModel,
        oauthModel,
        lightdashConfig,
    }: OAuthServiceArguments) {
        super();
        this.userModel = userModel;
        this.oauthModel = oauthModel;
        this.lightdashConfig = lightdashConfig;
        this.initializeOAuthServer();
    }

    private initializeOAuthServer(): void {
        this.oauthServer = new OAuth2Server({
            model: this.oauthModel,
            allowBearerTokensInQueryString: true,
            allowEmptyState: true, // Make state parameter optional for MCP compatibility
            accessTokenLifetime:
                this.lightdashConfig.auth.oauthServer?.accessTokenLifetime,
            refreshTokenLifetime:
                this.lightdashConfig.auth.oauthServer?.refreshTokenLifetime,
            // Allow public clients (no client authentication required for refresh tokens)
            requireClientAuthentication: {
                refresh_token: false, // Don't require for refresh token (public client)
            },
        });
    }

    public getSiteUrl() {
        return `${this.lightdashConfig.siteUrl}`;
    }

    public async authorize(
        request: OAuth2Server.Request,
        response: OAuth2Server.Response,
        user: UserWithOrganizationUuid,
    ): Promise<OAuth2Server.AuthorizationCode> {
        await this.applyDefaultScope(request);
        return this.oauthServer.authorize(request, response, {
            authenticateHandler: {
                handle: () => user,
            },
        });
    }

    /**
     * MCP clients that do not send a `scope` parameter get the default MCP
     * scopes, so that the issued token can be used against the MCP server.
     * Clients that do request scopes are always honoured.
     */
    private async applyDefaultScope(
        request: OAuth2Server.Request,
    ): Promise<void> {
        const requestedScope =
            request.body?.scope ?? request.query?.scope ?? undefined;
        if (requestedScope) {
            return;
        }

        const clientId =
            request.body?.client_id ?? request.query?.client_id ?? undefined;
        if (!clientId) {
            return;
        }

        const clientScopes = await this.oauthModel.getClientScopes(clientId);
        const mcpScopes = clientScopes.filter((scope) =>
            MCP_SUPPORTED_SCOPES.includes(scope),
        );
        const scopes = mcpScopes.length > 0 ? mcpScopes : [OAuthScope.MCP_READ];

        if (request.body) {
            request.body.scope = scopes.join(' ');
        } else if (request.query) {
            request.query.scope = scopes.join(' ');
        }
    }

    public async token(
        request: OAuth2Server.Request,
        response: OAuth2Server.Response,
    ): Promise<OAuth2Server.Token> {
        return this.oauthServer.token(request, response);
    }

    /**
     * Issues an access token for the CLI device flow (RFC 8628). The user
     * authorizes out-of-band on the activate page, so we bypass
     * @node-oauth/oauth2-server (which has no device grant) and persist the
     * token directly with the same lifetime/scopes as regular tokens.
     */
    public async createDeviceToken({
        clientId,
        userId,
        organizationUuid,
    }: {
        clientId: string;
    } & UserWithOrganizationUuid): Promise<{
        accessToken: string;
        accessTokenExpiresAt: Date;
        refreshToken: string;
        scope: string[];
    }> {
        const client = await this.oauthModel.getClient(clientId);
        if (!client) {
            throw new ParameterError(`Unknown OAuth client ${clientId}`);
        }
        // Grant the client's registered scopes: MCP clients (msy-x-cli)
        // get their MCP scopes; the classic CLI (lightdash-cli) gets its
        // read/write scopes.
        const registeredScopes = await this.oauthModel.getClientScopes(
            clientId,
        );
        const mcpScopes = registeredScopes.filter((s) =>
            MCP_SUPPORTED_SCOPES.includes(s),
        );
        const scope = mcpScopes.length > 0 ? mcpScopes : registeredScopes;
        const accessToken = nanoid(48);
        const refreshToken = nanoid(48);
        const accessTokenExpiresAt = new Date(
            Date.now() +
                (this.lightdashConfig.auth.oauthServer?.accessTokenLifetime ??
                    3600) *
                    1000,
        );
        const refreshTokenExpiresAt = new Date(
            Date.now() +
                (this.lightdashConfig.auth.oauthServer?.refreshTokenLifetime ??
                    1209600) *
                    1000,
        );
        const user: UserWithOrganizationUuid = { userId, organizationUuid };
        const token = await this.oauthModel.saveToken(
            {
                accessToken,
                accessTokenExpiresAt,
                refreshToken,
                refreshTokenExpiresAt,
                scope,
                client,
                user,
            },
            client,
            user,
        );
        return {
            accessToken: token.accessToken,
            accessTokenExpiresAt: token.accessTokenExpiresAt!,
            refreshToken: token.refreshToken!,
            scope,
        };
    }

    /* ------------------------------------------------------------------
     * Device flow (RFC 8628) — thin delegations over the shared
     * oauth2_device_codes store. See the router endpoints for the exact
     * HTTP behaviour; everything here is stateless across replicas.
     * ------------------------------------------------------------------ */

    /**
     * Creates a pending device session. Regenerates device_code/user_code
     * and retries when the insert hits a UNIQUE violation (pg 23505);
     * exhausting all attempts raises a ParameterError.
     */
    public async createDeviceCodeSession(
        clientId: string,
    ): Promise<DeviceCodeSession> {
        const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);
        for (
            let attempt = 1;
            attempt <= DEVICE_CODE_MAX_ATTEMPTS;
            attempt += 1
        ) {
            const deviceCode = randomBytes(32).toString('base64url');
            const userCode = generateUserCode();
            try {
                // Retry on collision is inherently sequential: each attempt
                // must observe the failed insert before regenerating.
                // eslint-disable-next-line no-await-in-loop
                await this.oauthModel.saveDeviceCode({
                    deviceCode,
                    userCode,
                    clientId,
                    expiresAt,
                });
                return {
                    deviceCode,
                    userCode,
                    clientId,
                    status: 'pending',
                    userId: null,
                    organizationUuid: null,
                    expiresAt,
                };
            } catch (error) {
                // Regenerate and retry on UNIQUE(user_code)/PK collision
                // (pg 23505); any other error surfaces as-is. When the
                // attempts are exhausted the loop below exits and the
                // collision becomes a ParameterError for the caller.
                if (
                    !(error instanceof DatabaseError && error.code === '23505')
                ) {
                    throw error;
                }
            }
        }
        throw new ParameterError('Could not allocate a unique device code');
    }

    public async getDeviceCodeSessionByUserCode(
        userCode: string,
    ): Promise<DeviceCodeSession | null> {
        return this.oauthModel.getDeviceCodeByUserCode(userCode);
    }

    public async getDeviceCodeSessionByDeviceCode(
        deviceCode: string,
    ): Promise<DeviceCodeSession | null> {
        return this.oauthModel.getDeviceCodeByDeviceCode(deviceCode);
    }

    /** Atomic approve; false means the code is unknown, resolved or expired. */
    public async approveDeviceCode({
        deviceCode,
        userId,
        organizationUuid,
    }: {
        deviceCode: string;
    } & UserWithOrganizationUuid): Promise<boolean> {
        return this.oauthModel.authorizeDeviceCode({
            deviceCode,
            userId,
            organizationUuid,
        });
    }

    /** Atomic deny; false means the code is unknown, resolved or expired. */
    public async denyDeviceCode(deviceCode: string): Promise<boolean> {
        return this.oauthModel.denyDeviceCode(deviceCode);
    }

    /**
     * One-time consumption: atomically flips an authorized session to
     * 'consumed' and returns it, or null when a concurrent poll already
     * redeemed it.
     */
    public async consumeDeviceCode(
        deviceCode: string,
    ): Promise<DeviceCodeSession | null> {
        return this.oauthModel.consumeDeviceCode(deviceCode);
    }

    /**
     * Best-effort compensation for a failed token minting: flips a
     * consumed session back to 'authorized' so the CLI can retry polling
     * without re-scanning the QR code.
     */
    public async releaseDeviceCode(deviceCode: string): Promise<boolean> {
        return this.oauthModel.releaseDeviceCode(deviceCode);
    }

    public async deleteDeviceCode(deviceCode: string): Promise<boolean> {
        return this.oauthModel.deleteDeviceCode(deviceCode);
    }

    /** Drops every expired device session; returns the number of rows. */
    public async deleteExpiredDeviceCodes(): Promise<number> {
        return this.oauthModel.deleteExpiredDeviceCodes();
    }

    /** True when unexpired pending/authorized/consumed sessions hit the cap. */
    public async isDeviceFlowAtCapacity(): Promise<boolean> {
        const active = await this.oauthModel.countActiveDeviceCodes();
        return active >= DEVICE_MAX_SESSIONS;
    }

    public async authenticate(
        request: OAuth2Server.Request,
        response: OAuth2Server.Response,
    ): Promise<OAuth2Server.Token> {
        return this.oauthServer.authenticate(request, response);
    }

    public async revokeToken(token: string): Promise<boolean> {
        // Try to revoke as access token first
        const refreshToken = await this.oauthModel.getRefreshToken(token);
        if (refreshToken) return this.oauthModel.revokeToken(refreshToken);
        return false;
    }

    public async registerClient({
        clientName,
        redirectUris,
        grantTypes,
        scopes,
    }: {
        clientName: string;
        redirectUris: string[];
        grantTypes?: string[];
        scopes?: string[];
    }) {
        // Validate redirect URIs
        for (const uri of redirectUris) {
            try {
                // eslint-disable-next-line no-new
                new URL(uri);
            } catch {
                throw new ParameterError(`Invalid redirect URI ${uri}`);
            }
        }

        return this.oauthModel.createClient({
            clientName,
            redirectUris,
            grantTypes,
            scopes,
        });
    }
}
