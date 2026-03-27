import { AsyncLocalStorage } from 'node:async_hooks';

type ApiKeyStore = { apiKey: string | undefined };

/** HTTP 模式下由中间件注入，供 tool 内解析默认 PAT */
export const httpRequestApiKeyStore = new AsyncLocalStorage<ApiKeyStore>();

export function getHttpRequestApiKey(): string | undefined {
    return httpRequestApiKeyStore.getStore()?.apiKey;
}
