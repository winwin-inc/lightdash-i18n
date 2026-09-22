/**
 * MCP HTTP stderr line log.
 * Timestamp is always Asia/Shanghai (UTC+8), not the container TZ (K8s 默认 UTC).
 * LIGHTDASH_MCP_LOG_LEVEL = error|warn|info|debug (default info)
 * debug: auth cache hits + 2xx access logs; info: startup/tools/auth ok; warn: 4xx/auth fail; error: 5xx/fatal
 */

const LOG_TIME_ZONE = 'Asia/Shanghai';
const LOG_OFFSET = '+08:00';

const shanghaiDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: LOG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

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

function pad3(n: number): string {
    if (n < 10) {
        return `00${n}`;
    }
    if (n < 100) {
        return `0${n}`;
    }
    return String(n);
}

/** `[YYYY-MM-DD HH:mm:ss.SSS+08:00]`，固定东八区，与进程 TZ 无关。 */
export function formatLocalTimestamp(date: Date): string {
    const parts = Object.fromEntries(
        shanghaiDateTimeFormatter.formatToParts(date).map((part) => [
            part.type,
            part.value,
        ]),
    );
    const ms = pad3(date.getUTCMilliseconds());
    return `[${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${ms}${LOG_OFFSET}]`;
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
