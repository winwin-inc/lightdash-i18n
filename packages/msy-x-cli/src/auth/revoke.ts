import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { EnvVars } from '../config/paths';
import { readConfig, writeConfig } from '../config/store';
import { debugLog } from '../lib/logger';
import type { AuthCredentials, CliConfig, SiteProfile } from '../types';
import { withSiteLock } from './configLock';
import { authorizationServerUrlFromMcpUrl } from './oauth';

/**
 * 登出（设计稿 §5.3 `auth logout`）：
 *
 * - 尽力 revoke：把 refresh token POST 到 `{site}/api/v1/oauth/revoke`，
 *   失败只在 debug 日志记录（站点不可达 / 已失效都不影响本地登出）；
 * - 随后在站点锁内「重读配置 → 删凭证 → 原子写回」：刷新进程与登录进程
 *   共用同一把锁，所以不会把并发完成的新登录删掉（反而应该保留它）；
 * - 幂等：没有凭证时同样成功。
 */

export type LogoutInput = {
    site: SiteProfile;
    /** 当前凭证（仅用于尽力 revoke；删除哪一份以磁盘最新内容为准） */
    credentials: AuthCredentials | null;
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
            debugLog(
                `revoke 端点返回 HTTP ${response.status}（忽略，继续本地登出）`,
            );
        }
    } catch (error) {
        debugLog('revoke 请求失败（忽略，继续本地登出）', error);
    }
};

/**
 * revoke（尽力） + 在站点锁内删除该站点凭证 + 原子写回。
 * 返回写回后的配置；凭证本就不存在时原样返回（幂等）。
 */
export const logout = async ({
    site,
    credentials,
    env = process.env,
    fetchFn = fetch,
}: LogoutInput): Promise<CliConfig> => {
    if (credentials !== null) {
        await revokeBestEffort({ site, credentials, fetchFn });
    }
    return withSiteLock({ siteName: site.name, env }, async () => {
        // 锁内重读：期间可能刚完成一次新登录，不能拿旧快照去覆盖
        const latest = await readConfig(env);
        if (latest.auth[site.name] === undefined) return latest;
        const next: CliConfig = { ...latest, auth: { ...latest.auth } };
        delete next.auth[site.name];
        await writeConfig(next, env);
        debugLog(`已删除站点 ${site.name} 的凭证`);
        return next;
    });
};
