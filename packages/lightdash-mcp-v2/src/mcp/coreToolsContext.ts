import type { LightdashMcpEnvConfig } from '../config';
import { getHttpRequestApiKey } from '../lib/requestContext';

export function resolveCoreToolsApiKey(
    config: LightdashMcpEnvConfig,
): string {
    const key = getHttpRequestApiKey();
    if (!key) {
        throw new Error(
            'apiKey is required (Keycloak OAuth → token-exchange PAT in request context)',
        );
    }
    // config retained for call-site compatibility; PAT never comes from env
    void config;
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
            '缺少 projectUuid：请先调用 list_projects 查看可选项目并在本工具传入 projectUuid，或在服务端配置环境变量 LIGHTDASH_PROJECT_UUID',
        );
    }
    return sid;
}
