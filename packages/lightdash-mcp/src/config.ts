import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Node 不会自动读 .env；与 packages/lightdash-mcp/.env.example 对齐
loadDotenv({ path: path.join(__dirname, '..', '.env') });

export type LightdashMcpEnvConfig = {
    baseUrl: string;
    apiKey: string | undefined;
    defaultProjectUuid: string | undefined;
    maxLimit: number;
};

export function loadConfigFromEnv(): LightdashMcpEnvConfig {
    const raw = process.env.LIGHTDASH_SITE_URL;
    const apiKey = process.env.LIGHTDASH_API_KEY;
    if (!raw) {
        throw new Error(
            'LIGHTDASH_SITE_URL is required（请设置环境变量，或在 packages/lightdash-mcp/.env 中配置，参考 .env.example）',
        );
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
