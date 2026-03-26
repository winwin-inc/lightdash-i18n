/**
 * 饼图标签占位符格式化与模板替换
 * 占位符：{name}、{value}、{rawValue}、{percent}
 * 可选小数位：{percent:0}、{percent:2}、{value:2}、{rawValue:0}，冒号后为小数位数，默认 2
 */

const DEFAULT_DECIMALS = 2;

/** 格式化为固定小数位 */
export function formatPercentForLabel(
    percent: number,
    decimals: number = DEFAULT_DECIMALS,
): string {
    if (!Number.isFinite(percent)) return '0';
    const d = Math.max(0, Math.min(20, Math.floor(decimals)));
    return Number(percent).toFixed(d);
}

/** 原始数值格式化为固定小数位（用于 {rawValue}） */
export function formatRawValueForLabel(
    raw: unknown,
    decimals: number = DEFAULT_DECIMALS,
): string {
    const n = typeof raw === 'number' && !Number.isNaN(raw) ? raw : Number(raw);
    if (!Number.isFinite(n)) return String(raw ?? '');
    const d = Math.max(0, Math.min(20, Math.floor(decimals)));
    return Number(n).toFixed(d);
}

/**
 * 用于 {value}：优先用指标已格式化的字符串；若为纯数字且易丢尾零则用 raw 按小数位格式化
 */
export function formatValueForLabel(
    formatted: string,
    raw: unknown,
    decimals: number = DEFAULT_DECIMALS,
): string {
    const rawNum =
        typeof raw === 'number' && !Number.isNaN(raw)
            ? raw
            : Number(raw);
    const hasValidRaw = Number.isFinite(rawNum);

    if (
        hasValidRaw &&
        (formatted === '' ||
            formatted === '0' ||
            String(Number(formatted)) === formatted)
    ) {
        const d = Math.max(0, Math.min(20, Math.floor(decimals)));
        return Number(rawNum).toFixed(d);
    }
    return formatted || (hasValidRaw ? Number(rawNum).toFixed(decimals) : '');
}

/** 匹配 {name}、{percent:2}、{value:0} 等，捕获 key 与可选的 decimals */
const PLACEHOLDER_REGEX = /\{(\w+)(?::(\d+))?\}/g;

export type PieLabelReplacementContext = {
    name: string;
    percentValue: number;
    formattedValue: string;
    rawValue: unknown;
};

/**
 * 将模板中的占位符替换为实际值
 * 支持 {name}、{value}、{rawValue}、{percent}；不写 :N 时用 defaultDecimals（默认 2 位）
 * 可选小数位：{percent:0}、{value:2}、{rawValue:0} 等
 */
export function applyPieLabelTemplate(
    template: string,
    ctx: PieLabelReplacementContext,
    defaultDecimals: number = DEFAULT_DECIMALS,
): string {
    return template.replace(PLACEHOLDER_REGEX, (_, key: string, decimalsStr: string | undefined) => {
        const decimals =
            decimalsStr !== undefined
                ? Math.max(0, Math.min(20, Math.floor(Number(decimalsStr) || 0)))
                : defaultDecimals;

        switch (key) {
            case 'name':
                return ctx.name ?? '';
            case 'percent':
                return formatPercentForLabel(ctx.percentValue, decimals);
            case 'value':
                return formatValueForLabel(
                    ctx.formattedValue,
                    ctx.rawValue,
                    decimals,
                );
            case 'rawValue':
                return formatRawValueForLabel(ctx.rawValue, decimals);
            default:
                return `{${key}${decimalsStr !== undefined ? `:${decimalsStr}` : ''}}`;
        }
    });
}
