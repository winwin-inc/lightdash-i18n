import { createServer, type IncomingMessage, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { CliError } from '../cli/errors';

/**
 * 本机回环回调监听（设计稿 §5.1）：
 *
 * - 只绑 `127.0.0.1` + 随机端口（`listen(0)`），`redirectUri` 即监听地址；
 * - 单次回调：收到 code / error / state 不一致的第一个请求后立即关闭；
 * - `state` 不一致立即失败（CliError AUTH_REQUIRED，绝不拿 code 去换 token）；
 * - 回调带 `error` / `error_description`（用户拒绝等）同样按失败处理；
 * - 超时（默认 300000ms）失败并关闭监听；
 * - 回调页返回中文极简 HTML，只有提示语义，不含任何凭证。
 */

export const DEFAULT_CALLBACK_TIMEOUT_MS = 300_000;

export type StartCallbackServerOptions = {
    /** 登录事务生成的 state（32B hex）；回传不一致立即失败 */
    expectedState: string;
    /** 等待回调的总超时；默认 300000ms */
    timeoutMs?: number;
};

export type CallbackServerHandle = {
    /** 注册到 DCR / authorize 的回环地址：`http://127.0.0.1:<随机端口>/callback` */
    redirectUri: string;
    /** 等待授权码；state 不一致 / error 参数 / 超时 / 手动 close 都会 reject */
    waitForCode: () => Promise<string>;
    /** 幂等关闭：清定时器、停监听、释放端口；未决的 waitForCode 会被 reject */
    close: () => void;
};

const HTML_PAGE = (title: string, detail: string): string =>
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">` +
    `<title>${title}</title></head><body style="font-family:system-ui;text-align:center;padding-top:3rem">` +
    `<h1>${title}</h1><p>${detail}</p></body></html>`;

const authRequired = (message: string, hint?: string): CliError =>
    new CliError({
        code: 'AUTH_REQUIRED',
        message,
        hint: hint ?? '重新运行 msy-x auth login',
    });

export const startCallbackServer = ({
    expectedState,
    timeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS,
}: StartCallbackServerOptions): Promise<CallbackServerHandle> =>
    new Promise<CallbackServerHandle>((resolve, reject) => {
        let settled = false;
        let closeRequested = false;
        let timer: NodeJS.Timeout | null = null;
        let codePromise: Promise<string> | null = null;

        let resolveCode: ((code: string) => void) | null = null;
        let rejectCode: ((error: CliError) => void) | null = null;

        const settle = (outcome: { code: string } | { error: CliError }): void => {
            if (settled) return;
            settled = true;
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            if ('code' in outcome) resolveCode?.(outcome.code);
            else rejectCode?.(outcome.error);
        };

        // 先声明后赋值：reallyClose / 回调里都要引用 server，而 createServer
        // 的入参回调又依赖 reallyClose，拆并两全
        let server: Server;

        const reallyClose = (): void => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            server.close();
            // 闲置的 keep-alive 连接直接释放，保证端口尽快可复用（Node 18.2+）；
            // 不用 closeAllConnections：那会掐断还在传输中的回调响应
            server.closeIdleConnections?.();
        };

        server = createServer(
            (req: IncomingMessage, res) => {
                const finishHtml = (status: number, body: string): void => {
                    res.writeHead(status, {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-store',
                    });
                    res.end(body);
                    res.on('finish', () => server.closeIdleConnections?.());
                };

                const url = new URL(req.url ?? '/', 'http://127.0.0.1');
                const code = url.searchParams.get('code');
                const state = url.searchParams.get('state');
                const error = url.searchParams.get('error');
                const errorDescription = url.searchParams.get('error_description');

                if (code === null && error === null) {
                    // 浏览器预取（favicon 等）：不打断等待
                    finishHtml(
                        200,
                        HTML_PAGE('msy-x 等待授权中', '请在页面上完成授权后返回终端。'),
                    );
                    return;
                }

                if (error !== null) {
                    finishHtml(
                        200,
                        HTML_PAGE(
                            '授权失败',
                            `站点返回了错误：${error}${
                                errorDescription === null ? '' : `（${errorDescription}）`
                            }。请返回终端查看原因。`,
                        ),
                    );
                    settle({
                        error: authRequired(
                            `站点拒绝了授权：${error}${
                                errorDescription === null ? '' : `（${errorDescription}）`
                            }`,
                        ),
                    });
                    reallyClose();
                    return;
                }

                if (state !== expectedState) {
                    finishHtml(
                        200,
                        HTML_PAGE('授权校验失败', 'state 与本次登录不一致，已放弃该次授权。'),
                    );
                    settle({
                        error: authRequired(
                            '回调 state 与本次登录不一致，已中止（可能是过期或伪造的回调）',
                        ),
                    });
                    reallyClose();
                    return;
                }

                finishHtml(
                    200,
                    HTML_PAGE('授权成功', '已收到授权码，请返回终端，本页可以关闭。'),
                );
                settle({ code: code as string });
                reallyClose();
            },
        );

        server.on('clientError', (_err, socket) => {
            socket.destroy();
        });

        const close = (): void => {
            if (closeRequested) return;
            closeRequested = true;
            settle({
                error: authRequired('本机回调监听已关闭，等待授权码中断'),
            });
            reallyClose();
        };

        server.once('error', (error: Error) => {
            reject(
                new CliError({
                    code: 'CONFIG',
                    message: `无法启动本机回调监听：${error.message}`,
                    hint: '检查本机 127.0.0.1 端口占用情况后重试',
                    cause: error,
                }),
            );
        });

        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as AddressInfo;
            const redirectUri = `http://127.0.0.1:${address.port}/callback`;

            codePromise = new Promise<string>((res, rej) => {
                resolveCode = res;
                rejectCode = rej;
            });
            // close() 在 promise 建立前被调用的极端情形：补发终态
            if (closeRequested) {
                settle({ error: authRequired('本机回调监听已关闭') });
            }

            timer = setTimeout(() => {
                settle({
                    error: authRequired(
                        `等待浏览器授权超时（${timeoutMs}ms）`,
                        '可加 --timeout <ms> 延长等待，或用 --no-browser 把授权 URL 复制到可用的浏览器',
                    ),
                });
                reallyClose();
            }, timeoutMs);

            resolve({
                redirectUri,
                waitForCode: (): Promise<string> => codePromise as Promise<string>,
                close,
            });
        });
    });
