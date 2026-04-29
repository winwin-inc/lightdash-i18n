import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Node 不会自动读 .env；与 packages/lightdash-mcp/.env.example 对齐
loadDotenv({ path: path.join(__dirname, '..', '.env') });

export type LightdashMcpEnvConfig = {
    baseUrl: string;
    apiKey: string | undefined;
    defaultProjectUuid: string;
    maxLimit: number;
};

export function loadConfigFromEnv(): LightdashMcpEnvConfig {
    const raw = process.env.LIGHTDASH_SITE_URL;
    const apiKey = process.env.LIGHTDASH_API_KEY;
    const defaultProjectUuid = process.env.LIGHTDASH_PROJECT_UUID?.trim();
    if (!raw) {
        throw new Error(
            'LIGHTDASH_SITE_URL is required（请设置环境变量，或在 packages/lightdash-mcp/.env 中配置，参考 .env.example）',
        );
    }
    if (!defaultProjectUuid) {
        throw new Error(
            'LIGHTDASH_PROJECT_UUID 为必填：表示 MCP 默认使用的项目 UUID，未 set_project / 未在工具参数传 projectUuid 时使用（见 .env.example）',
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
        defaultProjectUuid,
        maxLimit,
    };
}
