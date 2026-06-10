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
        typeof raw === 'number' && !Number.isNaN(raw) ? raw : Number(raw);
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
    return template.replace(
        PLACEHOLDER_REGEX,
        (_, key: string, decimalsStr: string | undefined) => {
            const decimals =
                decimalsStr !== undefined
                    ? Math.max(
                          0,
                          Math.min(20, Math.floor(Number(decimalsStr) || 0)),
                      )
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
        },
    );
}

export type PieChartValueLabelMode = 'hidden' | 'inside' | 'outside';

export type FormatPieSliceLabelOptions = {
    name: string;
    percentValue: number;
    formattedValue: string;
    rawValue: unknown;
    valueLabel: PieChartValueLabelMode;
    showValue: boolean;
    showPercentage: boolean;
    useCustomFormat: boolean;
    labelTemplate?: string;
    /** 移动端外侧标签：长文本插入换行 */
    wrapLongLines?: boolean;
};

const PIE_LABEL_WRAP_SEPARATORS = [
    { separator: ', ', replacement: ',\n' },
    { separator: '，', replacement: '，\n' },
    { separator: ': ', replacement: ':\n' },
    { separator: '：', replacement: '：\n' },
    { separator: ' - ', replacement: '\n- ' },
    { separator: ' – ', replacement: '\n– ' },
    { separator: ' — ', replacement: '\n— ' },
    { separator: ' / ', replacement: ' /\n' },
    { separator: ' | ', replacement: ' |\n' },
    { separator: '、', replacement: '、\n' },
] as const;

const PIE_LABEL_NAME_WRAP_THRESHOLD = 9;
const PIE_LABEL_ONE_LINE_DISPLAY_WIDTH = 14;

const PIE_LABEL_NAME_VALUE_SEPARATORS = [', ', '，', ': ', '：'] as const;

function getLabelDisplayWidth(label: string): number {
    return Array.from(label).reduce((width, char) => {
        // CJK and full-width punctuation take roughly twice the visual width.
        return width + (/[\u3400-\u9fff\uff00-\uffef]/.test(char) ? 2 : 1);
    }, 0);
}

function splitLongPieLabelName(name: string): string[] {
    if (name.length <= PIE_LABEL_NAME_WRAP_THRESHOLD) {
        return [name];
    }

    const midPoint = Math.ceil(name.length / 2);
    const preferredBreakpoints = ['—', '-', ' ', '、'];
    const breakpoint = preferredBreakpoints
        .map((separator) => {
            const before = name.lastIndexOf(separator, midPoint);
            const after = name.indexOf(separator, midPoint);

            return [before, after].filter((index) => index > 0);
        })
        .flat()
        .sort(
            (left, right) =>
                Math.abs(left - midPoint) - Math.abs(right - midPoint),
        )[0];

    const splitIndex = breakpoint ?? midPoint;
    return [
        name.slice(0, splitIndex).trim(),
        name.slice(splitIndex).trim(),
    ].filter(Boolean);
}

function wrapLongNameValueLabel(label: string): string | undefined {
    const separator = PIE_LABEL_NAME_VALUE_SEPARATORS.find((candidate) =>
        label.includes(candidate),
    );
    if (!separator) {
        return undefined;
    }

    const [name, ...rest] = label.split(separator);
    const valueText = rest.join(separator).trim();
    if (!name || !valueText) {
        return undefined;
    }

    if (
        name.length <= PIE_LABEL_NAME_WRAP_THRESHOLD &&
        getLabelDisplayWidth(label) <= PIE_LABEL_ONE_LINE_DISPLAY_WIDTH
    ) {
        return undefined;
    }

    return [...splitLongPieLabelName(name), valueText].join('\n');
}

/** 移动端外侧标签：长文本换行（在分隔符或中间位置插入 \\n） */
export function wrapLongPieLabel(label: string): string {
    const nameValueLabel = wrapLongNameValueLabel(label);
    if (nameValueLabel) {
        return nameValueLabel;
    }

    if (label.length <= 15) {
        return label;
    }

    const wrapSeparator = PIE_LABEL_WRAP_SEPARATORS.find(({ separator }) =>
        label.includes(separator),
    );
    if (wrapSeparator) {
        return label.replace(
            wrapSeparator.separator,
            wrapSeparator.replacement,
        );
    }

    if (label.length > 20) {
        const midPoint = Math.floor(label.length / 2);
        const spaceIndex = label.lastIndexOf(' ', midPoint);
        if (spaceIndex > 0) {
            return (
                label.slice(0, spaceIndex) + '\n' + label.slice(spaceIndex + 1)
            );
        }
        return label.slice(0, midPoint) + '\n' + label.slice(midPoint);
    }

    return label;
}

/** 饼图扇区标签文案（ECharts formatter 与移动端侧栏共用） */
export function formatPieSliceLabel(
    options: FormatPieSliceLabelOptions,
): string {
    const {
        name,
        percentValue,
        formattedValue,
        rawValue,
        valueLabel,
        showValue,
        showPercentage,
        useCustomFormat,
        labelTemplate,
        wrapLongLines = false,
    } = options;

    if (valueLabel === 'hidden') {
        return '';
    }

    if (useCustomFormat && labelTemplate && labelTemplate.trim() !== '') {
        let formattedLabel = applyPieLabelTemplate(
            labelTemplate,
            {
                name,
                percentValue,
                formattedValue,
                rawValue,
            },
            2,
        ).trim();

        if (formattedLabel.length > 0) {
            return wrapLongLines
                ? wrapLongPieLabel(formattedLabel)
                : formattedLabel;
        }
    }

    const percentFormatted = formatPercentForLabel(percentValue, 2);
    let labelText =
        showValue && showPercentage
            ? `${percentFormatted}% - ${formattedValue}`
            : showValue
              ? `${formattedValue}`
              : showPercentage
                ? `${percentFormatted}%`
                : name;

    return wrapLongLines ? wrapLongPieLabel(labelText) : labelText;
}
