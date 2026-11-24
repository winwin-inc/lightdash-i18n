/* eslint-disable no-await-in-loop -- 顺序执行（设计稿 §6.3：数组逐条顺序 executeToolCall）与
   401 刷新重试的串行语义都是硬性要求 */
import { CliError } from './errors';
import { writeMultiResult, writeResult } from './output';
import { ensureFreshCredentials } from '../auth/refresh';
import { readConfig } from '../config/store';
import { setVerbose, verboseLog } from '../lib/logger';
import { executeToolCall, summarizeArgs } from '../mcp/callTool';
import { createMcpClient } from '../mcp/client';
import type { CommandContext, McpClient, ToolCall, ToolResult } from '../types';

/**
 * 工具命令执行管道（设计稿 §3.1 / §5.1 / §6.3）：
 *
 * - `--dry-run`：逐条打印将要发送的 `{tool,args}`（数组按顺序），不发任何请求；
 * - 否则 createMcpClient → 顺序 executeToolCall → cli/output.writeResult；
 * - `--verbose`（D10）：入口处 setVerbose，dry-run 分支之前即生效，
 *   便于确认将要发送的参数；实际请求/响应摘要由 executeToolCall 打印；
 * - 401（AUTH_REQUIRED）：先 ensureFreshCredentials 刷新凭证，再换新客户端重试一次；
 *   未登录（无凭证）不重试，直接抛给顶层；
 * - finally 关闭客户端；
 * - 多调用命令（>1 条 ToolCall，目前仅 `info`）：结果收集后由 writeMultiResult
 *   一次输出单个合并 JSON 对象（`--out` 一次写盘不覆盖，D14）；单条调用语义不变。
 */

export type RunToolCommandOptions = {
    /** 渲染前的本地结果变换（如 dashboards run --tile 的磁贴过滤） */
    transformResult?: (result: ToolResult) => ToolResult;
    /** 客户端工厂（默认 createMcpClient）；单测注入假 client 断言调用次数 */
    createClient?: typeof createMcpClient;
};

const closeQuietly = (client: McpClient): Promise<void> =>
    client.close().catch(() => undefined);

export const runToolCommand = async (
    calls: ToolCall | ToolCall[],
    ctx: CommandContext,
    runOptions?: RunToolCommandOptions,
): Promise<void> => {
    const list: ToolCall[] = Array.isArray(calls) ? calls : [calls];
    // 多调用（>1 条）：收集后一次输出单个合并 JSON 对象（D14）
    const multi = list.length > 1;
    const { site, options } = ctx;
    const { timeoutMs } = options;

    // D10：--verbose 在 dry-run 分支之前生效（dry-run 也能确认将要发送的参数）
    setVerbose(options.verbose);

    if (options.dryRun) {
        for (const call of list) {
            verboseLog(`→ ${call.tool} ${summarizeArgs(call.args)} (dry-run)`);
            process.stdout.write(
                `${JSON.stringify({ tool: call.tool, args: call.args })}\n`,
            );
        }
        return;
    }

    let { credentials } = ctx;

    /**
     * 401 时刷新一次凭证；返回 true 表示已刷新（调用方用新客户端重试一次），
     * false 表示不可刷新（非 AUTH_REQUIRED 或本来就没有凭证），原样上抛。
     */
    const refreshOnAuthError = async (error: unknown): Promise<boolean> => {
        if (
            !(error instanceof CliError) ||
            error.code !== 'AUTH_REQUIRED' ||
            credentials === null
        ) {
            return false;
        }
        const config = await readConfig();
        credentials = await ensureFreshCredentials({ site, credentials, config });
        return true;
    };

    const openClient = (): Promise<McpClient> =>
        (runOptions?.createClient ?? createMcpClient)({
            site,
            credentials,
            timeoutMs,
        });

    let client: McpClient;
    try {
        client = await openClient();
    } catch (error) {
        if (!(await refreshOnAuthError(error))) throw error;
        client = await openClient();
    }

    const collected: Array<{ tool: string; result: ToolResult }> = [];
    try {
        for (const call of list) {
            let result: ToolResult;
            try {
                result = await executeToolCall({ client, call, timeoutMs });
            } catch (error) {
                if (!(await refreshOnAuthError(error))) throw error;
                await closeQuietly(client);
                client = await openClient();
                result = await executeToolCall({ client, call, timeoutMs });
            }
            const finalResult =
                runOptions?.transformResult !== undefined
                    ? runOptions.transformResult(result)
                    : result;
            const renderCtx: CommandContext = { ...ctx, credentials };
            if (multi) {
                collected.push({ tool: call.tool, result: finalResult });
            } else {
                await writeResult({
                    tool: call.tool,
                    result: finalResult,
                    ctx: renderCtx,
                });
            }
        }
        if (multi && collected.length > 0) {
            await writeMultiResult({ calls: collected, ctx: { ...ctx, credentials } });
        }
    } finally {
        await closeQuietly(client);
    }
};
