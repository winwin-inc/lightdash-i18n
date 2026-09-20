/**
 * MCP HTTP stderr line log with local timestamp.
 * LIGHTDASH_MCP_LOG_LEVEL = error|warn|info|debug (default info)
 * debug: auth cache hits + 2xx access logs; info: startup/tools/auth ok; warn: 4xx/auth fail; error: 5xx/fatal
 */

export type McpLogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<McpLogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

function parseLogLevel(raw: string | undefined): McpLogLevel {
    const v = (raw ?? 'info').trim().toLowerCase();
    if (v === 'error' || v === 'warn' || v === 'info' || v === 'debug') {
        return v;
    }
    return 'info';
}

let cachedLevel: McpLogLevel | undefined;

export function getMcpLogLevel(): McpLogLevel {
    if (cachedLevel === undefined) {
        cachedLevel = parseLogLevel(process.env.LIGHTDASH_MCP_LOG_LEVEL);
    }
    return cachedLevel;
}

export function resetMcpLogLevelCacheForTests(): void {
    cachedLevel = undefined;
}

export function shouldLog(level: McpLogLevel): boolean {
    return LEVEL_RANK[level] <= LEVEL_RANK[getMcpLogLevel()];
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
    if (n < 10) {
        return `00${n}`;
    }
    if (n < 100) {
        return `0${n}`;
    }
    return String(n);
}

export function formatLocalTimestamp(date: Date): string {
    const y = date.getFullYear();
    const mo = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const h = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const s = pad2(date.getSeconds());
    const ms = pad3(date.getMilliseconds());
    return `[${y}-${mo}-${d} ${h}:${mi}:${s}.${ms}]`;
}

export function writeStderrLog(
    line: string,
    level: McpLogLevel = 'info',
): void {
    if (!shouldLog(level)) {
        return;
    }
    const ts = formatLocalTimestamp(new Date());
    const body = line.endsWith('\n') ? line : `${line}\n`;
    process.stderr.write(`${ts} ${body}`);
}
