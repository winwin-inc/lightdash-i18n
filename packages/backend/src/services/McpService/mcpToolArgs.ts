import type { McpToolName } from './McpToolName';

/**
 * AI tool 的 schema 带一个 `type` 判别字面量（`createToolSchema({ type })`），
 * 但 MCP 客户端不应该发它——`McpService.getMcpCompatibleSchema()` 把它从
 * 下发给客户端的 inputSchema 里剥掉了。
 *
 * 少数工具（`run_metric_query` / `search_field_values`）的 MCP handler 直接
 * 复用了 AI 侧的共享实现，而那份实现会用**含 `type` 的原始 schema** 再 parse
 * 一次入参。缺了 `type` 会得到 `invalid_literal: expected "run_metric_query"`。
 *
 * 所以：凡是把 MCP 入参透传给 `packages/backend/src/services/ai/tools/**` 的
 * `runXxx` 共享实现的调用点，都必须先用本函数把判别键补回去。
 *
 * 回归测试见 `mcpToolDiscriminator.test.ts`。
 */
export const withToolDiscriminator = <T extends Record<string, unknown>>(
    args: T,
    toolName: McpToolName,
): T & { type: McpToolName } => ({ ...args, type: toolName });
