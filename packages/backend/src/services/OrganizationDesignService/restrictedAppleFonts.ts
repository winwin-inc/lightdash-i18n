// STUB: Apple system-font restriction helpers used by theme sandbox/download.
// Full policy (font table inspection) can be ported from upstream later.

export const APPLE_SANS_SYSTEM_FONT_STACK =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export type RestrictedAppleFontMatch = {
    family: string;
    fallback: string;
    evidence: 'metadata' | 'filename';
    matchedValue: string;
    /** @deprecated prefer `family` — kept for older call sites */
    fontFamily?: string;
};

export type ThemeFileBundlingDecision =
    | { status: 'include' }
    | { status: 'omit'; match: RestrictedAppleFontMatch };

export async function inspectThemeFileForBundling(
    ..._args: unknown[]
): Promise<ThemeFileBundlingDecision> {
    return { status: 'include' };
}

export const omittedThemeFontGuidance = (
    matches: RestrictedAppleFontMatch[],
): string => {
    if (matches.length === 0) return '';
    const stacks = [
        ...new Set(matches.map(({ fallback }) => fallback)),
    ];
    const count = matches.length;
    return [
        `${count} theme font file${count === 1 ? ' was' : 's were'} omitted because ${count === 1 ? 'it matches' : 'they match'} the restricted Apple system-font policy.`,
        'Do not recreate, embed, or download the omitted font files. Preserve the intended typography with these system font stacks:',
        ...stacks.map((fallback) => `- \`${fallback}\``),
    ].join('\n');
};
