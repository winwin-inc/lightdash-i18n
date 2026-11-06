export type AccessCapabilities = {
    browseContent: boolean;
    runSavedChart: boolean;
    runMetricQuery: boolean;
    exportDashboardCode: boolean;
};

export type AccessLevel = 'viewer' | 'interactive_viewer' | 'editor';

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

export function emptyCapabilities(): AccessCapabilities {
    return { ...EMPTY_CAPABILITIES };
}

function asStringArray(value: unknown): string[] {
    if (typeof value === 'string') {
        return [value];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
}

function ruleConditions(
    rule: AbilityRuleLike,
): Record<string, unknown> | null {
    if (
        !rule.conditions ||
        typeof rule.conditions !== 'object' ||
        Array.isArray(rule.conditions)
    ) {
        return null;
    }
    return rule.conditions as Record<string, unknown>;
}

export function ruleProjectUuid(rule: AbilityRuleLike): string | null {
    const conditions = ruleConditions(rule);
    const projectUuid = conditions?.projectUuid;
    return typeof projectUuid === 'string' && projectUuid.length > 0
        ? projectUuid
        : null;
}

export function isOrgScopedRule(rule: AbilityRuleLike): boolean {
    return ruleProjectUuid(rule) === null;
}

function ruleMatchesAction(rule: AbilityRuleLike, action: string): boolean {
    const actions = asStringArray(rule.action);
    return actions.includes(action) || actions.includes('manage');
}

function ruleMatchesSubject(rule: AbilityRuleLike, subject: string): boolean {
    const subjects = asStringArray(rule.subject);
    return subjects.includes(subject) || subjects.includes('all');
}

export function canFromRules(
    rules: AbilityRuleLike[],
    action: string,
    subject: string,
    scope: { type: 'org' } | { type: 'project'; projectUuid: string },
): boolean {
    let allowed = false;
    for (const rule of rules) {
        if (!ruleMatchesAction(rule, action) || !ruleMatchesSubject(rule, subject)) {
            continue;
        }
        const scopedProjectUuid = ruleProjectUuid(rule);
        if (scope.type === 'org') {
            if (scopedProjectUuid !== null) {
                continue;
            }
        } else if (
            scopedProjectUuid !== null &&
            scopedProjectUuid !== scope.projectUuid
        ) {
            continue;
        } else if (scopedProjectUuid === null && scope.type === 'project') {
            continue;
        }
        if (rule.inverted === true) {
            return false;
        }
        allowed = true;
    }
    return allowed;
}

export function capabilitiesFromRules(
    rules: AbilityRuleLike[],
    scope: { type: 'org' } | { type: 'project'; projectUuid: string },
): AccessCapabilities {
    return {
        browseContent: canFromRules(rules, 'view', 'Project', scope),
        runSavedChart: canFromRules(rules, 'view', 'SavedChart', scope),
        runMetricQuery: canFromRules(rules, 'view', 'Explore', scope),
        exportDashboardCode: canFromRules(rules, 'view', 'ContentAsCode', scope),
    };
}

export function mergeCapabilities(
    left: AccessCapabilities,
    right: AccessCapabilities,
): AccessCapabilities {
    return {
        browseContent: left.browseContent || right.browseContent,
        runSavedChart: left.runSavedChart || right.runSavedChart,
        runMetricQuery: left.runMetricQuery || right.runMetricQuery,
        exportDashboardCode:
            left.exportDashboardCode || right.exportDashboardCode,
    };
}

export function accessLevelFromCapabilities(
    capabilities: AccessCapabilities,
): AccessLevel | null {
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
}

export function parseAbilityRules(value: unknown): AbilityRuleLike[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(
        (item): item is AbilityRuleLike =>
            item !== null && typeof item === 'object' && !Array.isArray(item),
    );
}
