/** READ shape returned by the API — NEVER includes the secret value. */
export type ExternalConnection = {
    externalConnectionUuid: string;
    projectUuid: string;
    organizationUuid: string;
    name: string;
    slug: string;
    type:
        | 'none'
        | 'api_key'
        | 'bearer_token'
        | 'google_service_account';
    origin: string;
    allowBrowserImages?: boolean;
    allowDataAppBuilderLinking?: boolean;
    instructions: string | null;
    allowedPathPrefixes: string[];
    allowedMethods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
    allowedContentTypes: string[];
    responseMaxBytes: number;
    requestMaxBytes: number;
    timeoutMs: number;
    rateLimitPerMinute: number | null;
    apiKeyName: string | null;
    apiKeyLocation: 'header' | 'query' | null;
    oauthScopes: string[] | null;
    customHeaders: Record<string, string> | null;
    hasSecret: boolean;
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AppExternalConnectionLink = {
    alias: string;
    connection: ExternalConnection;
};
