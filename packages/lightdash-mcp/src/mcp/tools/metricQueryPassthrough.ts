import { z } from 'zod';

function coerceMetricQueryToJsonString(value: unknown): unknown {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return JSON.stringify(value);
    }
    return value;
}

/** MCP tool arg: Explorer Metric Query JSON string (single text field). */
export const metricQueryInputSchema = z.preprocess(
    coerceMetricQueryToJsonString,
    z
        .string()
        .min(1)
        .describe('Explorer 复制的 Metric Query JSON 字符串'),
);

const EMPTY_ARRAY_KEYS = [
    'additionalMetrics',
    'customDimensions',
    'tableCalculations',
] as const;

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function parseMetricQueryInput(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) {
        throw new Error(
            'run_semantic_metric_query 缺少 metricQuery：请传入 Explorer 复制的 Metric Query JSON 字符串',
        );
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (
                parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
            ) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            throw new Error('metricQuery 须为合法 JSON 对象字符串');
        }
        throw new Error('metricQuery JSON 须解析为 object（非数组）');
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) };
    }
    throw new Error('metricQuery 须为 JSON 字符串或 object（非数组）');
}

export function omitEmptyOptionalMetricQueryFields(
    query: Record<string, unknown>,
): Record<string, unknown> {
    const out = { ...query };
    for (const key of EMPTY_ARRAY_KEYS) {
        const v = out[key];
        if (Array.isArray(v) && v.length === 0) {
            delete out[key];
        }
    }
    const { metricOverrides } = out;
    if (
        metricOverrides &&
        typeof metricOverrides === 'object' &&
        !Array.isArray(metricOverrides) &&
        Object.keys(metricOverrides).length === 0
    ) {
        delete out.metricOverrides;
    }
    return out;
}

export function prepareSemanticMetricQueryBody(
    metricQuery: unknown,
    limitOverride: number | undefined,
): {
    query: Record<string, unknown>;
    dashboardUuid: string | undefined;
    projectUuid: string | undefined;
} {
    const parsed = parseMetricQueryInput(metricQuery);
    const { exploreName } = parsed;
    if (typeof exploreName !== 'string' || exploreName.length === 0) {
        throw new Error('metricQuery.exploreName 必须为非空字符串');
    }
    const embeddedDashboardUuid = nonEmptyString(parsed.dashboardUuid);
    const embeddedProjectUuid = nonEmptyString(parsed.projectUuid);
    const {
        dashboardUuid: _dashboardUuid,
        projectUuid: _projectUuid,
        ...withoutContext
    } = parsed;
    let query = omitEmptyOptionalMetricQueryFields(withoutContext);
    if (limitOverride !== undefined) {
        query = { ...query, limit: limitOverride };
    }
    return {
        query,
        dashboardUuid: embeddedDashboardUuid,
        projectUuid: embeddedProjectUuid,
    };
}

const FLAT_ONLY_KEYS = [
    'exploreName',
    'dimensions',
    'metrics',
    'filters',
    'sorts',
    // note: top-level `limit` is valid on run_semantic_metric_query (overrides metricQuery.limit)
    'tableCalculations',
    'additionalMetrics',
    'customDimensions',
    'timezone',
    'metricOverrides',
    'requiredFilterFieldIds',
] as const;

export function assertNoFlatMetricQueryArgs(args: Record<string, unknown>): void {
    const present = FLAT_ONLY_KEYS.filter((k) => args[k] !== undefined);
    if (present.length > 0) {
        throw new Error(
            [
                `run_semantic_metric_query 仅接受 metricQuery 字符串，请勿传扁平字段：${present.join(', ')}。`,
                '请把 Explorer 整段 JSON 作为字符串放进 metricQuery，',
                '或使用 run_metric_query 扁平参数。',
            ].join(''),
        );
    }
}

export function assertNoSemanticMetricQueryArgs(
    args: Record<string, unknown>,
): void {
    if (args.metricQuery !== undefined) {
        throw new Error(
            '整段 Metric Query 请使用 run_semantic_metric_query，参数名为 metricQuery（JSON 字符串）。',
        );
    }
}
