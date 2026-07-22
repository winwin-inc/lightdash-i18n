/**
 * Build the Explorer "语义查询" JSON payload for display/copy.
 * Inject projectUuid / dashboardUuid when present so MCP can use the same
 * context without reverse lookup. Context fields are placed first so they
 * are visually obvious in the editor.
 */
export type SemanticQueryContext = {
    projectUuid?: string | null;
    dashboardUuid?: string | null;
};

function nonEmptyString(value: string | null | undefined): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function buildSemanticQueryJson(
    metricQuery: Record<string, unknown> | object,
    context: SemanticQueryContext = {},
): string {
    const projectUuid = nonEmptyString(context.projectUuid);
    const dashboardUuid = nonEmptyString(context.dashboardUuid);

    const payload = {
        ...(projectUuid ? { projectUuid } : {}),
        ...(dashboardUuid ? { dashboardUuid } : {}),
        ...metricQuery,
    };

    return JSON.stringify(payload, null, 2);
}
