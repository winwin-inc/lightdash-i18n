import { open, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../cli/errors';
import { ensureConfigDir, getConfigDir, type EnvVars } from '../config/paths';
import { debugLog } from '../lib/logger';

/**
 * 站点级配置互斥（设计稿 §4.4 并发约定）。
 *
 * `ensureFreshCredentials` 与「写凭证」的命令（auth login/logout）共用同一把
 * `refresh.<site>.lock`，让「读配置 → 改凭证 → 写回」成为临界区：
 *
 * - 刷新结果不会覆盖刚刚完成的新登录（新登录的 refresh token 可能已让旧的
 *   失效，覆盖回去等于把用户踢下线）；
 * - 刷新失败后的清空动作也不会删掉新登录的凭证；
 * - 并发命令只刷一次（refresh token 单次消费，重复刷新会互相打死）。
 *
 * 锁按站点分开：A 站刷新把 B 站命令卡住是没道理的。
 */

export const LOCK_FILE_NAME_PREFIX = 'refresh';
/** 超过这个时长没动静视为持锁进程崩溃，可清理重抢 */
export const DEFAULT_LOCK_STALE_MS = 30_000;
/** refresh 等锁总时长（要小于 stale，否则会去抢活着的锁） */
export const DEFAULT_POLL_TOTAL_MS = 5_000;
export const DEFAULT_POLL_INTERVAL_MS = 100;
/** 写凭证方等锁总时长：必须盖住一次刷新的上界（20s），才不会误报冲突 */
export const DEFAULT_WRITE_LOCK_TOTAL_MS = 30_000;

export const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

export const lockPathOf = (env: EnvVars, siteName: string): string =>
    path.join(getConfigDir(env), `${LOCK_FILE_NAME_PREFIX}.${siteName}.lock`);

/** 尝试 O_EXCL 创建锁文件；返回 true=拿到锁，false=被别的进程持有 */
export const tryAcquireLock = async (lockPath: string): Promise<boolean> => {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
        handle = await open(lockPath, 'wx');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
        throw error;
    }
    // handle 必须在异常路径关掉：write 失败不能泄漏 fd，也不能留下空锁
    try {
        await handle.write(`${process.pid} ${new Date().toISOString()}`);
    } catch (error) {
        await handle.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
        throw error;
    }
    await handle.close();
    return true;
};

/** 锁文件超过阀值视为残留（持锁进程崩溃），清掉后可重试 */
export const breakStaleLock = async (
    lockPath: string,
    now: () => number,
    lockStaleMs: number,
): Promise<void> => {
    try {
        const info = await stat(lockPath);
        if (now() - info.mtimeMs >= lockStaleMs) {
            debugLog('发现过期站点锁，清除后重试', lockPath);
            await unlink(lockPath).catch(() => undefined);
        }
    } catch {
        // stat 失败（正好被释放等）交给上层重试
    }
};

export const releaseLock = async (lockPath: string): Promise<void> => {
    await unlink(lockPath).catch((error: unknown) => {
        debugLog('释放站点锁失败（忽略）', error);
    });
};

export type SiteLockOptions = {
    siteName: string;
    env?: EnvVars;
    now?: () => number;
    /** 锁文件判残留的阀值（测试注入），默认 30s */
    lockStaleMs?: number;
    /** 等锁总时长（测试注入） */
    pollTotalMs?: number;
    pollIntervalMs?: number;
};

/** 试一次（含清理残留锁）；拿不到返回 false，语义留给调用方（refresh 有自己的降级路径） */
export const tryAcquireSiteLock = async ({
    siteName,
    env = process.env,
    now = Date.now,
    lockStaleMs = DEFAULT_LOCK_STALE_MS,
}: SiteLockOptions): Promise<string | null> => {
    const lockPath = lockPathOf(env, siteName);
    // 配置目录可能还没建（首次登录前）：不建目录拿锁会报裸 ENOENT
    await ensureConfigDir(env);
    if (await tryAcquireLock(lockPath)) return lockPath;
    await breakStaleLock(lockPath, now, lockStaleMs);
    return (await tryAcquireLock(lockPath)) ? lockPath : null;
};

/**
 * 阻塞式临界区（login / logout 写凭证前用）。
 *
 * 等锁期间持续清理残留锁；超过 pollTotalMs 仍拿不到 → CliError('NETWORK')：
 * 这不是「凭证失效」，让用户稍后重试才是真话，绝不能在没拿锁的情况下写凭证
 * （那正是「新登录被刷新覆盖」的来源）。
 */
export const withSiteLock = async <T>(
    {
        siteName,
        env = process.env,
        now = Date.now,
        lockStaleMs = DEFAULT_LOCK_STALE_MS,
        pollTotalMs = DEFAULT_WRITE_LOCK_TOTAL_MS,
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    }: SiteLockOptions,
    fn: () => Promise<T>,
): Promise<T> => {
    const deadline = now() + pollTotalMs;
    let lockPath = await tryAcquireSiteLock({
        siteName,
        env,
        now,
        lockStaleMs,
    });
    while (lockPath === null) {
        if (now() >= deadline) {
            throw new CliError({
                code: 'NETWORK',
                message: `等待站点 ${siteName} 的配置锁超时（${pollTotalMs}ms）`,
                hint: '另一个 msy-x 进程正在改动凭证；稍后重试',
            });
        }
        await sleep(pollIntervalMs);
        lockPath = await tryAcquireSiteLock({
            siteName,
            env,
            now,
            lockStaleMs,
        });
    }
    try {
        return await fn();
    } finally {
        await releaseLock(lockPath);
    }
};
