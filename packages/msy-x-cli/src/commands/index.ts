import type { Command } from 'commander';

/**
 * 命令注册入口。
 *
 * 约定：各 `src/commands/<group>.ts` 导出 `registerXxx(program, deps)`，
 * 由本文件按顺序挂载；命令文件内部只做 `(argv) => ToolCall[]` 的纯映射，
 * 真正发请求交给 `src/mcp/callTool.ts`，渲染交给 `src/render/*`。
 *
 * 子任务（commands 分组）完成后在此补注册，避免多 job 同时改本文件。
 */
export const registerCommands = (_program: Command): void => {
    // 命令分组尚在实现中（P1/P2）；挂载后此处仅保留 help/version。
};
