import { refreshAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CliError } from '../cli/errors';
import { ensureConfigDir, type EnvVars } from '../config/paths';
import { readConfig, writeConfig } from '../config/store';
import { debugLog } from '../lib/logger';
import type {
    AuthCredentials,
    CliConfig,
    OAuthCredentials,
    SiteProfile,
} from '../types';
import {
    DEFAULT_LOCK_STALE_MS,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_POLL_TOTAL_MS,
    breakStaleLock,
    lockPathOf,
    releaseLock,
    sleep,
    tryAcquireLock,
    withSiteLock,
} from './configLock';
import {
    conventionalAuthorizationServerMetadata,
    discoverAuthorizationServer,
} from './oauth';
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
 *   保证并发命令只刷一次（避免 refresh token 被重复消费失效）；
 * - token 端点按 RFC9728/8414 发现，发现不到时按 Lightdash 约定回落到
 *   `{site}/api/v1/oauth/token`（0.2.5 的缺陷：SDK 在没有 metadata 时会拼
 *   `new URL('/token', 授权服务器 URL)`，把路径整段丢掉，实际打到 `{site}/token`）。
 */

/** 刷新请求上界：必须明显小于 lock stale，否则慢请求会被判成「持锁进程崩溃」 */
const DEFAULT_REFRESH_TIMEOUT_MS = 20_000;
/**
 * 元数据发现的**总**时长上界（不是单次请求）。
 * 持锁期间的硬上界 = 发现 4s + 刷新 20s = 24s < lock stale 30s，
 * 所以并发进程不会把还在干活的锁判成残留而重刷（refresh token 会双花）。
 */
const DEFAULT_DISCOVERY_TIMEOUT_MS = 4_000;

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
    /** 锁文件判残留的阀值（测试注入），默认 30s */
    lockStaleMs?: number;
    /** 并发等待总时长（测试注入），默认 5s */
    pollTotalMs?: number;
    pollIntervalMs?: number;
    /** 单个 token 请求的上界（测试注入），默认 20s */
    refreshTimeoutMs?: number;
};

const isExpired = (credentials: OAuthCredentials, now: () => number): boolean =>
    Date.parse(credentials.accessExpiresAt) <= now();

const authRequiredAfterRefreshFailure = (
    cause: unknown,
    cleared: boolean,
): CliError =>
    new CliError({
        code: 'AUTH_REQUIRED',
        // 只有真的删掉了才能说「已清空」（并发新登录被保留时不能说）
        message: cleared
            ? '刷新访问令牌失败，已清空该站点凭证'
            : '刷新访问令牌失败，该站点凭证已失效',
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
    return typeof candidate.errorCode === 'string' ? candidate.errorCode : null;
};

/**
 * 是否「凭证真作废」：只有服务端明确拒绝 refresh_token 才算，
 * 其余（网络错误、502/503、坏 JSON、Zod 校验失败）都当暂时失败。
 */
const isPermanentRefreshFailure = (error: unknown): boolean => {
    const code = oauthErrorCodeOf(error);
    return code !== null && PERMANENT_REFRESH_ERROR_CODES.has(code);
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
    if (snapshot.mode !== 'oauth') return false;
    // 同代凭证这几个字段必然完全相同；多比几个是为了「宁可漏清」
    return (
        onDisk.accessToken === snapshot.accessToken &&
        onDisk.refreshToken === snapshot.refreshToken &&
        onDisk.accessExpiresAt === snapshot.accessExpiresAt &&
        onDisk.clientId === snapshot.clientId
    );
};

/** PAT 恒可用；OAuth 看是否还在有效期内 */
const isUsable = (credentials: AuthCredentials, now: () => number): boolean =>
    credentials.mode === 'pat' || !isExpired(credentials, now);

type ClearOutcome = {
    cleared: boolean;
    /** 清空后（或跳过清空时）磁盘上剩下的凭证 */
    onDisk: AuthCredentials | undefined;
};

/**
 * 只在磁盘上仍是「我们开始刷新时那份凭证」时才清空。
 * 期间用户可能刚在另一个终端 `auth login`（或另一个进程刷好了），
 * 那是比我们更新的凭证，删掉等于把新登录踢下线。
 */
const clearSiteCredentialsIfUnchanged = async (
    siteName: string,
    snapshot: AuthCredentials,
    env: EnvVars,
): Promise<ClearOutcome> => {
    // 尽力而为：清理失败不能把「需要重新登录」这个真正的结论掩盖成读写错误
    try {
        const config = await readConfig(env);
        const onDisk = config.auth[siteName];
        if (!isSameCredentials(onDisk, snapshot)) {
            if (onDisk !== undefined) {
                debugLog('磁盘凭证已被并发进程更新，跳过清空', siteName);
            }
            return { cleared: false, onDisk };
        }
        delete config.auth[siteName];
        await writeConfig(config, env);
        debugLog(`已清空站点 ${siteName} 的凭证（refresh token 已失效）`);
        return { cleared: true, onDisk: undefined };
    } catch (error) {
        debugLog('清空站点凭证失败（忽略，凭证可能仍在文件中）', error);
        return { cleared: false, onDisk: snapshot };
    }
};

/** 给 token 请求套上超时上界（SDK 的 refreshAuthorization 不收 signal） */
const withTimeout = (
    fetchImpl: FetchLike | undefined,
    timeoutMs: number,
): FetchLike => {
    const base: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
    return async (input, init) =>
        base(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
};

/**
 * 给一组连续请求套**总**超时预算：发现会试多个候选 URL，单请求超时约束不了
 * 总耗时（最坏 6 次 × 单次超时，足以超过 lock stale）。
 */
const withTotalBudget = (
    fetchImpl: FetchLike | undefined,
    totalMs: number,
): FetchLike => {
    const base: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
    const deadline = Date.now() + totalMs;
    return async (input, init) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error(`元数据发现超出总预算（${totalMs}ms）`);
        }
        return base(input, { ...init, signal: AbortSignal.timeout(remaining) });
    };
};

/**
 * 刷新用的授权服务器元数据。
 *
 * SDK 的 `refreshAuthorization` **只在有 metadata 时**才用 `token_endpoint`，
 * 否则拼 `new URL('/token', 授权服务器 URL)`——路径整段被丢掉，实际打到
 * `{site}/token`（404）。这正是 0.2.5「登录能用、自动刷新必失败」的根因。
 *
 * 所以刷新前先按 RFC9728/8414 发现一次（带短超时，挂住也不拖死刷新），
 * 发现不到再用 Lightdash 约定兜底 `{site}/api/v1/oauth/token`。
 */
const resolveAuthorizationServerForRefresh = async (
    site: SiteProfile,
    fetchFn: FetchLike | undefined,
): Promise<{
    authorizationServerUrl: string;
    metadata: AuthorizationServerMetadata;
}> => {
    const discoveryFetch = withTotalBudget(
        fetchFn,
        DEFAULT_DISCOVERY_TIMEOUT_MS,
    );
    const { authorizationServerUrl, metadata } =
        await discoverAuthorizationServer({
            mcpUrl: site.mcpUrl,
            fetchFn: discoveryFetch,
        });
    if (metadata !== undefined) {
        debugLog('刷新前拿到授权服务器元数据', {
            tokenEndpoint: metadata.token_endpoint,
        });
        return { authorizationServerUrl, metadata };
    }
    debugLog('授权服务器元数据发现失败，按约定兜底 token 端点', {
        authorizationServerUrl,
    });
    return {
        authorizationServerUrl,
        metadata: conventionalAuthorizationServerMetadata(
            authorizationServerUrl,
        ),
    };
};

export const ensureFreshCredentials = async ({
    site,
    credentials,
    config,
    env = process.env,
    fetchFn,
    now = Date.now,
    lockStaleMs = DEFAULT_LOCK_STALE_MS,
    pollTotalMs = DEFAULT_POLL_TOTAL_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    refreshTimeoutMs = DEFAULT_REFRESH_TIMEOUT_MS,
}: EnsureFreshCredentialsInput): Promise<AuthCredentials> => {
    // PAT 无过期概念，原样返回
    if (credentials.mode === 'pat') return credentials;
    if (!isExpired(credentials, now)) return credentials;

    if (credentials.refreshToken === null) {
        // 清空也要在站点锁内「重读 → 比对 → 删」：否则会把并发完成的新登录删掉。
        // 拿不到锁只跳过清理（清理是副作用），结论仍是「需要重新登录」，退出码不变。
        try {
            await withSiteLock(
                {
                    siteName: site.name,
                    env,
                    now,
                    lockStaleMs,
                    pollTotalMs,
                    pollIntervalMs,
                },
                () =>
                    clearSiteCredentialsIfUnchanged(
                        site.name,
                        credentials,
                        env,
                    ),
            );
        } catch (error) {
            debugLog('清空凭证时未拿到站点锁，跳过清空', error);
        }
        throw new CliError({
            code: 'AUTH_REQUIRED',
            message: '访问令牌已过期且没有 refresh token',
            hint: '运行 msy-x auth login 重新登录',
        });
    }

    // 配置目录可能还没建（首次登录前）：不建目录拿锁会报裸 ENOENT
    await ensureConfigDir(env);
    const lockPath = lockPathOf(env, site.name);
    const acquire = async (): Promise<boolean> => {
        if (await tryAcquireLock(lockPath)) return true;
        await breakStaleLock(lockPath, now, lockStaleMs);
        return tryAcquireLock(lockPath);
    };

    /**
     * 拿不到锁时的语义：等一会儿 → 看并发方是否已经写好（或用户重新登录/改用
     * PAT）→ 再抢一次锁（抢到就自己刷）。**超时也退 NETWORK/6 而不是 3**：
     * 凭证还在本地，只是这次没刷成，让用户「稍后重试」才是真话。
     */
    const deadline = now() + pollTotalMs;
    let acquired = await acquire();
    while (!acquired) {
        await sleep(pollIntervalMs);
        const reading = async (): Promise<AuthCredentials | null> => {
            const current = (await readConfig(env)).auth[site.name];
            if (current === undefined) return null;
            if (current.mode !== 'oauth') return current;
            if (
                !isSameCredentials(current, credentials) &&
                !isExpired(current, now)
            ) {
                return current;
            }
            return null;
        };
        const current = await reading();
        if (current !== null) {
            debugLog('并发进程已完成刷新/重新登录，直接复用新凭证');
            return current;
        }
        acquired = await acquire();
        if (acquired) break;
        if (now() >= deadline) {
            const finalCredentials = await reading();
            if (finalCredentials !== null) return finalCredentials;
            const onDisk = (await readConfig(env)).auth[site.name];
            if (onDisk === undefined) {
                throw new CliError({
                    code: 'AUTH_REQUIRED',
                    message: '凭证已失效（并发刷新未成功）',
                    hint: '运行 msy-x auth login 重新登录',
                });
            }
            throw refreshUnavailableError(
                new Error(`等待并发刷新超时（${pollTotalMs}ms）`),
            );
        }
    }

    try {
        const { authorizationServerUrl, metadata } =
            await resolveAuthorizationServerForRefresh(site, fetchFn);
        const tokens = await refreshAuthorization(authorizationServerUrl, {
            metadata,
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
            fetchFn: withTimeout(fetchFn, refreshTimeoutMs),
        });
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
        if (onDisk === undefined) {
            // 刷新期间被登出：不能把凭证写回去（否则等于撤销登出）
            debugLog('刷新期间凭证被删除（并发 logout），跳过写回');
            return next;
        }
        if (!isSameCredentials(onDisk, credentials) && isUsable(onDisk, now)) {
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
        if (!isPermanentRefreshFailure(error)) {
            throw refreshUnavailableError(error);
        }
        const outcome = await clearSiteCredentialsIfUnchanged(
            site.name,
            credentials,
            env,
        );
        if (
            !outcome.cleared &&
            outcome.onDisk !== undefined &&
            isUsable(outcome.onDisk, now)
        ) {
            // 刷新被拒，但磁盘上是期间完成的新登录：直接用，不要报「需要重新登录」
            debugLog('刷新被拒绝，但磁盘上是并发完成的新登录，直接复用');
            return outcome.onDisk;
        }
        throw authRequiredAfterRefreshFailure(error, outcome.cleared);
    } finally {
        await releaseLock(lockPath);
    }
};
