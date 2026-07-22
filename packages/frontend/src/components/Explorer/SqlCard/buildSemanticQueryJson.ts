/**
 * Build the Explorer "语义查询" JSON payload for display/copy.
 * When opened from a dashboard (`fromDashboard`), include dashboardUuid so
 * MCP can use the same context without reverse lookup.
 */
export function buildSemanticQueryJson(
    metricQuery: Record<string, unknown> | object,
    dashboardUuid: string | null | undefined,
): string {
    const payload =
        typeof dashboardUuid === 'string' && dashboardUuid.length > 0
            ? { ...metricQuery, dashboardUuid }
            : metricQuery;
    return JSON.stringify(payload, null, 2);
}
