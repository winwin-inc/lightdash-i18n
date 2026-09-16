import type { LightdashMcpEnvConfig } from '../config';
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
    _apiKey: string,
    fromArgs: string | undefined,
): string {
    const sid =
        (typeof fromArgs === 'string' && fromArgs.length > 0
            ? fromArgs
            : null) ?? config.defaultProjectUuid;
    if (!sid) {
        throw new Error(
            '缺少 projectUuid：请在环境变量中配置 LIGHTDASH_PROJECT_UUID，或在本次工具参数中传入 projectUuid',
        );
    }
    return sid;
}
