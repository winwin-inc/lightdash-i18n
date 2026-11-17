import { ParameterError, UserWithOrganizationUuid } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { nanoid } from 'nanoid';
import { LightdashConfig } from '../../config/parseConfig';
import { OAuth2Model } from '../../models/OAuth2Model';
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
