/**
 * Pure helpers to derive Lightdash access capabilities from a user's CASL
 * ability rules.
 *
 * Ported from `packages/lightdash-mcp/src/mcp/access/abilityFromRules.ts`
 * (no HTTP calls in this version - the rules are read straight from the
 * session user).
 */

/**
 * The capabilities we report for an organisation or a project.
 */
export type AccessCapabilities = {
    /** The user can browse content (dashboards, charts, spaces). */
    browseContent: boolean;
    /** The user can view saved charts. */
    runSavedChart: boolean;
    /** The user can run metric queries (explores). */
    runMetricQuery: boolean;
    /** The user can export dashboards as code. */
    exportDashboardCode: boolean;
};

/**
 * Coarse grained label derived from a set of capabilities.
 */
export type AccessLevel = 'viewer' | 'interactive_viewer' | 'editor';

/**
 * The scope a capability is computed for.
 */
export type AccessScope =
    | { type: 'org' }
    | { type: 'project'; projectUuid: string };

/**
 * A loosely typed CASL rule. We intentionally keep the fields unknown so that
 * we never trust the shape of the rules coming from the session.
 */
export type AbilityRuleLike = {
    action?: unknown;
    subject?: unknown;
    inverted?: unknown;
    conditions?: unknown;
};

const EMPTY_CAPABILITIES: AccessCapabilities = {
    browseContent: false,
    runSavedChart: false,
    runMetricQuery: false,
    exportDashboardCode: false,
};

export const emptyCapabilities = (): AccessCapabilities => ({
    ...EMPTY_CAPABILITIES,
});

const asStringArray = (value: unknown): string[] => {
    if (typeof value === 'string') {
        return [value];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
};

const ruleConditions = (
    rule: AbilityRuleLike,
): Record<string, unknown> | null => {
    if (
        !rule.conditions ||
        typeof rule.conditions !== 'object' ||
        Array.isArray(rule.conditions)
    ) {
        return null;
    }
    return rule.conditions as Record<string, unknown>;
};

/**
 * The project a rule is scoped to, `null` when the rule applies to the whole
 * organisation.
 */
export const ruleProjectUuid = (rule: AbilityRuleLike): string | null => {
    const conditions = ruleConditions(rule);
    const projectUuid = conditions?.projectUuid;
    return typeof projectUuid === 'string' && projectUuid.length > 0
        ? projectUuid
        : null;
};

export const isOrgScopedRule = (rule: AbilityRuleLike): boolean =>
    ruleProjectUuid(rule) === null;

const ruleMatchesAction = (rule: AbilityRuleLike, action: string): boolean => {
    const actions = asStringArray(rule.action);
    return actions.includes(action) || actions.includes('manage');
};

const ruleMatchesSubject = (
    rule: AbilityRuleLike,
    subject: string,
): boolean => {
    const subjects = asStringArray(rule.subject);
    return subjects.includes(subject) || subjects.includes('all');
};

const ruleAppliesToScope = (
    rule: AbilityRuleLike,
    scope: AccessScope,
): boolean => {
    const scopedProjectUuid = ruleProjectUuid(rule);
    if (scope.type === 'org') {
        return scopedProjectUuid === null;
    }
    return scopedProjectUuid === scope.projectUuid;
};

/**
 * Checks if the given rules allow `action` on `subject` within the scope.
 */
export const canFromRules = (
    rules: AbilityRuleLike[],
    action: string,
    subject: string,
    scope: AccessScope,
): boolean => {
    let allowed = false;
    for (const rule of rules) {
        if (
            ruleMatchesAction(rule, action) &&
            ruleMatchesSubject(rule, subject) &&
            ruleAppliesToScope(rule, scope)
        ) {
            if (rule.inverted === true) {
                return false;
            }
            allowed = true;
        }
    }
    return allowed;
};

/**
 * Derives the capabilities from the ability rules for a given scope.
 */
export const capabilitiesFromRules = (
    rules: AbilityRuleLike[],
    scope: AccessScope,
): AccessCapabilities => ({
    browseContent: canFromRules(rules, 'view', 'Project', scope),
    runSavedChart: canFromRules(rules, 'view', 'SavedChart', scope),
    runMetricQuery: canFromRules(rules, 'view', 'Explore', scope),
    exportDashboardCode: canFromRules(rules, 'view', 'ContentAsCode', scope),
});

/**
 * Merges two capability sets - a capability granted at either level wins.
 */
export const mergeCapabilities = (
    left: AccessCapabilities,
    right: AccessCapabilities,
): AccessCapabilities => ({
    browseContent: left.browseContent || right.browseContent,
    runSavedChart: left.runSavedChart || right.runSavedChart,
    runMetricQuery: left.runMetricQuery || right.runMetricQuery,
    exportDashboardCode:
        left.exportDashboardCode || right.exportDashboardCode,
});

/**
 * Maps capabilities to a coarse grained access level.
 */
export const accessLevelFromCapabilities = (
    capabilities: AccessCapabilities,
): AccessLevel | null => {
    if (capabilities.exportDashboardCode) {
        return 'editor';
    }
    if (capabilities.runMetricQuery) {
        return 'interactive_viewer';
    }
    if (capabilities.browseContent || capabilities.runSavedChart) {
        return 'viewer';
    }
    return null;
};

/**
 * Normalises the `abilityRules` of a session user into a list of rules we can
 * safely reason about.
 */
export const parseAbilityRules = (value: unknown): AbilityRuleLike[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(
        (item): item is AbilityRuleLike =>
            item !== null && typeof item === 'object' && !Array.isArray(item),
    );
};
