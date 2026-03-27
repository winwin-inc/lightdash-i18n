import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContextStore = {
    apiKey: string | undefined;
    userEmail?: string;
    maskedKey?: string;
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
