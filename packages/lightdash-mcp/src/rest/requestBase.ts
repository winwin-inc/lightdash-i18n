import {
    getHttpRequestAuthType,
    getHttpRequestOauthAccessToken,
    getHttpRequestUserAttributesHeader,
} from '../lib/requestContext';
import type { RequestJsonFn } from './types';

export function authHeaders(apiKey: string): Record<string, string> {
    const authType = getHttpRequestAuthType();
    const oauthToken = getHttpRequestOauthAccessToken();
    if (authType === 'oauth' && oauthToken) {
        return {
            Authorization: `Bearer ${oauthToken}`,
            'Content-Type': 'application/json',
        };
    }
    return {
        Authorization: `ApiKey ${  apiKey}`,
        'Content-Type': 'application/json',
    };
}

export async function readErrorBody(res: Response): Promise<string> {
    const text = await res.text();
    try {
        const j = JSON.parse(text) as {
            error?: {
                name?: string;
                message?: string;
                data?: unknown;
                statusCode?: number;
            };
            message?: string;
        };
        const message = j.error?.message ?? j.message;
        const errorName = j.error?.name;
        const statusCode = j.error?.statusCode;
        const details =
            j.error?.data !== undefined ? JSON.stringify(j.error.data) : '';
        const parts = [errorName, statusCode, message, details]
            .filter((part): part is string | number => Boolean(part))
            .map((part) => String(part));
        return parts.length > 0 ? parts.join(' | ') : text;
    } catch {
        return text;
    }
}

export function createRequestJson(baseUrl: string): RequestJsonFn {
    return async function requestJson<T>(
        apiKey: string,
        urlPath: string,
        init?: RequestInit,
    ): Promise<T> {
        const ua = getHttpRequestUserAttributesHeader();
        const authType = getHttpRequestAuthType();
        const res = await fetch(baseUrl + urlPath, {
            ...init,
            headers: {
                ...authHeaders(apiKey),
                ...(ua ? { 'X-Lightdash-User-Attributes': ua } : {}),
                ...(init?.headers as Record<string, string> | undefined),
            },
        });
        if (!res.ok) {
            const msg = await readErrorBody(res);
            if (res.status === 401 && authType === 'oauth') {
                throw new Error(
                    `Lightdash API ${res.status}: OAuth token is accepted by MCP but rejected by downstream API. Try x-api-key in MCP connection headers. Details: ${msg}`,
                );
            }
            throw new Error(`Lightdash API ${  res.status  }: ${  msg}`);
        }
        return res.json() as Promise<T>;
    };
}
