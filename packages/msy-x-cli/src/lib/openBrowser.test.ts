import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openBrowser } from './openBrowser';

/**
 * openBrowser 拉起结果判定（退出码语义）的聚焦单测：用临时目录里的
 * 桩脚本模拟「打开成功 / 打不开 / 命令不存在」，不碰真实浏览器。
 */

const makeStub = (dir: string, name: string, script: string): string => {
    const file = join(dir, name);
    writeFileSync(file, script);
    chmodSync(file, 0o755);
    return file;
};

/** 退出码判定仅 linux 分支（经 $BROWSER 注入桩命令），非 linux 跳过 */
const linuxOnly = (name: string, body: () => void | Promise<void>): void =>
    test(name, { skip: process.platform !== 'linux' }, body);

linuxOnly('openBrowser：命令退出码 0 → true（垫片类脚本立即成功）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'msy-x-openbrowser-'));
    try {
        const stub = makeStub(dir, 'stub-ok', '#!/bin/sh\nexit 0\n');
        assert.equal(
            await openBrowser('https://example.com/auth', { BROWSER: stub }),
            true,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

linuxOnly('openBrowser：命令非 0 退出 → false（无桌面 stock xdg-open 场景）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'msy-x-openbrowser-'));
    try {
        // xdg-open 找不到可用 handler 时以 3 退出（no method available）
        const stub = makeStub(dir, 'stub-broken', '#!/bin/sh\nexit 3\n');
        assert.equal(
            await openBrowser('https://example.com/auth', { BROWSER: stub }),
            false,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

linuxOnly('openBrowser：命令不存在（spawn error）→ false', async () => {
    assert.equal(
        await openBrowser('https://example.com/auth', {
            BROWSER: '/nonexistent/msy-x-no-such-cmd',
        }),
        false,
    );
});
