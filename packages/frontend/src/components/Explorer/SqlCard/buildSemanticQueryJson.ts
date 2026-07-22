/**
 * Build the Explorer "语义查询" JSON payload for display/copy.
 * When opened from a dashboard (`fromDashboard`), include dashboardUuid so
 * MCP can use the same context without reverse lookup.
 * Place dashboardUuid first so it is visually obvious in the editor.
 */
export function buildSemanticQueryJson(
    metricQuery: Record<string, unknown> | object,
    dashboardUuid: string | null | undefined,
): string {
    const payload =
        typeof dashboardUuid === 'string' && dashboardUuid.length > 0
            ? { dashboardUuid, ...metricQuery }
            : metricQuery;
    return JSON.stringify(payload, null, 2);
}
