import { NextRequest, NextResponse } from 'next/server';
import {
    executeMetricQuery,
    fetchQueryResults,
} from '@/lib/lightdash';

/**
 * 与 Lightdash 后端 MetricQueryRequest 对齐的请求体类型。
 * 中间层负责校验并补全缺省字段，避免后端收到 undefined 导致 500。
 */
type MetricQueryBody = {
    projectUuid: string;
    query: {
        exploreName: string;
        dimensions?: string[];
        metrics?: string[];
        filters?: Record<string, unknown>;
        sorts?: Array<{ fieldId: string; descending: boolean; nullsFirst?: boolean }>;
        limit?: number;
        tableCalculations?: unknown[];
    };
};

/** 补全为后端必填且不可为 undefined 的完整 query 对象 */
function normalizeQuery(
    query: MetricQueryBody['query'],
): {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters: Record<string, unknown>;
    sorts: Array<{ fieldId: string; descending: boolean; nullsFirst?: boolean }>;
    limit: number;
    tableCalculations: unknown[];
} {
    const dimensions = Array.isArray(query.dimensions) ? query.dimensions : [];
    const metrics = Array.isArray(query.metrics) ? query.metrics : [];
    const rawSorts = Array.isArray(query.sorts) ? query.sorts : [];
    const sorts = rawSorts
        .filter(
            (s): s is { fieldId: string; descending: boolean; nullsFirst?: boolean } =>
                typeof s === 'object' &&
                s !== null &&
                'fieldId' in s &&
                'descending' in s &&
                typeof (s as { fieldId: unknown }).fieldId === 'string',
        )
        .map((s) => ({
            fieldId: String(s.fieldId),
            descending: Boolean(s.descending),
            ...(typeof s.nullsFirst === 'boolean' ? { nullsFirst: s.nullsFirst } : {}),
        }));
    const limit =
        typeof query.limit === 'number' && Number.isFinite(query.limit) && query.limit > 0
            ? query.limit
            : 500;
    const tableCalculations = Array.isArray(query.tableCalculations)
        ? query.tableCalculations
        : [];
    const filters =
        query.filters && typeof query.filters === 'object' && !Array.isArray(query.filters)
            ? query.filters
            : {};

    return {
        exploreName: query.exploreName,
        dimensions,
        metrics,
        filters,
        sorts,
        limit,
        tableCalculations,
    };
}

export async function POST(request: NextRequest) {
    let body: MetricQueryBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 },
        );
    }

    const { projectUuid, query } = body;
    if (!projectUuid || typeof projectUuid !== 'string' || !projectUuid.trim()) {
        return NextResponse.json(
            { error: 'projectUuid is required and must be a non-empty string' },
            { status: 400 },
        );
    }
    if (!query || typeof query !== 'object' || !query.exploreName || typeof query.exploreName !== 'string') {
        return NextResponse.json(
            { error: 'query.exploreName is required and must be a non-empty string' },
            { status: 400 },
        );
    }

    const metricQuery = normalizeQuery(query);

    try {
        const { queryUuid } = await executeMetricQuery(projectUuid, {
            query: metricQuery,
        });
        const { rows, columns } = await fetchQueryResults(
            projectUuid,
            queryUuid,
        );
        return NextResponse.json({ rows, columns });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
