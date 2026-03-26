export type LightdashMcpEnvConfig = {
    baseUrl: string;
    apiKey: string;
    defaultProjectUuid: string | undefined;
    maxLimit: number;
};

export function loadConfigFromEnv(): LightdashMcpEnvConfig {
    const raw = process.env.LIGHTDASH_SITE_URL;
    const apiKey = process.env.LIGHTDASH_API_KEY;
    if (!raw) {
        throw new Error('LIGHTDASH_SITE_URL is required');
    }
    if (!apiKey) {
        throw new Error('LIGHTDASH_API_KEY is required');
    }
    const baseUrl = raw.replace(/\/$/, '');
    const maxLimitRaw = process.env.LIGHTDASH_MAX_LIMIT;
    const maxLimit =
        maxLimitRaw !== undefined &&
        Number.isFinite(Number(maxLimitRaw)) &&
        Number(maxLimitRaw) > 0
            ? Number(maxLimitRaw)
            : 5000;
    return {
        baseUrl,
        apiKey,
        defaultProjectUuid: process.env.LIGHTDASH_DEFAULT_PROJECT_UUID,
        maxLimit,
    };
}
