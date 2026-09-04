/**
 * Build the Explorer "语义查询" JSON payload for display/copy.
 * Inject projectUuid / dashboardUuid when present so MCP can use the same
 * context without reverse lookup. Context fields are placed first so they
 * are visually obvious in the editor.
 * limit / offset are always last and adjacent (pagination-friendly).
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

    const { limit, offset, ...rest } = metricQuery as Record<string, unknown>;

    const payload: Record<string, unknown> = {
        ...(projectUuid ? { projectUuid } : {}),
        ...(dashboardUuid ? { dashboardUuid } : {}),
        ...rest,
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
    };

    return JSON.stringify(payload, null, 2);
}
