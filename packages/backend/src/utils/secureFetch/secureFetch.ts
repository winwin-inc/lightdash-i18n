// STUB: secure fetch with options used by Data Apps dependency guards.
// Full SSRF-hardened implementation can be ported from upstream later.
export type SecureFetchReason =
    | 'non_https'
    | 'blocked_ip'
    | 'invalid_url'
    | 'redirect'
    | 'timeout'
    | 'too_large'
    | 'disallowed_content_type'
    | 'request_failed';

export class SecureFetchError extends Error {
    public readonly reason: SecureFetchReason;

    constructor(reason: SecureFetchReason, message: string) {
        super(message);
        this.name = 'SecureFetchError';
        this.reason = reason;
    }
}

export type SecureFetchOptions = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: string | Buffer | null;
    timeoutMs?: number;
    maxResponseBytes?: number;
    allowedContentTypes?: string[];
};

export type RegistryFetchResult = {
    bodyText: string;
    truncated: boolean;
    status: number;
    ok: boolean;
    headers?: Headers;
    contentType?: string;
};

export async function secureFetch(
    url: string,
    init?: RequestInit & {
        timeoutMs?: number;
        maxResponseBytes?: number;
        allowedContentTypes?: string[];
    },
): Promise<RegistryFetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        init?.timeoutMs ?? 30_000,
    );
    try {
        // Strip custom options before passing to fetch
        const {
            timeoutMs: _t,
            maxResponseBytes: _m,
            allowedContentTypes: _a,
            ...fetchInit
        } = init ?? {};
        const res = await fetch(url, {
            ...fetchInit,
            signal: controller.signal,
        } as RequestInit);
        const bodyText = await res.text();
        const contentType = res.headers.get('content-type') ?? '';
        if (
            _a &&
            _a.length > 0 &&
            !_a.some((allowed) => contentType.includes(allowed))
        ) {
            throw new SecureFetchError(
                'disallowed_content_type',
                `Disallowed content type: ${contentType}`,
            );
        }
        return {
            bodyText,
            truncated: false,
            status: res.status,
            ok: res.ok,
            headers: res.headers,
            contentType,
        };
    } finally {
        clearTimeout(timeout);
    }
}
