import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { EnvVars } from '../config/paths';
import { writeConfig } from '../config/store';
import { debugLog } from '../lib/logger';
import type { AuthCredentials, CliConfig, SiteProfile } from '../types';
import { authorizationServerUrlFromMcpUrl } from './oauth';

/**
 * 登出（设计稿 §5.3 `auth logout`）：
 *
 * - 尽力 revoke：把 refresh token POST 到 `{site}/api/v1/oauth/revoke`，
 *   失败只在 debug 日志记录（站点不可达 / 已失效都不影响本地登出）；
 * - 随后删除该站点凭证并原子写回；幂等：没有凭证时同样成功。
 */

export type LogoutInput = {
    site: SiteProfile;
    credentials: AuthCredentials;
    config: CliConfig;
    env?: EnvVars;
    fetchFn?: FetchLike;
};

const revokeEndpointOf = (mcpUrl: string): string =>
    `${authorizationServerUrlFromMcpUrl(mcpUrl)}/revoke`;

/** 尽力 revoke；任何异常只进 debug 日志，绝不打断本地登出 */
const revokeBestEffort = async ({
    site,
    credentials,
    fetchFn,
}: {
    site: SiteProfile;
    credentials: AuthCredentials;
    fetchFn: FetchLike;
}): Promise<void> => {
    if (credentials.mode !== 'oauth' || credentials.refreshToken === null) {
        // PAT 的吊销在站点个人设置里做；本地删除即可
        return;
    }
    const params = new URLSearchParams({ token: credentials.refreshToken });
    params.set('client_id', credentials.clientId);
    if (credentials.clientSecret !== null) {
        params.set('client_secret', credentials.clientSecret);
    }
    try {
        const response = await fetchFn(revokeEndpointOf(site.mcpUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });
        if (!response.ok) {
            debugLog(`revoke 端点返回 HTTP ${response.status}（忽略，继续本地登出）`);
        }
    } catch (error) {
        debugLog('revoke 请求失败（忽略，继续本地登出）', error);
    }
};

/**
 * revoke（尽力） + 删除该站点凭证 + 原子写回。
 * 返回写回后的配置；凭证本就不存在时原样返回（幂等）。
 */
export const logout = async ({
    site,
    credentials,
    config,
    env = process.env,
    fetchFn = fetch,
}: LogoutInput): Promise<CliConfig> => {
    await revokeBestEffort({ site, credentials, fetchFn });
    if (config.auth[site.name] === undefined) return config;
    const next: CliConfig = { ...config, auth: { ...config.auth } };
    delete next.auth[site.name];
    await writeConfig(next, env);
    debugLog(`已删除站点 ${site.name} 的凭证`);
    return next;
};
