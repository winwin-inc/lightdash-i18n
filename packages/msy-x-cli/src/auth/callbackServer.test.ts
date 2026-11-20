import assert from 'node:assert/strict';
import test from 'node:test';
import { CliError } from '../cli/errors';
import { startCallbackServer } from './callbackServer';

/**
 * 本机回环回调监听（设计稿 §5.1）：
 * 只绑 127.0.0.1 + 随机端口、单次回调、state 校验、error 参数、超时清理。
 * 全部用本地 http 回环，不碰任何外部网络。
 */

const waitFor = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const isAuthRequired = (error: unknown): boolean =>
    error instanceof CliError && error.code === 'AUTH_REQUIRED';

test('redirectUri 是 127.0.0.1 随机端口；合法 code+state 解析授权码', async () => {
    const server = await startCallbackServer({ expectedState: 'st-good' });
    assert.match(server.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const res = await fetch(`${server.redirectUri}?code=ABC123&state=st-good`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('授权成功'), `回调页应为中文提示，实际：${html}`);

    assert.equal(await server.waitForCode(), 'ABC123');
    server.close();
});

test('state 不一致立即失败（AUTH_REQUIRED），绝不用该 code 换 token', async () => {
    const server = await startCallbackServer({ expectedState: 'expected' });

    // 先挂好断言（waitForCode 是单例 promise），再触发回调
    const rejection = assert.rejects(
        () => server.waitForCode(),
        (error: unknown) => isAuthRequired(error),
    );
    const res = await fetch(`${server.redirectUri}?code=EVIL&state=wrong`);
    await rejection;

    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes('不一致'));
    server.close();
});

test('回调带 error 参数按失败处理（用户拒绝等）', async () => {
    const server = await startCallbackServer({ expectedState: 's' });

    const rejection = assert.rejects(
        () => server.waitForCode(),
        (error: unknown) =>
            isAuthRequired(error) &&
            /access_denied/.test((error as CliError).message),
    );
    const res = await fetch(
        `${server.redirectUri}?error=access_denied&error_description=user+denied`,
    );
    await rejection;

    assert.equal(res.status, 200);
    server.close();
});

test('单次回调：处理完第一个带 code 的请求后端口立即释放', async () => {
    const server = await startCallbackServer({ expectedState: 's1' });
    await fetch(`${server.redirectUri}?code=FIRST&state=s1`);
    assert.equal(await server.waitForCode(), 'FIRST');

    await waitFor(50);
    await assert.rejects(() => fetch(`${server.redirectUri}?code=SECOND&state=s1`));
    server.close();
});

test('timeoutMs=50 超时：失败（AUTH_REQUIRED）并清理监听', async () => {
    const server = await startCallbackServer({ expectedState: 's', timeoutMs: 50 });

    await assert.rejects(
        () => server.waitForCode(),
        (error: unknown) => isAuthRequired(error) && /超时/.test((error as CliError).message),
    );

    await waitFor(50);
    // 端口已释放：连接被拒
    await assert.rejects(() => fetch(server.redirectUri));
    server.close(); // 幂等
});

test('close() 幂等且让未决的 waitForCode 失败收场', async () => {
    const server = await startCallbackServer({ expectedState: 's', timeoutMs: 60_000 });
    server.close();
    server.close();
    await assert.rejects(
        () => server.waitForCode(),
        (error: unknown) => isAuthRequired(error),
    );
    // 监听确实已停：连接被拒
    await assert.rejects(() => fetch(server.redirectUri));
});

test('无 code/error 的预取请求（favicon）不打断等待', async () => {
    const server = await startCallbackServer({ expectedState: 's9' });
    const pre = await fetch(server.redirectUri);
    assert.equal(pre.status, 200);

    // 之后正常回调仍然成功
    await fetch(`${server.redirectUri}?code=LATE&state=s9`);
    assert.equal(await server.waitForCode(), 'LATE');
    server.close();
});
