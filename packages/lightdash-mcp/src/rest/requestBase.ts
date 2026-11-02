import {
    getHttpRequestAuthType,
    getHttpRequestOauthAccessToken,
    getHttpRequestUserAttributesHeader,
} from '../lib/requestContext';
import type { RequestJsonFn } from './types';

/**
 * Lightdash API 返回非 2xx 时抛出的错误。
 *
 * message 格式保持 `Lightdash API <status>: <detail>`（与旧实现一致，
 * 现有按 message 正则判断 403/404 的调用点不受影响），额外暴露结构化的
 * status / detail，供看板类错误做文案映射。
 */
export class LightdashApiError extends Error {
    readonly status: number;

    readonly detail: string;

    constructor(status: number, detail: string) {
        super(`Lightdash API ${status}: ${detail}`);
        this.name = 'LightdashApiError';
        this.status = status;
        this.detail = detail;
    }
}

/** 看板类错误在 MCP 层的统一状态（与文档 §9 的状态枚举一致） */
export type DashboardApiErrorKind =
    | 'dashboard_permission_required'
    | 'dashboard_not_found';

/** 403：看板归属口径不可信（跨项目 / 行级过滤无法应用） */
const DASHBOARD_NOT_FOUND_403_PATTERNS = [
    'dashboard does not belong to project',
    'row level security filter cannot be applied',
];

/** 403：看板 / 空间 / client-use 白名单权限不足 */
const DASHBOARD_PERMISSION_403_PATTERNS = [
    'contact your administrator to configure dashboard access permissions',
    'access to the space this dashboard belongs to',
    'access to this dashboard',
];

/**
 * 把后端错误文案映射成看板类状态；不是看板类错误时返回 null。
 */
export function getDashboardErrorKind(
    error: unknown,
): DashboardApiErrorKind | null {
    if (!(error instanceof LightdashApiError)) {
        return null;
    }
    const detail = error.detail.toLowerCase();
    if (error.status === 403) {
        if (
            DASHBOARD_NOT_FOUND_403_PATTERNS.some((pattern) =>
                detail.includes(pattern),
            )
        ) {
            return 'dashboard_not_found';
        }
        if (
            DASHBOARD_PERMISSION_403_PATTERNS.some((pattern) =>
                detail.includes(pattern),
            )
        ) {
            return 'dashboard_permission_required';
        }
        return null;
    }
    if (error.status === 404) {
        if (
            detail.includes('dashboard not found') ||
            detail.includes('dashboard does not belong to project')
        ) {
            return 'dashboard_not_found';
        }
        return null;
    }
    return null;
}

/** 是否是看板类（权限 / 归属）错误 */
export function isDashboardAccessError(error: unknown): boolean {
    return getDashboardErrorKind(error) !== null;
}

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
                throw new LightdashApiError(
                    401,
                    `OAuth token is accepted by MCP but rejected by downstream API. Try x-api-key in MCP connection headers. Details: ${msg}`,
                );
            }
            throw new LightdashApiError(res.status, msg);
        }
        return res.json() as Promise<T>;
    };
}
