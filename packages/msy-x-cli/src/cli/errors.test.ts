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

test('D3：detail 携带附加载荷，toJSON 以 error.detail 输出；null 时省略', () => {
    const detail = {
        action: 'select_dashboard',
        candidates: [{ dashboardUuid: 'u1', dashboardName: '看板一' }],
    };
    const withDetail = new CliError({
        code: 'dashboard_selection_required',
        message: '请选择看板',
        hint: '用 --dashboard 指定',
        exitCode: ExitCode.FORBIDDEN,
        detail,
    });
    assert.equal(withDetail.detail, detail);
    assert.deepEqual(withDetail.toJSON().error.detail, detail);
    assert.equal(withDetail.exitCode, ExitCode.FORBIDDEN);

    const nullDetail = new CliError({ code: 'USAGE', message: 'x' });
    assert.equal(nullDetail.detail, null);
    assert.ok(!('detail' in nullDetail.toJSON().error));
});

test('D3：code 放宽为 string，非内置 code 未显式传 exitCode 时运行时兜底 5', () => {
    // 类型层已强制非内置 code 必须显式传 exitCode（见 CliErrorArgs 联合类型）；
    // 运行时对绕过类型检查的调用兜底 SERVER_ERROR，不让构造函数抛异常
    const arbitrary = new CliError({
        code: 'dashboard_not_found',
        message: '没有找到这个看板',
        exitCode: ExitCode.FORBIDDEN,
    });
    assert.equal(arbitrary.code, 'dashboard_not_found');
    assert.equal(arbitrary.exitCode, ExitCode.FORBIDDEN);

    const unchecked = new (CliError as unknown as new (args: {
        code: string;
        message: string;
    }) => CliError)({ code: 'something_new', message: 'x' });
    assert.equal(unchecked.exitCode, ExitCode.SERVER_ERROR);
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
