import assert from 'node:assert/strict';
import { mkdtemp, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import type { EnvVars } from '../config/paths';
import { lockPathOf, withSiteLock } from './configLock';

const makeTempEnv = async (): Promise<{ env: EnvVars; dir: string }> => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'msy-x-lock-'));
    return { env: { MSY_X_CONFIG: path.join(dir, 'config.yaml') }, dir };
};

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

test('withSiteLock：临界区串行，不会有两个临界区重叠', async () => {
    const { env } = await makeTempEnv();
    let running = 0;
    let maxRunning = 0;
    let done = 0;
    const work = async (): Promise<void> => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await sleep(30);
        running -= 1;
        done += 1;
    };

    // 谁先拿到锁不确定（都先 await 建目录），只断言不重叠
    await Promise.all([
        withSiteLock({ siteName: 'x', env }, work),
        withSiteLock({ siteName: 'x', env }, work),
    ]);

    assert.equal(maxRunning, 1, '临界区不能重叠');
    assert.equal(done, 2);
});

test('withSiteLock：临界区结束后锁文件被释放', async () => {
    const { env } = await makeTempEnv();
    await withSiteLock({ siteName: 'x', env }, async () => undefined);
    await assert.rejects(() => stat(lockPathOf(env, 'x')));
});

test('withSiteLock：锁被活着的进程持有时超时报 NETWORK（不硬写）', async () => {
    const { env } = await makeTempEnv();
    // 模拟另一个进程持锁：临时目录已存在，直接落锁文件（mtime 新鲜）
    await writeFile(lockPathOf(env, 'x'), 'other-pid');

    await assert.rejects(
        () =>
            withSiteLock(
                {
                    siteName: 'x',
                    env,
                    pollTotalMs: 150,
                    pollIntervalMs: 20,
                    lockStaleMs: 60_000,
                },
                async () => {
                    throw new Error('不该进临界区');
                },
            ),
        (error: unknown) =>
            error instanceof CliError && error.exitCode === ExitCode.NETWORK,
    );
});

test('withSiteLock：残留锁（超过阀值）会被清掉并接管', async () => {
    const { env } = await makeTempEnv();
    const lockPath = lockPathOf(env, 'x');
    const stale = new Date(Date.now() - 31_000);
    await writeFile(lockPath, 'stale');
    await utimes(lockPath, stale, stale);

    let entered = false;
    await withSiteLock({ siteName: 'x', env }, async () => {
        entered = true;
    });
    assert.equal(entered, true);
});

test('withSiteLock：不同站点互不阻塞', async () => {
    const { env } = await makeTempEnv();
    let bEntered = false;
    await withSiteLock({ siteName: 'x', env }, async () => {
        await withSiteLock({ siteName: 'inner', env }, async () => {
            bEntered = true;
        });
    });
    assert.equal(bEntered, true);
});
