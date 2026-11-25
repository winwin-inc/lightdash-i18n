import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * 入口契约（设计稿 §8）：跑**构建后的 dist**，验证真实进程的 stdout/stderr/退出码。
 * 未构建时跳过（`pnpm -F msy-x-cli build` 后自动生效），避免 node:test 与进程内
 * stdout 捕获冲突（捕获会打断 reporter）。
 */
const DIST = path.join(__dirname, '..', 'dist', 'index.js');

const run = (args: string[]) => {
    const result = spawnSync(process.execPath, [DIST, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        code: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
    };
};

const skipIfNotBuilt = (t: { skip: (msg?: string) => void }): boolean => {
    if (!existsSync(DIST)) {
        t.skip('dist/index.js 不存在：先执行 pnpm -F msy-x-cli build');
        return true;
    }
    return false;
};

test('裸执行打印帮助并退 0', (t) => {
    if (skipIfNotBuilt(t)) return;
    const { code, stdout } = run([]);

    assert.equal(code, 0);
    assert.match(stdout, /Usage: msy-x/);
});

test('未知子命令退 2，stderr 只有单行 JSON（无 commander 文案）', (t) => {
    if (skipIfNotBuilt(t)) return;
    const { code, stderr } = run(['bogus']);

    assert.equal(code, 2);
    const lines = stderr.trim().split('\n');
    assert.equal(lines.length, 1, `stderr 应为单行：${stderr}`);
    const parsed = JSON.parse(lines[0]) as {
        error: { code: string; message: string };
    };
    assert.equal(parsed.error.code, 'USAGE');
    assert.match(parsed.error.message, /unknown command/);
    assert.doesNotMatch(stderr, /^error:/m);
});

test('--version 单行输出 msy-x <semver>（连接器版本检查依赖）', (t) => {
    if (skipIfNotBuilt(t)) return;
    const { code, stdout } = run(['--version']);

    assert.equal(code, 0);
    assert.match(stdout.trim(), /^msy-x \d+\.\d+\.\d+/);
});

test('缺少必填选项退 2 且 stderr 为 JSON（带可执行 hint）', (t) => {
    if (skipIfNotBuilt(t)) return;
    const { code, stderr } = run(['dashboards', 'list']);

    assert.equal(code, 2);
    const lines = stderr.trim().split('\n');
    assert.equal(lines.length, 1, `stderr 应为单行：${stderr}`);
    const parsed = JSON.parse(lines[0]) as {
        error: { code: string; hint: string | null };
    };
    assert.equal(parsed.error.code, 'USAGE');
    assert.match(parsed.error.hint ?? '', /--type dashboard/);
});

test('auth status 未登录也退 0 且首键是 logged_in（连接器正则依赖）', (t) => {
    if (skipIfNotBuilt(t)) return;
    const result = spawnSync(
        process.execPath,
        [DIST, 'auth', 'status'],
        {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                MSY_X_CONFIG: path.join(__dirname, '..', '.tmp-none.yaml'),
            },
        },
    );

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    assert.equal(Object.keys(parsed)[0], 'logged_in');
    assert.equal(parsed.logged_in, false);
    assert.match(result.stdout, /"logged_in"\s*:\s*false/);
});
