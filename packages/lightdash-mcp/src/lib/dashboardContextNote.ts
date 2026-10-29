/**
 * Explains why the dashboard context could not be resolved for a query.
 *
 * Kept in one place so every tool reports the same wording for the same
 * resolution status.
 */
export function buildUnresolvedDashboardNote(params: {
    /** Status returned by the dashboard context resolver, if any. */
    resolveStatus: string | undefined;
    /** Hint returned by the resolver when it found no candidate. */
    hint: string | undefined;
    /** Whether the explore/chart needs a dashboard context to be safe. */
    requiresDashboardContext: boolean;
    /** Message used when a dashboard context is required but was not found. */
    contextMissingMessage: string;
    /** Message used when the dashboard context is not required. */
    contextNotRequiredMessage: string;
}): string {
    if (params.resolveStatus === 'none') {
        return params.hint ?? '';
    }
    if (params.requiresDashboardContext) {
        return params.contextMissingMessage;
    }
    return params.contextNotRequiredMessage;
}
