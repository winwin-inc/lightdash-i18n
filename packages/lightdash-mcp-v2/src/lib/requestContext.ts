import { AsyncLocalStorage } from 'node:async_hooks';

/** Max bytes forwarded for X-Lightdash-User-Attributes (overlong → ignored). */
export const MAX_USER_ATTRIBUTES_HEADER_CHARS = 32_768;

export type HttpAuthType = 'keycloak';

type RequestContextStore = {
    /** Short-lived Lightdash PAT from token-exchange */
    apiKey: string | undefined;
    authType?: HttpAuthType;
    /** Keycloak access token (JWT); not forwarded to Lightdash REST */
    oauthAccessToken?: string;
    oauthScopes?: string[];
    authSubject?: string;
    userEmail?: string;
    maskedKey?: string;
    /**
     * When downstream REST returns 401 (e.g. PAT revoked), silently re-exchange
     * once while the Keycloak JWT is still valid.
     */
    refreshApiKey?: () => Promise<string>;
    /**
     * Validated JSON string for X-Lightdash-User-Attributes (same bytes as client
     * sent after trim + JSON.parse check). Undefined when absent or invalid.
     */
    userAttributesHeader?: string;
};

/** HTTP 模式下由中间件注入，供 tool 内解析默认 PAT */
export const httpRequestApiKeyStore =
    new AsyncLocalStorage<RequestContextStore>();

export function getHttpRequestApiKey(): string | undefined {
    return httpRequestApiKeyStore.getStore()?.apiKey;
}

export function getHttpRequestAuthType(): HttpAuthType | undefined {
    return httpRequestApiKeyStore.getStore()?.authType;
}

export function getHttpRequestOauthAccessToken(): string | undefined {
    return httpRequestApiKeyStore.getStore()?.oauthAccessToken;
}

export function getHttpRequestOauthScopes(): string[] {
    return httpRequestApiKeyStore.getStore()?.oauthScopes ?? [];
}

export function getHttpRequestAuthSubject(): string | undefined {
    return httpRequestApiKeyStore.getStore()?.authSubject;
}

export function getHttpRequestUserEmail(): string | undefined {
    return httpRequestApiKeyStore.getStore()?.userEmail;
}

export function getHttpRequestMaskedKey(): string | undefined {
    return httpRequestApiKeyStore.getStore()?.maskedKey;
}

/** Outbound header value for Lightdash REST (undefined if not set / invalid). */
export function getHttpRequestUserAttributesHeader(): string | undefined {
    return httpRequestApiKeyStore.getStore()?.userAttributesHeader;
}

export async function refreshHttpRequestApiKey(): Promise<string | undefined> {
    const store = httpRequestApiKeyStore.getStore();
    if (!store?.refreshApiKey) {
        return undefined;
    }
    const next = await store.refreshApiKey();
    store.apiKey = next;
    return next;
}
