const WRITE_KEYWORDS = [
    'insert',
    'update',
    'delete',
    'merge',
    'drop',
    'alter',
    'create',
    'truncate',
    'grant',
    'revoke',
    'comment',
    'call',
    'execute',
    'exec',
];

export function assertReadonlySql(sql: string): void {
    const trimmed = sql.trim();
    if (!trimmed) {
        throw new Error('sql 不能为空');
    }
    const lower = trimmed.toLowerCase();
    if (!(lower.startsWith('select') || lower.startsWith('with'))) {
        throw new Error(
            'run_sql 仅支持 SELECT/CTE 查询（必须以 SELECT 或 WITH 开头）',
        );
    }

    const compact = lower.replace(/\s+/g, ' ');
    const foundWrite = WRITE_KEYWORDS.find((kw) =>
        new RegExp(`(^|\\W)${kw}(\\W|$)`, 'i').test(compact),
    );
    if (foundWrite && !compact.startsWith(foundWrite)) {
        throw new Error(
            `run_sql 检测到可能的写操作关键字 "${foundWrite}"，仅允许只读查询`,
        );
    }
}
