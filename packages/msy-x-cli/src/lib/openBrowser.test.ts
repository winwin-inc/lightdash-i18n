import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openBrowser, win32BrowserInvocation } from './openBrowser';

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

/* ---------- win32 命令构造：授权 URL 的 `&` 不能被 cmd 拆分 ---------- */

/** 与 MCP SDK startAuthorization 一致的授权 URL（response_type 是第一个参数） */
const AUTHORIZE_URL =
    'https://x.brandct.com/api/v1/oauth/authorize?response_type=code' +
    '&client_id=abc123' +
    '&code_challenge=xyz' +
    '&code_challenge_method=S256' +
    '&redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback' +
    '&state=st1';

const decodePowerShell = (args: string[]): string =>
    Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString(
        'utf16le',
    );

test('win32：走 PowerShell -EncodedCommand，不经 cmd start', () => {
    const { command, args } = win32BrowserInvocation(AUTHORIZE_URL);
    assert.equal(command, 'powershell');
    assert.ok(args.includes('-EncodedCommand'));
    // 不能再把 URL 作为裸参数交给 cmd（那会按 & 截断成 ?response_type=code）
    assert.ok(!args.includes('start'));
    assert.ok(!args.includes('/c'));
    assert.ok(args.every((arg) => !arg.includes('&')));
});

test('win32：解码后的脚本包含完整授权 URL（& 与后续参数都在）', () => {
    const { args } = win32BrowserInvocation(AUTHORIZE_URL);
    const script = decodePowerShell(args);
    assert.equal(script, `Start-Process '${AUTHORIZE_URL}'`);
    for (const fragment of [
        'response_type=code',
        'client_id=abc123',
        'redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback',
        'state=st1',
    ]) {
        assert.ok(script.includes(fragment), `脚本应包含 ${fragment}`);
    }
});

test('win32：URL 里的单引号按 PowerShell 规则转义', () => {
    const { args } = win32BrowserInvocation("https://example.com/a?b='c'");
    assert.equal(
        decodePowerShell(args),
        "Start-Process 'https://example.com/a?b=''c'''",
    );
});

linuxOnly('openBrowser：命令不存在（spawn error）→ false', async () => {
    assert.equal(
        await openBrowser('https://example.com/auth', {
            BROWSER: '/nonexistent/msy-x-no-such-cmd',
        }),
        false,
    );
});
