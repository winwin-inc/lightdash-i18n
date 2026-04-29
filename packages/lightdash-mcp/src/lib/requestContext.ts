import { AsyncLocalStorage } from 'node:async_hooks';

/** Max bytes forwarded for X-Lightdash-User-Attributes (overlong → ignored). */
export const MAX_USER_ATTRIBUTES_HEADER_CHARS = 32_768;

type RequestContextStore = {
    apiKey: string | undefined;
    userEmail?: string;
    maskedKey?: string;
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
