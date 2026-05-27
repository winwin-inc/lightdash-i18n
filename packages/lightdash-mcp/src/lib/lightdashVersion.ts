export function extractLightdashVersion(health: unknown): string | null {
    if (!health || typeof health !== 'object' || Array.isArray(health)) {
        return null;
    }
    const value = (health as Record<string, unknown>).version;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function isVersionAtLeast(version: string, minVersion: string): boolean {
    const normalize = (v: string): number[] =>
        v
            .replace(/^v/i, '')
            .split('.')
            .map((part) => Number.parseInt(part, 10))
            .map((n) => (Number.isFinite(n) ? n : 0));
    const a = normalize(version);
    const b = normalize(minVersion);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        if (av > bv) return true;
        if (av < bv) return false;
    }
    return true;
}
