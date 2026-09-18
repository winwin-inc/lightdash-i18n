import {
    createLocalJWKSet,
    createRemoteJWKSet,
    jwtVerify,
    type JWTPayload,
    type JWTVerifyGetKey,
} from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/server';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/express';

export type KeycloakJwtClaims = {
    email: string;
    subject: string;
    scopes: string[];
    expiresAt: number | undefined;
};

export type KeycloakVerifyOptions = {
    keycloakRealmUrl: string;
    audience: string;
    requiredScopes: string[];
    /** Override JWKS (tests); default remote JWKS from realm */
    jwks?: JWTVerifyGetKey;
};

function normalizeIssuer(realmUrl: string): string {
    return realmUrl.replace(/\/$/, '');
}

function parseScopeClaim(payload: JWTPayload): string[] {
    const raw = payload.scope;
    if (typeof raw !== 'string') {
        return [];
    }
    return raw
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function extractEmail(payload: JWTPayload): string | undefined {
    if (typeof payload.email === 'string' && payload.email.trim().length > 0) {
        return payload.email.trim();
    }
    if (
        typeof payload.preferred_username === 'string' &&
        payload.preferred_username.includes('@')
    ) {
        return payload.preferred_username.trim();
    }
    return undefined;
}

/**
 * Verify a Keycloak access token (JWKS) and map claims for MCP AuthInfo + token exchange.
 */
export async function verifyKeycloakAccessToken(
    token: string,
    options: KeycloakVerifyOptions,
): Promise<KeycloakJwtClaims> {
    const issuer = normalizeIssuer(options.keycloakRealmUrl);
    const jwks =
        options.jwks ??
        createRemoteJWKSet(
            new URL(`${issuer}/protocol/openid-connect/certs`),
        );

    let payload: JWTPayload;
    try {
        const verified = await jwtVerify(token, jwks, {
            issuer,
            audience: options.audience,
        });
        payload = verified.payload;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : String(error);
        throw new Error(`Keycloak JWT verification failed: ${message}`);
    }

    const scopes = parseScopeClaim(payload);
    const missingScopes = options.requiredScopes.filter(
        (requiredScope) => !scopes.includes(requiredScope),
    );
    if (missingScopes.length > 0) {
        throw new Error(
            `OAuth token missing required scopes: ${missingScopes.join(', ')}`,
        );
    }

    const email = extractEmail(payload);
    if (!email) {
        throw new Error(
            'OAuth token missing email claim (email or preferred_username)',
        );
    }

    const subject =
        typeof payload.sub === 'string' && payload.sub.length > 0
            ? payload.sub
            : email;

    return {
        email,
        subject,
        scopes,
        expiresAt:
            typeof payload.exp === 'number' ? payload.exp : undefined,
    };
}

export function createKeycloakTokenVerifier(
    options: KeycloakVerifyOptions,
): OAuthTokenVerifier {
    return {
        async verifyAccessToken(token: string): Promise<AuthInfo> {
            const claims = await verifyKeycloakAccessToken(token, options);
            return {
                token,
                clientId: claims.subject,
                scopes: claims.scopes,
                expiresAt: claims.expiresAt,
                extra: {
                    email: claims.email,
                    authSubject: claims.subject,
                },
            };
        },
    };
}

export async function fetchKeycloakOAuthMetadata(
    keycloakRealmUrl: string,
): Promise<Record<string, unknown>> {
    const issuer = normalizeIssuer(keycloakRealmUrl);
    const metadataUrl = `${issuer}/.well-known/openid-configuration`;
    const response = await fetch(metadataUrl);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch Keycloak OAuth metadata from ${metadataUrl}: ${response.status}`,
        );
    }
    return (await response.json()) as Record<string, unknown>;
}

export { createLocalJWKSet };
