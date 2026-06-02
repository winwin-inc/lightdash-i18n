const EMPTY_ARRAY_KEYS = [
    'additionalMetrics',
    'customDimensions',
    'tableCalculations',
] as const;

export function parseMetricQueryInput(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) {
        throw new Error(
            'run_semantic_metric_query 缺少 metricQuery：请传入 Explorer 复制的 Metric Query 对象',
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
            throw new Error(
                'metricQuery 必须是 JSON 对象或 object，字符串需为合法 JSON',
            );
        }
        throw new Error('metricQuery 必须是 JSON 对象');
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) };
    }
    throw new Error('metricQuery 必须是 object（非数组）');
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
): Record<string, unknown> {
    const parsed = parseMetricQueryInput(metricQuery);
    const { exploreName } = parsed;
    if (typeof exploreName !== 'string' || exploreName.length === 0) {
        throw new Error(
            'metricQuery.exploreName 必须为非空字符串',
        );
    }
    let query = omitEmptyOptionalMetricQueryFields(parsed);
    if (limitOverride !== undefined) {
        query = { ...query, limit: limitOverride };
    }
    return query;
}

const FLAT_ONLY_KEYS = [
    'exploreName',
    'dimensions',
    'metrics',
    'filters',
    'sorts',
    'limit',
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
            `run_semantic_metric_query 仅接受 metricQuery，请勿同时传扁平字段：${present.join(', ')}。简单查询请用 run_metric_query。`,
        );
    }
}

export function assertNoSemanticMetricQueryArgs(
    args: Record<string, unknown>,
): void {
    if (args.metricQuery !== undefined) {
        throw new Error(
            '整段 Metric Query 请使用 run_semantic_metric_query，参数名为 metricQuery。',
        );
    }
}
