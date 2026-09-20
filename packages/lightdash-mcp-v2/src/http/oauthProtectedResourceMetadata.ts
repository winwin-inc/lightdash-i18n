export type OAuthProtectedResourceMetadata = {
    resource: string;
    authorization_servers: string[];
    scopes_supported: string[];
};

/**
 * RFC 9728 resource metadata used by the path-specific SDK route and the
 * root compatibility alias expected by clients such as WorkBuddy.
 */
export function buildOAuthProtectedResourceMetadata({
    resourceServerUrl,
    authorizationServerUrl,
    scopesSupported,
}: {
    resourceServerUrl: URL;
    authorizationServerUrl: string;
    scopesSupported: string[];
}): OAuthProtectedResourceMetadata {
    return {
        resource: resourceServerUrl.toString(),
        authorization_servers: [
            authorizationServerUrl.replace(/\/$/, ''),
        ],
        scopes_supported: scopesSupported,
    };
}
