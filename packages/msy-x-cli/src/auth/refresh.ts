import { open, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { refreshAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CliError } from '../cli/errors';
import { getConfigDir, type EnvVars } from '../config/paths';
import { readConfig, writeConfig } from '../config/store';
import { debugLog } from '../lib/logger';
import type {
    AuthCredentials,
    CliConfig,
    OAuthCredentials,
    SiteProfile,
} from '../types';
import { authorizationServerUrlFromMcpUrl } from './oauth';
import { DEFAULT_TOKEN_TTL_S } from './oauthProvider';

/**
 * 凭证保鲜（设计稿 §4.4 / §5.1）：
 *
 * - access 未过期直接原样返回（纯本地判定，不发请求）；
 * - 过期则拿 `refresh.lock`（O_EXCL 创建 + 30s 过期判定）后用 refresh_token
 *   换新，原子写回（writeConfig 临时文件 + rename）；
 * - 任何刷新失败：清空该站点凭证并抛 AUTH_REQUIRED（退 3，提示重新登录）；
 * - 拿不到锁（并发进程在刷）：轮询读配置文件最多 5s，吃到别人刷好的结果，
 *   保证并发命令只刷一次（避免 refresh token 被重复消费失效）。
 */

const LOCK_FILE_NAME = 'refresh.lock';
const LOCK_STALE_MS = 30_000;
const POLL_TOTAL_MS = 5_000;
const POLL_INTERVAL_MS = 100;

export type EnsureFreshCredentialsInput = {
    site: SiteProfile;
    credentials: AuthCredentials;
    config: CliConfig;
    env?: EnvVars;
    fetchFn?: FetchLike;
    now?: () => number;
};

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const isExpired = (credentials: OAuthCredentials, now: () => number): boolean =>
    Date.parse(credentials.accessExpiresAt) <= now();

const authRequiredAfterRefreshFailure = (cause: unknown): CliError =>
    new CliError({
        code: 'AUTH_REQUIRED',
        message: '刷新访问令牌失败，已清空该站点凭证',
        hint: '运行 msy-x auth login 重新登录',
        cause,
    });

const lockPathOf = (env: EnvVars): string =>
    path.join(getConfigDir(env), LOCK_FILE_NAME);

/** 尝试 O_EXCL 创建锁文件；返回 true=拿到锁，false=被别的进程持有 */
const tryAcquireLock = async (lockPath: string): Promise<boolean> => {
    try {
        const handle = await open(lockPath, 'wx');
        await handle.write(`${process.pid} ${new Date().toISOString()}`);
        await handle.close();
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
        throw error;
    }
};

/** 锁文件超过 30s 视为残留（持锁进程崩溃），清掉后可重试 */
const breakStaleLock = async (lockPath: string, now: () => number): Promise<void> => {
    try {
        const info = await stat(lockPath);
        if (now() - info.mtimeMs >= LOCK_STALE_MS) {
            debugLog('发现过期 refresh.lock，清除后重试', lockPath);
            await unlink(lockPath).catch(() => undefined);
        }
    } catch {
        // stat 失败（正好被释放等）交给上层重试
    }
};

const releaseLock = async (lockPath: string): Promise<void> => {
    await unlink(lockPath).catch((error: unknown) => {
        debugLog('释放 refresh.lock 失败（忽略）', error);
    });
};

/** 拿不到锁：轮询读配置文件，等并发进程刷完（最多 POLL_TOTAL_MS） */
const waitForConcurrentRefresh = async (
    site: SiteProfile,
    staleAccessToken: string,
    env: EnvVars,
    now: () => number,
): Promise<OAuthCredentials> => {
    const deadline = now() + POLL_TOTAL_MS;
    for (;;) {
        await sleep(POLL_INTERVAL_MS);
        const config = await readConfig(env);
        const credentials = config.auth[site.name];
        if (credentials === undefined || credentials.mode !== 'oauth') {
            // 并发进程刷新失败清掉了凭证：这里也按失效处理
            throw new CliError({
                code: 'AUTH_REQUIRED',
                message: '凭证已失效（并发刷新未成功）',
                hint: '运行 msy-x auth login 重新登录',
            });
        }
        if (credentials.accessToken !== staleAccessToken && !isExpired(credentials, now)) {
            debugLog('并发进程已完成刷新，直接复用新凭证');
            return credentials;
        }
        if (now() >= deadline) {
            throw new CliError({
                code: 'AUTH_REQUIRED',
                message: `等待并发刷新超时（${POLL_TOTAL_MS}ms）`,
                hint: '稍后重试，或运行 msy-x auth login 重新登录',
            });
        }
    }
};

/** 清空某站点凭证并原子写回（尽力而为，失败只记 debug 日志） */
export const clearSiteCredentials = async (
    siteName: string,
    env: EnvVars,
): Promise<void> => {
    try {
        const config = await readConfig(env);
        if (config.auth[siteName] === undefined) return;
        delete config.auth[siteName];
        await writeConfig(config, env);
        debugLog(`已清空站点 ${siteName} 的凭证`);
    } catch (error) {
        debugLog('清空站点凭证失败（忽略，凭证可能仍在文件中）', error);
    }
};

export const ensureFreshCredentials = async ({
    site,
    credentials,
    config,
    env = process.env,
    fetchFn,
    now = Date.now,
}: EnsureFreshCredentialsInput): Promise<AuthCredentials> => {
    // PAT 无过期概念，原样返回
    if (credentials.mode === 'pat') return credentials;
    if (!isExpired(credentials, now)) return credentials;

    if (credentials.refreshToken === null) {
        await clearSiteCredentials(site.name, env);
        throw new CliError({
            code: 'AUTH_REQUIRED',
            message: '访问令牌已过期且没有 refresh token',
            hint: '运行 msy-x auth login 重新登录',
        });
    }

    const lockPath = lockPathOf(env);
    let acquired = await tryAcquireLock(lockPath);
    if (!acquired) {
        await breakStaleLock(lockPath, now);
        acquired = await tryAcquireLock(lockPath);
    }

    if (!acquired) {
        return waitForConcurrentRefresh(site, credentials.accessToken, env, now);
    }

    try {
        const tokens = await refreshAuthorization(
            authorizationServerUrlFromMcpUrl(site.mcpUrl),
            {
                clientInformation:
                    credentials.clientSecret === null
                        ? { client_id: credentials.clientId }
                        : {
                              client_id: credentials.clientId,
                              client_secret: credentials.clientSecret,
                          },
                refreshToken: credentials.refreshToken,
                addClientAuthentication: async (_headers, params) => {
                    params.set('client_id', credentials.clientId);
                    if (credentials.clientSecret !== null) {
                        params.set('client_secret', credentials.clientSecret);
                    }
                },
                fetchFn,
            },
        );
        const next: OAuthCredentials = {
            ...credentials,
            accessToken: tokens.access_token,
            accessExpiresAt: new Date(
                now() + (tokens.expires_in ?? DEFAULT_TOKEN_TTL_S) * 1000,
            ).toISOString(),
            refreshToken: tokens.refresh_token ?? credentials.refreshToken,
            scope: tokens.scope ?? credentials.scope,
        };
        // 重新读配置再写回，避免覆盖并发进程对其它站点的改动；
        // 入参 config 只用于诊断（调用方读到的版本可能与磁盘不一致）
        debugLog('ensureFreshCredentials 写回前重读配置', {
            site: site.name,
            callerCurrentSite: config.currentSite,
        });
        const latest = await readConfig(env);
        latest.auth[site.name] = next;
        await writeConfig(latest, env);
        return next;
    } catch (error) {
        await clearSiteCredentials(site.name, env);
        throw authRequiredAfterRefreshFailure(error);
    } finally {
        await releaseLock(lockPath);
    }
};
