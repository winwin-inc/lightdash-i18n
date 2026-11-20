import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    hasBrowserOpenerInPath,
    hasConfiguredBrowser,
    isWsl,
    wslNeedsQrFallback,
} from './browserEnv';

/**
 * 浏览器环境探测（扫码降级判定）的聚焦单测：PATH 探测全部用临时
 * 目录里的桩文件，不依赖也不污染真实环境。
 */

type StubFile = { name: string; executable: boolean };

/** 临时 PATH 目录：写入指定桩命令（可控制执行位），用完需 rmSync */
const makePathDir = (files: StubFile[]): string => {
    const dir = mkdtempSync(join(tmpdir(), 'msy-x-browserenv-'));
    files.forEach(({ name, executable }) => {
        writeFileSync(join(dir, name), '#!/bin/sh\nexit 0\n');
        chmodSync(join(dir, name), executable ? 0o755 : 0o644);
    });
    return dir;
};

const cleanupDirs = (dirs: string[]): void => {
    dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
};

/** PATH 探测仅 linux 语义（win/darwin 恒 true），非 linux 跳过 */
const linuxOnly = (name: string, body: () => void | Promise<void>): void =>
    test(name, { skip: process.platform !== 'linux' }, body);

test('isWsl：WSL_DISTRO_NAME 即判定；仅 WSL_INTEROP 不足以判定', () => {
    assert.equal(isWsl({ WSL_DISTRO_NAME: 'Ubuntu' }), true);
    assert.equal(isWsl({ WSL_INTEROP: '/run/WSL/1' }), false);
    assert.equal(isWsl({ WSL_INTEROP: '/run/WSL/1', WSLENV: 'X' }), true);
    assert.equal(isWsl({}), false);
});

test('hasConfiguredBrowser：$BROWSER 非空才算已配置', () => {
    assert.equal(hasConfiguredBrowser({ BROWSER: 'wslview' }), true);
    assert.equal(hasConfiguredBrowser({ BROWSER: '   ' }), false);
    assert.equal(hasConfiguredBrowser({}), false);
});

linuxOnly('hasBrowserOpenerInPath：PATH 里可执行的 xdg-open/wslview 才算可用', () => {
    const dirs = [
        makePathDir([]),
        makePathDir([{ name: 'xdg-open', executable: true }]),
        makePathDir([{ name: 'wslview', executable: true }]),
        makePathDir([{ name: 'xdg-open', executable: false }]),
    ];
    try {
        const [emptyDir, xdgDir, wslviewDir, notExecDir] = dirs;
        assert.equal(hasBrowserOpenerInPath({ PATH: emptyDir }), false);
        assert.equal(hasBrowserOpenerInPath({ PATH: xdgDir }), true);
        assert.equal(hasBrowserOpenerInPath({ PATH: wslviewDir }), true);
        // 同名文件但无执行位：不算可用（避免把普通文件当命令）
        assert.equal(hasBrowserOpenerInPath({ PATH: notExecDir }), false);
        // 无 PATH / 空 PATH：不可用
        assert.equal(hasBrowserOpenerInPath({}), false);
        assert.equal(hasBrowserOpenerInPath({ PATH: '' }), false);
    } finally {
        cleanupDirs(dirs);
    }
});

linuxOnly('wslNeedsQrFallback：WSL 仅在既无 $BROWSER 也无 PATH 拉起命令时降级', () => {
    const dirs = [
        makePathDir([]),
        makePathDir([{ name: 'xdg-open', executable: true }]),
    ];
    const wsl: Record<string, string | undefined> = {
        WSL_DISTRO_NAME: 'Ubuntu',
    };
    try {
        const [emptyDir, xdgDir] = dirs;
        // WSL + 什么都没有 → 自动降级扫码
        assert.equal(wslNeedsQrFallback({ ...wsl, PATH: emptyDir }), true);
        // WSL + $BROWSER 显式配置 → 不降级
        assert.equal(
            wslNeedsQrFallback({ ...wsl, PATH: emptyDir, BROWSER: 'wslview' }),
            false,
        );
        // WSL + PATH 里有可执行 xdg-open（如自制垫片转发 powershell）→ 不降级
        assert.equal(wslNeedsQrFallback({ ...wsl, PATH: xdgDir }), false);
        // 非 WSL → 永不自动降级
        assert.equal(wslNeedsQrFallback({ PATH: emptyDir }), false);
    } finally {
        cleanupDirs(dirs);
    }
});
