/**
 * 输出脱敏（设计稿 §10.3）：任何要打到 stderr / 日志的值先过 redact()。
 *
 * - 命中 `ldpat_[A-Za-z0-9]{38}` 的片段整体替换为 `***`；
 * - 键名含 token / secret / pat / authorization（不区分大小写）的值整体替换为 `***`
 *   （按子串匹配，`path` 等含 `pat` 的键也会被屏蔽，宁可多屏不可漏屏）；
 * - 纯函数：绝不修改入参，嵌套对象逐层重建（深拷贝语义）。
 */

export const REDACTED = '***';

const LD_PAT_PATTERN = /ldpat_[A-Za-z0-9]{38}/g;

const SENSITIVE_KEY_PATTERN = /(token|secret|pat|authorization)/i;

const redactString = (value: string): string =>
    value.replace(LD_PAT_PATTERN, REDACTED);

const isPlainObject = (
    value: object,
): value is Record<string, unknown> => {
    if (Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

export const redact = (value: unknown): unknown => {
    if (typeof value === 'string') return redactString(value);
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => redact(item));
    // Date / Map / Set 等非普通对象按原值返回（不修改、不展开）
    if (!isPlainObject(value)) return value;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        output[key] = SENSITIVE_KEY_PATTERN.test(key)
            ? REDACTED
            : redact(item);
    }
    return output;
};
