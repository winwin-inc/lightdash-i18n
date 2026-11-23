import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from 'commander';
import { readNoBrowser } from './flags';

/**
 * `--no-browser` 的解析回归：commander 把否定选项记成 `browser: false`，
 * 早期实现读的是 `opts.noBrowser`，导致该 flag 静默失效（URL 不打印、
 * 照样去拉浏览器，用户只看到“等待浏览器授权超时”）。
 */

const parseNoBrowser = (argv: string[]): boolean => {
    const cmd = new Command();
    cmd.exitOverride();
    cmd.option('--no-browser', '不拉起浏览器，只打印授权 URL');
    cmd.option('--timeout <ms>', '等待超时');
    cmd.parse(argv, { from: 'user' });

    return readNoBrowser(cmd.opts() as Record<string, unknown>);
};

test('readNoBrowser：commander 传入 --no-browser 后记成 browser=false，必须识别为 true', () => {
    assert.equal(parseNoBrowser(['node', 'msy-x', 'login', '--no-browser']), true);
});

test('readNoBrowser：没传 --no-browser 时为 false（commander 缺省 browser=true）', () => {
    assert.equal(parseNoBrowser(['node', 'msy-x', 'login', '--timeout', '5000']), false);
});

test('readNoBrowser：兼容非否定写法 noBrowser=true', () => {
    assert.equal(readNoBrowser({ noBrowser: true }), true);
    assert.equal(readNoBrowser({ noBrowser: false, browser: true }), false);
    assert.equal(readNoBrowser({}), false);
});
