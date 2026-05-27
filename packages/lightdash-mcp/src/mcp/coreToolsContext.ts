import type { LightdashMcpEnvConfig } from '../config';
import { getMcpSession } from '../lib/mcpSessionStore';
import {
    getHttpRequestApiKey,
    getHttpRequestOauthAccessToken,
} from '../lib/requestContext';

export function resolveCoreToolsApiKey(
    config: LightdashMcpEnvConfig,
): string {
    const key =
        getHttpRequestApiKey() ??
        getHttpRequestOauthAccessToken() ??
        config.apiKey;
    if (!key) {
        throw new Error(
            'apiKey or OAuth token is required (Authorization Bearer, x-api-key, or LIGHTDASH_API_KEY)',
        );
    }
    return key;
}

export function resolveCoreToolsProjectUuid(
    config: LightdashMcpEnvConfig,
    apiKey: string,
    fromArgs: string | undefined,
): string {
    const sid =
        (typeof fromArgs === 'string' && fromArgs.length > 0
            ? fromArgs
            : null) ??
        getMcpSession(apiKey).projectUuid ??
        config.defaultProjectUuid;
    if (!sid) {
        throw new Error(
            '缺少 projectUuid：请在环境变量中配置 LIGHTDASH_PROJECT_UUID，或先调用 set_project，或在本次工具参数中传入 projectUuid',
        );
    }
    return sid;
}
