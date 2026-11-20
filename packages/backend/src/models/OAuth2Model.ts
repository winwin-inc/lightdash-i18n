/* eslint-disable class-methods-use-this */
import { AuthTokenPrefix, UserWithOrganizationUuid } from '@lightdash/common';
import type {
    AuthorizationCode,
    AuthorizationCodeModel,
    Client,
    Token,
    User,
} from '@node-oauth/oauth2-server';
import { Knex } from 'knex';
import { nanoid } from 'nanoid';
import { Scope } from 'oauth2-server';
import Logger from '../logging/logger';

export const DEFAULT_OAUTH_CLIENT_ID = 'lightdash-cli';

export type DeviceCodeStatus = 'pending' | 'authorized' | 'denied' | 'consumed';

/**
 * RFC 8628 device-flow session, persisted in oauth2_device_codes so any
 * replica can serve both the CLI polling and the QR activation request
 * (production runs multiple replicas behind a headless Service).
 */
export type DeviceCodeSession = {
    deviceCode: string;
    userCode: string;
    clientId: string;
    status: DeviceCodeStatus;
    userId: number | null;
    organizationUuid: string | null;
    expiresAt: Date;
};

type DeviceCodeRow = {
    device_code: string;
    user_code: string;
    client_id: string;
    status: DeviceCodeStatus;
    user_id: number | null;
    organization_uuid: string | null;
    expires_at: Date | string;
};

const mapDeviceCodeRow = (row: DeviceCodeRow): DeviceCodeSession => ({
    deviceCode: row.device_code,
    userCode: row.user_code,
    clientId: row.client_id,
    status: row.status,
    userId: row.user_id,
    organizationUuid: row.organization_uuid,
    expiresAt: new Date(row.expires_at),
});

export class OAuth2Model implements AuthorizationCodeModel {
    constructor(private database: Knex) {}

    async getClient(
        clientId: string,
        clientSecret?: string | null,
    ): Promise<Client | false> {
        const query = this.database('oauth2_clients')
            .select('*')
            .where('client_id', clientId);

        if (clientSecret) {
            void query.andWhere('client_secret', clientSecret);
        }

        const client = await query.first();

        if (!client) {
            return false;
        }

        return {
            clientId: client.client_id,
            id: client.client_id,
            redirectUris: client.redirect_uris,
            grants: client.grants,
            scopes: (client.scopes ?? []) as string[],
        };
    }

    /**
     * Restricts issued scopes to those registered on the OAuth client.
     * Without this, `@node-oauth/oauth2-server` honours any requested scope
     * (e.g. a read-only client could request `mcp:write`), making the
     * client-level scope promise unenforceable.
     *
     * Unregistered requested scopes are DROPPED (not fatal): MCP clients
     * commonly request every scope advertised in `.well-known`
     * (`mcp:read mcp:write`) even when the client only registered `mcp:read`
     * — rejecting the whole request broke those clients (v2.6.8 incident).
     * A request whose scopes are all unregistered, or a client with no
     * registered scopes, still fails with `invalid_scope`.
     */
    async validateScope(
        _user: User,
        client: Client,
        scope?: string[],
    ): Promise<string[] | false> {
        const allowedScopes = Array.isArray(client.scopes)
            ? client.scopes
            : [client.scopes].filter(Boolean);

        if (allowedScopes.length === 0) {
            return false;
        }

        const requestedScopes = (scope ?? []).filter((s) => s.length > 0);
        if (requestedScopes.length === 0) {
            // No scope requested: default to the client's registered MCP
            // scopes (mirrors OAuthService.applyDefaultScope), falling back
            // to all registered scopes for non-MCP clients (e.g. lightdash-cli).
            const mcpScopes = allowedScopes.filter((s) => s.startsWith('mcp:'));
            return mcpScopes.length > 0 ? mcpScopes : allowedScopes;
        }

        const allowed = new Set<string>(allowedScopes);
        const validScopes = requestedScopes.filter((s) => allowed.has(s));
        if (validScopes.length === 0) {
            return false;
        }

        if (validScopes.length !== requestedScopes.length) {
            Logger.warn(
                `OAuth: dropping unregistered scopes for client ${
                    client.id
                }: requested ${requestedScopes.join(
                    ' ',
                )}, granted ${validScopes.join(' ')}`,
            );
        }

        return validScopes;
    }

    async getClientScopes(clientId: string): Promise<string[]> {
        const client = await this.database('oauth2_clients')
            .select('scopes')
            .where('client_id', clientId)
            .first();

        if (!client) {
            return [];
        }

        return (client.scopes ?? []) as string[];
    }

    async saveAuthorizationCode(
        code: Pick<
            AuthorizationCode,
            | 'authorizationCode'
            | 'expiresAt'
            | 'redirectUri'
            | 'scope'
            | 'codeChallenge'
            | 'codeChallengeMethod'
        >,
        client: Client,
        user: UserWithOrganizationUuid,
    ): Promise<AuthorizationCode> {
        await this.database('oauth2_authorization_codes').insert({
            authorization_code: code.authorizationCode,
            expires_at: code.expiresAt,
            redirect_uri: code.redirectUri,
            scope: Array.isArray(code.scope)
                ? code.scope
                : [code.scope].filter(Boolean),
            client_id: client.id,
            user_id: user.userId,
            organization_uuid: user.organizationUuid,
            code_challenge: code.codeChallenge,
            code_challenge_method: code.codeChallengeMethod,
        });

        return {
            authorizationCode: code.authorizationCode,
            expiresAt: code.expiresAt,
            redirectUri: code.redirectUri,
            scope: code.scope,
            client,
            user,
            codeChallenge: code.codeChallenge,
            codeChallengeMethod: code.codeChallengeMethod,
        };
    }

    async getAuthorizationCode(
        authorizationCode: string,
    ): Promise<AuthorizationCode | false> {
        const result = await this.database('oauth2_authorization_codes')
            .select(
                'oauth2_authorization_codes.*',
                'oauth2_clients.client_id',
                'oauth2_clients.client_secret',
                'oauth2_clients.redirect_uris',
                'oauth2_clients.grants',
                'oauth2_clients.scopes',
                'oauth2_clients.client_name',
                'oauth2_authorization_codes.code_challenge',
                'oauth2_authorization_codes.code_challenge_method',
            )
            .leftJoin(
                'oauth2_clients',
                'oauth2_authorization_codes.client_id',
                'oauth2_clients.client_id',
            )
            .where(
                'oauth2_authorization_codes.authorization_code',
                authorizationCode,
            )
            .first();

        if (!result) {
            return false;
        }

        return {
            authorizationCode: result.authorization_code,
            expiresAt: new Date(result.expires_at),
            redirectUri: result.redirect_uri,
            scope: result.scope,
            codeChallenge: result.code_challenge,
            codeChallengeMethod: result.code_challenge_method,
            client: {
                id: result.client_id,
                redirectUris: result.redirect_uris,
                grants: result.grants,
            },
            user: {
                userId: result.user_id,
                organizationUuid: result.organization_uuid,
            },
        };
    }

    async revokeAuthorizationCode(code: AuthorizationCode): Promise<boolean> {
        const result = await this.database('oauth2_authorization_codes')
            .where('authorization_code', code.authorizationCode)
            .del();

        return result > 0;
    }

    async saveToken(
        token: Token,
        client: Client,
        user: UserWithOrganizationUuid,
    ): Promise<Token> {
        await this.database('oauth2_access_tokens').insert({
            access_token: token.accessToken,
            expires_at: token.accessTokenExpiresAt,
            scope: Array.isArray(token.scope)
                ? token.scope
                : [token.scope].filter(Boolean),
            client_id: client.id,
            user_id: user.userId,
            organization_uuid: user.organizationUuid,
        });

        if (token.refreshToken) {
            await this.database('oauth2_refresh_tokens').insert({
                refresh_token: token.refreshToken,
                expires_at: token.refreshTokenExpiresAt,
                scope: Array.isArray(token.scope)
                    ? token.scope
                    : [token.scope].filter(Boolean),
                client_id: client.id,
                user_id: user.userId,
                organization_uuid: user.organizationUuid,
            });
        }

        return { ...token, client, user };
    }

    async getAccessToken(accessToken: string): Promise<Token | false> {
        const result = await this.database('oauth2_access_tokens')
            .select(
                'oauth2_access_tokens.*',
                'oauth2_clients.client_id',
                'oauth2_clients.client_secret',
                'oauth2_clients.redirect_uris',
                'oauth2_clients.grants',
                'oauth2_clients.scopes',
                'oauth2_clients.client_name',
                'users.user_uuid',
            )
            .leftJoin(
                'oauth2_clients',
                'oauth2_access_tokens.client_id',
                'oauth2_clients.client_id',
            )
            .leftJoin('users', 'oauth2_access_tokens.user_id', 'users.user_id')
            .where('oauth2_access_tokens.access_token', accessToken)
            .first();

        if (!result) {
            return false;
        }

        return {
            accessToken: result.access_token,
            accessTokenExpiresAt: new Date(result.expires_at),
            scope: result.scope,
            client: {
                id: result.client_id,
                redirectUris: result.redirect_uris,
                grants: result.grants,
            },
            user: {
                userId: result.user_id,
                userUuid: result.user_uuid,
                organizationUuid: result.organization_uuid,
            },
        };
    }

    async revokeToken(token: Token): Promise<boolean> {
        if (!token.refreshToken) {
            return false;
        }

        const result = await this.database('oauth2_refresh_tokens')
            .where('refresh_token', token.refreshToken)
            .del();

        return result > 0;
    }

    async getRefreshToken(refreshToken: string): Promise<Token | false> {
        const result = await this.database('oauth2_refresh_tokens')
            .select(
                'oauth2_refresh_tokens.*',
                'oauth2_clients.client_id',
                'oauth2_clients.client_secret',
                'oauth2_clients.redirect_uris',
                'oauth2_clients.grants',
                'oauth2_clients.scopes',
                'oauth2_clients.client_name',
            )
            .leftJoin(
                'oauth2_clients',
                'oauth2_refresh_tokens.client_id',
                'oauth2_clients.client_id',
            )
            .where('oauth2_refresh_tokens.refresh_token', refreshToken)
            .first();

        if (!result) {
            return false;
        }

        return {
            accessToken: '',
            refreshToken: result.refresh_token,
            refreshTokenExpiresAt: new Date(result.expires_at),
            scope: result.scope,
            client: {
                id: result.client_id,
                redirectUris: result.redirect_uris,
                grants: result.grants,
            },
            user: {
                userId: result.user_id,
                organizationUuid: result.organization_uuid,
            },
        };
    }

    async generateAccessToken(
        client: Client,
        user: User,
        scope: Scope,
    ): Promise<string> {
        return `${AuthTokenPrefix.OAUTH_APP}${nanoid(64)}`;
    }

    async generateRefreshToken(
        client: Client,
        user: User,
        scope: Scope,
    ): Promise<string> {
        return `${AuthTokenPrefix.OAUTH_REFRESH}${nanoid(64)}`;
    }

    async validateRedirectUri(
        redirectUri: string,
        client: Client,
    ): Promise<boolean> {
        const escapeRegExp = (string: string) =>
            string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const wildcardToRegExp = (wildcard: string) =>
            new RegExp(`^${escapeRegExp(wildcard).replace(/\\\*/g, '.*')}$`);

        if (!client.redirectUris) {
            return false;
        }

        const isValidRedirectUri =
            Array.isArray(client.redirectUris) &&
            client.redirectUris.some((uri) => {
                const regex = wildcardToRegExp(uri);
                return regex.test(redirectUri);
            });

        if (isValidRedirectUri) {
            return true;
        }

        return false;
    }

    async createClient({
        clientName,
        redirectUris,
        grantTypes = ['authorization_code', 'refresh_token'],
        scopes = [],
        clientSecret,
    }: {
        clientName: string;
        redirectUris: string[];
        grantTypes?: string[];
        scopes?: string[];
        clientSecret?: string;
        organizationUuid?: string;
    }): Promise<{
        clientId: string;
        clientSecret?: string;
        clientName: string;
        redirectUris: string[];
        grantTypes: string[];
        scopes: string[];
        createdAt: Date;
    }> {
        const clientId = `mcp-${nanoid(16)}`;
        const generatedClientSecret = clientSecret || nanoid(32);

        const [client] = await this.database('oauth2_clients')
            .insert({
                client_id: clientId,
                client_secret: generatedClientSecret,
                redirect_uris: redirectUris,
                grants: grantTypes,
                scopes,
                client_name: clientName,
            })
            .returning('*');

        return {
            clientId: client.client_id,
            clientSecret: client.client_secret,
            clientName: client.client_name,
            redirectUris: client.redirect_uris,
            grantTypes: client.grants,
            scopes: client.scopes,
            createdAt: client.created_at,
        };
    }

    /* ------------------------------------------------------------------
     * Device flow (RFC 8628) — shared Postgres session store.
     *
     * The CLI (POST /device, POST /device/token) and the user's browser
     * (GET/POST /device/activate) hit different replicas in production,
     * so sessions must live in the database, not in process memory.
     * ------------------------------------------------------------------ */

    async saveDeviceCode({
        deviceCode,
        userCode,
        clientId,
        expiresAt,
    }: {
        deviceCode: string;
        userCode: string;
        clientId: string;
        expiresAt: Date;
    }): Promise<void> {
        await this.database('oauth2_device_codes').insert({
            device_code: deviceCode,
            user_code: userCode,
            client_id: clientId,
            expires_at: expiresAt,
        });
    }

    async getDeviceCodeByUserCode(
        userCode: string,
    ): Promise<DeviceCodeSession | null> {
        const row = await this.database('oauth2_device_codes')
            .select('*')
            .where('user_code', userCode.toUpperCase())
            .first();

        return row ? mapDeviceCodeRow(row) : null;
    }

    async getDeviceCodeByDeviceCode(
        deviceCode: string,
    ): Promise<DeviceCodeSession | null> {
        const row = await this.database('oauth2_device_codes')
            .select('*')
            .where('device_code', deviceCode)
            .first();

        return row ? mapDeviceCodeRow(row) : null;
    }

    /**
     * Atomically transitions a pending, unexpired session to authorized.
     * Returns false when the code is unknown, already resolved or expired,
     * so concurrent approve attempts only ever succeed once.
     */
    async authorizeDeviceCode({
        deviceCode,
        userId,
        organizationUuid,
    }: {
        deviceCode: string;
        userId: number;
        organizationUuid: string;
    }): Promise<boolean> {
        const updated = await this.database('oauth2_device_codes')
            .where('device_code', deviceCode)
            .andWhere('status', 'pending')
            .andWhere('expires_at', '>', this.database.fn.now())
            .update({
                status: 'authorized',
                user_id: userId,
                organization_uuid: organizationUuid,
            });

        return updated > 0;
    }

    /** Atomically denies a pending, unexpired session. */
    async denyDeviceCode(deviceCode: string): Promise<boolean> {
        const updated = await this.database('oauth2_device_codes')
            .where('device_code', deviceCode)
            .andWhere('status', 'pending')
            .andWhere('expires_at', '>', this.database.fn.now())
            .update({ status: 'denied' });

        return updated > 0;
    }

    /**
     * One-time consumption: atomically flips an authorized, unexpired
     * session to 'consumed' and returns the occupied row. A concurrent
     * poll loses the race and gets null so the same session can never be
     * redeemed twice. The row is kept (not deleted) so a failed token
     * minting can be compensated by releaseDeviceCode.
     */
    async consumeDeviceCode(
        deviceCode: string,
    ): Promise<DeviceCodeSession | null> {
        const rows = (await this.database('oauth2_device_codes')
            .where('device_code', deviceCode)
            .andWhere('status', 'authorized')
            .andWhere('expires_at', '>', this.database.fn.now())
            .update({ status: 'consumed' }, [
                'device_code',
                'user_code',
                'client_id',
                'status',
                'user_id',
                'organization_uuid',
                'expires_at',
            ])) as DeviceCodeRow[];

        if (!rows || rows.length === 0) {
            return null;
        }

        return mapDeviceCodeRow(rows[0]);
    }

    /**
     * Best-effort compensation: flips a consumed session back to
     * 'authorized' so the CLI can retry polling after a failed token
     * minting without re-scanning the QR code.
     */
    async releaseDeviceCode(deviceCode: string): Promise<boolean> {
        const released = await this.database('oauth2_device_codes')
            .where('device_code', deviceCode)
            .andWhere('status', 'consumed')
            .update({ status: 'authorized' });

        return released > 0;
    }

    async deleteDeviceCode(deviceCode: string): Promise<boolean> {
        const deleted = await this.database('oauth2_device_codes')
            .where('device_code', deviceCode)
            .del();

        return deleted > 0;
    }

    /** Drops every expired row; returns the number of rows removed. */
    async deleteExpiredDeviceCodes(): Promise<number> {
        return this.database('oauth2_device_codes')
            .where('expires_at', '<=', this.database.fn.now())
            .del();
    }

    /**
     * Counts unexpired sessions still pending, authorized or consumed.
     * Consumed sessions count towards the cap until they expire so a
     * retry/redeem window cannot punch holes in the abuse guard.
     */
    async countActiveDeviceCodes(): Promise<number> {
        const result = await this.database('oauth2_device_codes')
            .count('device_code as count')
            .where('expires_at', '>', this.database.fn.now())
            .whereIn('status', ['pending', 'authorized', 'consumed']);

        return Number(result[0]?.count ?? 0);
    }

    // Optional not implemented methods
    // We will be using the default implementation from the oauth2-server library

    // async generateAuthorizationCode(client: Client,user: User,scope: Scope,): Promise<string>
    // async verifyScope(token: Token, scope: Scope): Promise<boolean>
}
