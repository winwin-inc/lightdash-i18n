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
 * - 刷新失败分两类（2026-11 修）：服务端明确否掉 refresh_token（`invalid_grant`
 *   等）才清凭证并抛 AUTH_REQUIRED；网络错误 / 5xx / 非 OAuth 错误体属于暂时
 *   失败，**保留本地凭证**并抛 NETWORK（退 6），避免一次 503 就把登录删掉；
 * - 写回与清空都先重读配置比对快照：磁盘上已被并发进程或新登录替换时不动它
 *   （避免刷新结果或清空动作吃掉刚完成的新登录）；
 * - 拿不到锁（并发进程在刷）：轮询读配置文件最多 5s，吃到别人刷好的结果，
 *   保证并发命令只刷一次（避免 refresh token 被重复消费失效）。
 */

const LOCK_FILE_NAME = 'refresh.lock';
const LOCK_STALE_MS = 30_000;
const POLL_TOTAL_MS = 5_000;
const POLL_INTERVAL_MS = 100;

/**
 * 服务端明确否掉 refresh_token 的 OAuth 错误码（RFC 6749 §5.2）。
 * 只有这几种才代表凭证真的作废，可以清空并要求重新登录；
 * `server_error` / `temporarily_unavailable` / `invalid_request` 都不是。
 */
const PERMANENT_REFRESH_ERROR_CODES: ReadonlySet<string> = new Set([
    'invalid_grant',
    'invalid_client',
    'unauthorized_client',
    'invalid_scope',
]);

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

/** 暂时失败（网络 / 5xx / 坏响应）：凭证必须原样留在本地，只提示稍后重试 */
const refreshUnavailableError = (cause: unknown): CliError =>
    new CliError({
        code: 'NETWORK',
        message: '刷新访问令牌暂时失败（网络或服务端异常），本地凭证已保留',
        hint: '稍后重试；若持续失败再运行 msy-x auth login',
        cause,
    });

/**
 * 取 OAuth 错误码。SDK 的 `refreshAuthorization` 在 token 端点返回错误体时
 * 抛 `OAuthError` 子类（带 `errorCode` getter）；网络异常、超时、非 OAuth
 * 错误体（如网关 503 HTML）拿不到这个字段。
 */
const oauthErrorCodeOf = (error: unknown): string | null => {
    if (typeof error !== 'object' || error === null) return null;
    const candidate = error as { errorCode?: unknown };
    return typeof candidate.errorCode === 'string'
        ? candidate.errorCode
        : null;
};

/**
 * 是否「凭证真作废」：只有服务端明确拒绝 refresh_token 才算，
 * 其余（网络错误、502/503、坏 JSON、Zod 校验失败）都当暂时失败。
 */
const isPermanentRefreshFailure = (error: unknown): boolean => {
    const code = oauthErrorCodeOf(error);
    return code !== null && PERMANENT_REFRESH_ERROR_CODES.has(code);
};

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
): Promise<AuthCredentials> => {
    const deadline = now() + POLL_TOTAL_MS;
    for (;;) {
        await sleep(POLL_INTERVAL_MS);
        const config = await readConfig(env);
        const credentials = config.auth[site.name];
        if (credentials === undefined) {
            // 并发进程刷新失败清掉了凭证：这里也按失效处理
            throw new CliError({
                code: 'AUTH_REQUIRED',
                message: '凭证已失效（并发刷新未成功）',
                hint: '运行 msy-x auth login 重新登录',
            });
        }
        if (credentials.mode !== 'oauth') {
            // 期间用户改用了 PAT（或别的工具写入了 PAT）：直接用它，别当失效
            debugLog('并发进程写入了 PAT 凭证，直接复用');
            return credentials;
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

/** 是否是同一份凭证（用于判断磁盘内容是否已被并发进程/新登录替换） */
const isSameCredentials = (
    onDisk: AuthCredentials | undefined,
    snapshot: AuthCredentials,
): boolean => {
    if (onDisk === undefined || onDisk.mode !== snapshot.mode) return false;
    if (onDisk.mode === 'pat') {
        return snapshot.mode === 'pat' && onDisk.pat === snapshot.pat;
    }
    return (
        snapshot.mode === 'oauth' &&
        onDisk.accessToken === snapshot.accessToken &&
        onDisk.refreshToken === snapshot.refreshToken
    );
};

/** PAT 恒可用；OAuth 看是否还在有效期内 */
const isUsable = (credentials: AuthCredentials, now: () => number): boolean =>
    credentials.mode === 'pat' || !isExpired(credentials, now);

/**
 * 只在磁盘上仍是「我们开始刷新时那份凭证」时才清空。
 * 期间用户可能刚在另一个终端 `auth login`（或另一个进程刷好了），
 * 那是比我们更新的凭证，删掉等于把新登录踢下线。
 */
const clearSiteCredentialsIfUnchanged = async (
    siteName: string,
    snapshot: AuthCredentials,
    env: EnvVars,
): Promise<void> => {
    const config = await readConfig(env);
    const onDisk = config.auth[siteName];
    if (!isSameCredentials(onDisk, snapshot)) {
        if (onDisk !== undefined) {
            debugLog('磁盘凭证已被并发进程更新，跳过清空', siteName);
        }
        return;
    }
    delete config.auth[siteName];
    await writeConfig(config, env);
    debugLog(`已清空站点 ${siteName} 的凭证（refresh token 已失效）`);
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
        await clearSiteCredentialsIfUnchanged(site.name, credentials, env);
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
        const onDisk = latest.auth[site.name];
        if (
            onDisk !== undefined &&
            !isSameCredentials(onDisk, credentials) &&
            isUsable(onDisk, now)
        ) {
            // 刷新期间完成了一次新登录（或别的进程刷好了）：它是更新的，别覆盖
            debugLog('磁盘凭证已被并发进程更新，复用磁盘版本而不覆盖');
            return onDisk;
        }
        latest.auth[site.name] = next;
        await writeConfig(latest, env);
        return next;
    } catch (error) {
        // 只有服务端明确否掉 refresh_token 才清凭证；网络/5xx 保留凭证，
        // 否则一次 503 就会把用户踢回登录页（0.2.4 的实际缺陷）
        if (isPermanentRefreshFailure(error)) {
            await clearSiteCredentialsIfUnchanged(site.name, credentials, env);
            throw authRequiredAfterRefreshFailure(error);
        }
        throw refreshUnavailableError(error);
    } finally {
        await releaseLock(lockPath);
    }
};
