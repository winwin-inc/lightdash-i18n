import type { LightdashMcpEnvConfig } from '../config';
import { getMcpSession } from '../lib/mcpSessionStore';
import { getHttpRequestApiKey } from '../lib/requestContext';

export function resolveCoreToolsApiKey(
    config: LightdashMcpEnvConfig,
    fromArgs: string | undefined,
): string {
    const key = fromArgs ?? getHttpRequestApiKey() ?? config.apiKey;
    if (!key) {
        throw new Error(
            'apiKey is required (x-api-key header, tool argument, or LIGHTDASH_API_KEY)',
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
            'projectUuid is required (set_project, tool argument, or LIGHTDASH_DEFAULT_PROJECT_UUID)',
        );
    }
    return sid;
}
