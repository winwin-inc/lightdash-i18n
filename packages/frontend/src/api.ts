import {
    JWT_HEADER_NAME,
    LightdashRequestMethodHeader,
    LightdashVersionHeader,
    RequestMethod,
    type AnyType,
    type ApiError,
    type ApiResponse,
} from '@lightdash/common';
import { spanToTraceHeader, startSpan } from '@sentry/react';
import fetch from 'isomorphic-fetch';
import { EMBED_KEY, type InMemoryEmbed } from './ee/providers/Embed/types';
import { getFromInMemoryStorage } from './utils/inMemoryStorage';

// TODO: import from common or fix the instantiation of the request module
const LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY =
    '__lightdash_sdk_instance_url';

// API base URL should always use current page origin to avoid base tag interference
// This ensures API requests go to the backend server, not CDN
// When base tag points to CDN domain, absolute paths like /api/... will resolve to base domain
// So we need to use window.location.origin to ensure API requests go to the correct domain
export const BASE_API_URL =
    import.meta.env.VITEST === 'true'
        ? `http://test.lightdash/`
        : typeof window !== 'undefined'
        ? window.location.origin
        : '/';

/**
 * 当前页 origin 下的 API 根路径（含 /api/v1），用于跳转、<a href> 等，避免 <base href="CDN"> 导致解析到 CDN 域名。
 * 与 BASE_API_URL 一致，但保证末尾无多余斜杠并拼接 api/v1。
 */
export function getApiBaseUrl(): string {
    const base =
        import.meta.env.VITEST === 'true'
            ? 'http://test.lightdash/'
            : typeof window !== 'undefined'
              ? window.location.origin
              : '/';
    return `${base.replace(/\/?$/, '/')}api/v1`;
}

/** 拼接完整 API URL（v1），用于导航/链接，不受 base 标签影响。path 需以 / 开头，如 '/slack/install/' */
export function getApiUrl(path: string): string {
    return getApiBaseUrl() + path;
}

/** 当前页 origin 下的 API v2 根路径，用于 fetch/流式请求等。 */
export function getApiBaseUrlV2(): string {
    const base =
        import.meta.env.VITEST === 'true'
            ? 'http://test.lightdash/'
            : typeof window !== 'undefined'
              ? window.location.origin
              : '/';
    return `${base.replace(/\/?$/, '/')}api/v2`;
}

/** 拼接完整 API v2 URL，用于请求等，不受 base 标签影响。path 需以 / 开头。 */
export function getApiUrlV2(path: string): string {
    return getApiBaseUrlV2() + path;
}

const defaultHeaders = {
    'Content-Type': 'application/json',
    [LightdashRequestMethodHeader]: RequestMethod.WEB_APP,
    [LightdashVersionHeader]: __APP_VERSION__,
};

const isSafeToAddEmbedHeader = (
    headers: Record<string, string> | undefined,
) => {
    if (!headers) return true;

    const isEmbedHeader = (header: string) =>
        header.toLowerCase() === JWT_HEADER_NAME.toLowerCase();
    return !Object.keys(headers).some(isEmbedHeader);
};

const finalizeHeaders = (
    headers: Record<string, string> | undefined,
    embed: InMemoryEmbed | undefined,
    sentryTrace: string | undefined,
): Record<string, string> => {
    const requestHeaders: Record<string, string> = {
        ...defaultHeaders,
        ...headers,
    };

    if (embed?.token && isSafeToAddEmbedHeader(headers)) {
        requestHeaders[JWT_HEADER_NAME] = embed.token;
    }

    if (sentryTrace) {
        requestHeaders['sentry-trace'] = sentryTrace;
    }

    return requestHeaders;
};

function finalizeUrl(url: string, embed: InMemoryEmbed | undefined): string {
    if (embed?.projectUuid && !url.includes('projectUuid')) {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}projectUuid=${encodeURIComponent(
            embed.projectUuid,
        )}`;
    }
    return url;
}

const handleError = (err: any): ApiError => {
    if (err.error?.statusCode && err.error?.name) {
        if (
            err.error?.name === 'DeactivatedAccountError' &&
            window.location.pathname !== '/login'
        ) {
            // redirect to login page when account is deactivated
            window.location.href = '/login';
        }
        return err;
    }
    return {
        status: 'error',
        error: {
            name: 'NetworkError',
            statusCode: 500,
            message:
                'We are currently unable to reach the MSY X server. Please try again in a few moments.',
            data: err,
        },
    };
};

type LightdashApiPropsBase = {
    url: string;
    headers?: Record<string, string> | undefined;
    version?: 'v1' | 'v2';
    signal?: AbortSignal;
};

type LightdashApiPropsGetOrDelete = LightdashApiPropsBase & {
    method: 'GET' | 'DELETE';
    body?: BodyInit | null | undefined;
};

type LightdashApiPropsWrite = LightdashApiPropsBase & {
    method: 'POST' | 'PATCH' | 'PUT';
    body: BodyInit | null | undefined;
};

type LightdashApiProps = LightdashApiPropsGetOrDelete | LightdashApiPropsWrite;

const MAX_NETWORK_HISTORY = 10;
export let networkHistory: AnyType[] = [];

export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
    headers,
    version = 'v1',
    signal,
}: LightdashApiProps): Promise<T> => {
    const baseUrl = sessionStorage.getItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    );
    const base = (baseUrl ?? BASE_API_URL).replace(/\/?$/, '/');
    const apiPrefix = `${base}api/${version}`;

    let sentryTrace: string | undefined;
    // Manually create a span for the fetch request to be able to trace it in Sentry. This also enables Distributed Tracing.
    startSpan(
        {
            op: 'http.client',
            name: `API Request: ${method} ${url}`,
            attributes: {
                'http.method': method,
                'http.url': url,
                type: 'fetch',
                url,
                method,
            },
        },
        (s) => {
            sentryTrace = spanToTraceHeader(s);
        },
    );

    const embed = getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY);
    return fetch(finalizeUrl(`${apiPrefix}${url}`, embed), {
        method,
        headers: finalizeHeaders(headers, embed, sentryTrace),
        body,
        signal,
    })
        .then((r) => {
            if (!r.ok) {
                return r.json().then((d) => {
                    throw d;
                });
            }
            return r;
        })
        .then(async (r) => {
            const js = await r.json();
            networkHistory.push({
                method,
                url,
                body,
                status: r.status,
                json: JSON.stringify(js).substring(0, 500),
            });
            return js;
        })
        .then((d: ApiResponse | ApiError) => {
            switch (d.status) {
                case 'ok':
                    // make sure we return null instead of undefined
                    // otherwise react-query will crash
                    return (d.results ?? null) as T;
                case 'error':
                    throw d;
                default:
                    throw d;
            }
        })
        .catch((err) => {
            // TODO do not capture some requests, like passwords or sensitive data
            networkHistory.push({
                method,
                status: err.status,
                url,
                body,
                error: JSON.stringify(err).substring(0, 500),
            });
            // only store last MAX_NETWORK_HISTORY requests
            if (networkHistory.length > MAX_NETWORK_HISTORY)
                networkHistory.shift();
            throw handleError(err);
        });
};

export const lightdashApiStream = ({
    method,
    url,
    body,
    headers,
    version = 'v1',
    signal,
}: LightdashApiProps) => {
    const baseUrl = sessionStorage.getItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    );
    const base = (baseUrl ?? BASE_API_URL).replace(/\/?$/, '/');
    const apiPrefix = `${base}api/${version}`;

    let sentryTrace: string | undefined;
    // Manually create a span for the fetch request to be able to trace it in Sentry. This also enables Distributed Tracing.
    startSpan(
        {
            op: 'http.client',
            name: `API Streaming Request: ${method} ${url}`,
            attributes: {
                'http.method': method,
                'http.url': url,
                type: 'fetch',
                url,
                method,
            },
        },
        (s) => {
            sentryTrace = spanToTraceHeader(s);
        },
    );

    return fetch(`${apiPrefix}${url}`, {
        method,
        headers: {
            ...defaultHeaders,
            ...headers,
            ...(sentryTrace ? { 'sentry-trace': sentryTrace } : {}),
        },
        body,
        signal,
    })
        .then((r) => {
            if (!r.ok) {
                throw r;
            }
            return r;
        })
        .catch((err) => {
            throw handleError(err);
        });
};
