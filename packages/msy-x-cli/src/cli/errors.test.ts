import assert from 'node:assert/strict';
import test from 'node:test';
import { CliError, exitCodeOf, getDashboardStrictStatuses, toCliError } from './errors';
import { ExitCode } from './exitCodes';

test('每个错误码都有默认退出码', () => {
    const codes = [
        'USAGE',
        'CONFIG',
        'AUTH_REQUIRED',
        'FORBIDDEN',
        'DASHBOARD_STRICT',
        'SERVER_ERROR',
        'NETWORK',
        'PARSE_ERROR',
        'NOT_IMPLEMENTED',
    ] as const;
    codes.forEach((code) => {
        const error = new CliError({ code, message: 'x' });
        assert.notEqual(error.exitCode, undefined, code);
    });
});

test('退出码与设计稿 §8.2 一致', () => {
    assert.equal(new CliError({ code: 'USAGE', message: 'x' }).exitCode, 2);
    assert.equal(
        new CliError({ code: 'AUTH_REQUIRED', message: 'x' }).exitCode,
        3,
    );
    assert.equal(new CliError({ code: 'FORBIDDEN', message: 'x' }).exitCode, 4);
    assert.equal(
        new CliError({ code: 'DASHBOARD_STRICT', message: 'x' }).exitCode,
        4,
    );
    assert.equal(
        new CliError({ code: 'SERVER_ERROR', message: 'x' }).exitCode,
        5,
    );
    assert.equal(new CliError({ code: 'NETWORK', message: 'x' }).exitCode, 6);
    assert.equal(
        new CliError({ code: 'PARSE_ERROR', message: 'x' }).exitCode,
        7,
    );
    assert.equal(ExitCode.OK, 0);
});

test('toJSON 是 stderr 单行契约', () => {
    const error = new CliError({
        code: 'AUTH_REQUIRED',
        message: '未登录或凭证已失效',
        hint: '运行 msy-x auth login 重新登录',
    });
    assert.deepEqual(error.toJSON(), {
        error: {
            code: 'AUTH_REQUIRED',
            message: '未登录或凭证已失效',
            hint: '运行 msy-x auth login 重新登录',
        },
    });
});

test('未知异常归一为 SERVER_ERROR，原始信息不丢', () => {
    const error = toCliError(new Error('boom'));
    assert.equal(error.code, 'SERVER_ERROR');
    assert.match(error.message, /boom/);
    assert.equal(exitCodeOf(new Error('boom')), ExitCode.SERVER_ERROR);
    assert.equal(exitCodeOf('raw string'), ExitCode.SERVER_ERROR);
});

test('查看板门控 status 列表覆盖五类', () => {
    assert.equal(getDashboardStrictStatuses().length, 5);
});
