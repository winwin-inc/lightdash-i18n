/**
 * 查询组合层：调用 Lightdash API 的封装，使用环境变量中的 PAT。
 */

const getBaseUrl = () => {
    const url = process.env.LIGHTDASH_SITE_URL;
    if (!url) throw new Error('LIGHTDASH_SITE_URL is not set');
    return url.replace(/\/$/, '');
};

const getApiKey = () => {
    const key = process.env.LIGHTDASH_API_KEY;
    if (!key) throw new Error('LIGHTDASH_API_KEY is not set');
    return key;
};

const headers = () => ({
    Authorization: `ApiKey ${getApiKey()}`,
    'Content-Type': 'application/json',
});

export async function fetchExplores(
    projectUuid: string,
    filtered: boolean = true,
): Promise<unknown> {
    const url = `${getBaseUrl()}/api/v1/projects/${projectUuid}/explores?filtered=${filtered ? 'true' : 'false'}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Lightdash explores failed: ${res.status} ${text}`);
    }
    const json = await res.json();
    return json.results ?? json;
}

export async function fetchExplore(
    projectUuid: string,
    exploreId: string,
): Promise<unknown> {
    const res = await fetch(
        `${getBaseUrl()}/api/v1/projects/${projectUuid}/explores/${exploreId}`,
        { headers: headers() },
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Lightdash explore failed: ${res.status} ${text}`);
    }
    const json = await res.json();
    return json.results ?? json;
}

/**
 * 与 Lightdash 后端 ExecuteAsyncMetricQueryRequestParams 对齐的请求体。
 * 发送前补全必填字段，避免后端收到 undefined 导致 500。
 */
export type MetricQueryPayload = {
    context?: string;
    query: {
        exploreName: string;
        dimensions: string[];
        metrics: string[];
        filters: Record<string, unknown>;
        sorts: Array<{ fieldId: string; descending: boolean; nullsFirst?: boolean }>;
        limit: number;
        tableCalculations: unknown[];
    };
};

/** 执行 metric-query，返回 queryUuid。内部会补全 query 的缺省值以符合后端要求。 */
export async function executeMetricQuery(
    projectUuid: string,
    body: {
        context?: string;
        query: {
            exploreName: string;
            dimensions?: string[];
            metrics?: string[];
            filters?: Record<string, unknown>;
            sorts?: Array<{ fieldId: string; descending: boolean; nullsFirst?: boolean }>;
            limit?: number;
            tableCalculations?: unknown[];
        };
    },
): Promise<{ queryUuid: string }> {
    const q = body.query;
    const payload: MetricQueryPayload = {
        context: body.context ?? 'api',
        query: {
            exploreName: q.exploreName,
            dimensions: Array.isArray(q.dimensions) ? q.dimensions : [],
            metrics: Array.isArray(q.metrics) ? q.metrics : [],
            filters:
                q.filters && typeof q.filters === 'object' && !Array.isArray(q.filters)
                    ? q.filters
                    : {},
            sorts: Array.isArray(q.sorts) ? q.sorts : [],
            limit:
                typeof q.limit === 'number' && Number.isFinite(q.limit) && q.limit > 0
                    ? q.limit
                    : 500,
            tableCalculations: Array.isArray(q.tableCalculations) ? q.tableCalculations : [],
        },
    };
    const res = await fetch(
        `${getBaseUrl()}/api/v2/projects/${projectUuid}/query/metric-query`,
        {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(payload),
        },
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Lightdash metric-query failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { results: { queryUuid: string } };
    return { queryUuid: json.results?.queryUuid ?? (json as unknown as { queryUuid: string }).queryUuid };
}

/** 轮询并获取查询结果（首页），返回 rows 与 columns */
export async function fetchQueryResults(
    projectUuid: string,
    queryUuid: string,
    pageSize = 5000,
): Promise<{ rows: unknown[]; columns: unknown }> {
    const maxAttempts = 120;
    let attempts = 0;

    for (;;) {
        const res = await fetch(
            `${getBaseUrl()}/api/v2/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=${pageSize}`,
            { headers: headers() },
        );
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Lightdash query results failed: ${res.status} ${text}`);
        }
        const json = (await res.json()) as {
            results: {
                status: string;
                rows?: unknown[];
                columns?: unknown;
                error?: string;
            };
        };
        const r = json.results;
        const status = (r?.status ?? '').toLowerCase();

        if (status === 'error' && r.error) throw new Error(r.error);
        if (status === 'cancelled') return { rows: [], columns: {} };
        if (status === 'ready' && r.rows) {
            return { rows: r.rows, columns: r.columns ?? {} };
        }
        attempts += 1;
        if (attempts >= maxAttempts) throw new Error('Query timeout');
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}
