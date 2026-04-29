import { createHash } from 'node:crypto';

/**
 * 在无服务端 mcp_context 表时，按 PAT 在内存中保存 set_project / set_agent 状态，
 * 提供「当前项目 / 当前 Agent」会话语义（与常见 MCP 客户端习惯一致）。
 */
export type McpSessionState = {
    projectUuid: string | null;
    projectName: string | null;
    tags: string[] | null;
    agentUuid: string | null;
    agentName: string | null;
    /** GET agent 完整 JSON，供 get_current_agent 快速返回 */
    agentSnapshot: unknown | null;
    updatedAtMs: number;
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, McpSessionState>();

function storageKey(apiKey: string): string {
    return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

function pruneExpired(): void {
    const now = Date.now();
    for (const [k, v] of sessions) {
        if (now - v.updatedAtMs > SESSION_TTL_MS) {
            sessions.delete(k);
        }
    }
}

export function getMcpSession(apiKey: string): McpSessionState {
    pruneExpired();
    const k = storageKey(apiKey);
    const existing = sessions.get(k);
    if (existing) return existing;
    const initial: McpSessionState = {
        projectUuid: null,
        projectName: null,
        tags: null,
        agentUuid: null,
        agentName: null,
        agentSnapshot: null,
        updatedAtMs: Date.now(),
    };
    sessions.set(k, initial);
    return initial;
}

export function patchMcpSession(
    apiKey: string,
    patch: Partial<McpSessionState>,
): McpSessionState {
    const cur = { ...getMcpSession(apiKey), ...patch, updatedAtMs: Date.now() };
    sessions.set(storageKey(apiKey), cur);
    return cur;
}
