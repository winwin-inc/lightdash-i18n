import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';

export type ColorPaletteKind =
    /** 自研拟类色板：必须两两可区分（≥ MIN_COLOR_DIFF），不允许近重复 */
    | 'categorical'
    /** 单色系深浅过渡（同色相）：只要求无完全重复色 */
    | 'sequential'
    /** 沿用外部/上游色板：按原样保留，只要求无完全重复色 */
    | 'upstream';

export type ColorPalettePreset = {
    name: string;
    /**
     * categorical：拟类色板，要求两两可区分（≥ MIN_COLOR_DIFF），不允许重复
     * sequential：单色系深浅过渡，天然近邻；只要求无完全重复色
     * upstream：外部调色板（ECharts 默认、历史 neon 集）原样保留
     */
    kind: ColorPaletteKind;
    colors: string[];
    /**
     * 历史版本的色值列表（仅用于「当前选中」识别，不参与取色）。
     *
     * 预设色值被清洗后（如 afcb553e9 对 dataMatrix 换掉 5 个近重复色），
     * 用旧色值保存过的看板 config.colorPalette 与新 colors 不再全等，
     * 弹层里所有预设都会失去选中态；选中态判断需要同时认得这些旧色串。
     */
    legacyColors?: string[][];
};

/**
 * 看板「同步图表颜色」的可选调色板预设。
 *
 * 约束（palettePresets.test.ts 会校验）：
 * - 每个预设内不允许出现**完全相同**的颜色（曾经 dataMatrix 里 `#0088FF` 重复两次）
 * - 同色相但几乎一样的颜色（RGB 距离 < 45）同样不允许：分配时这些色会被
 *   避让逻辑跳过，用户会看到"选了色板但线条不是色板里的色"
 */
const COLOR_PALETTE_PRESETS: ColorPalettePreset[] = [
    {
        name: 'echarts',
        kind: 'upstream',
        colors: ECHARTS_DEFAULT_COLORS,
    },
    {
        name: 'default',
        kind: 'upstream',
        colors: [
            '#5470c6',
            '#91cc75',
            '#fac858',
            '#ee6666',
            '#73c0de',
            '#3ba272',
            '#fc8452',
            '#9a60b4',
            '#ea7ccc',
            '#33ff7d',
            '#33ffb1',
            '#33ffe6',
            '#33e6ff',
            '#33b1ff',
            '#337dff',
            '#3349ff',
            '#5e33ff',
            '#9233ff',
            '#c633ff',
            '#ff33e1',
        ],
    },
    {
        name: 'modern',
        kind: 'sequential',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#2D2E30',
            '#4A4B4D',
            '#6B6C6E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FFAA00',
        ],
    },
    {
        name: 'retro',
        kind: 'sequential',
        colors: [
            '#FF6B35',
            '#ECB88A',
            '#D4A373',
            '#BC8A5F',
            '#A47148',
            '#8A5A39',
            '#6F4E37',
            '#544334',
            '#393731',
            '#2E2E2E',
            '#F4D06F',
            '#FFD700',
            '#C0BABC',
            '#A9A9A9',
            '#808080',
            '#696969',
            '#556B2F',
            '#6B8E23',
            '#8FBC8B',
            '#BDB76B',
        ],
    },
    {
        name: 'business',
        kind: 'sequential',
        colors: [
            '#1A237E',
            '#283593',
            '#303F9F',
            '#3949AB',
            '#3F51B5',
            '#5C6BC0',
            '#7986CB',
            '#9FA8DA',
            '#C5CAE9',
            '#E8EAF6',
            '#4CAF50',
            '#66BB6A',
            '#81C784',
            '#A5D6A7',
            '#C8E6C9',
            '#FFA726',
            '#FFB74D',
            '#FFCC80',
            '#FFE0B2',
            '#FFF3E0',
        ],
    },
    {
        name: 'lightdash',
        kind: 'upstream',
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FF7A00',
            '#00FFAA',
            '#FF00AA',
            '#FFAA00',
        ],
    },
    {
        name: 'dataMatrix',
        kind: 'categorical',
        legacyColors: [
            // afcb553e9 清洗前的旧 20 色（含重复的 #0088FF）：
            // 用这套色保存过的看板选中态仍应命中本预设
            [
                '#FF00FF',
                '#00FFFF',
                '#FFFF00',
                '#FF0080',
                '#00FF00',
                '#00FF80',
                '#8000FF',
                '#FF8000',
                '#FF0088',
                '#00FF88',
                '#0088FF',
                '#88FF00',
                '#FF8800',
                '#8800FF',
                '#0088FF',
                '#FF00CC',
                '#CCFF00',
                '#00CCFF',
                '#CC00FF',
                '#FFCC00',
            ],
        ],
        colors: [
            '#FF00FF',
            '#00FFFF',
            '#FFFF00',
            '#FF0080',
            '#00FF00',
            '#00FF80',
            '#8000FF',
            '#FF8000',
            '#FF0040',
            '#00FFC0',
            '#0088FF',
            '#88FF00',
            '#FF4000',
            '#4000FF',
            '#00FF40',
            '#FF00CC',
            '#CCFF00',
            '#00CCFF',
            '#CC00FF',
            '#FFCC00',
        ],
    },
];

/** 归一化单个调色板：去空白、小写十六进制、去重（保留首次出现顺序） */
const normalizePalette = (palette: string[]): string[] => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    palette.forEach((color) => {
        const key = color.trim().toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        normalized.push(key);
    });
    return normalized;
};

/** 归一化后的比较键（有序唯一色串） */
const paletteKey = (palette: string[]): string =>
    normalizePalette(palette).join(',');

/**
 * 判断看板当前的调色板是否命中某个预设（用于弹层的「当前选中」态）。
 *
 * 预设色值清洗后，用旧色值保存过的看板与预设 `colors` 不再全等，
 * 因此除 `colors` 外还要逐个尝试 `legacyColors`。比较前双方都做归一化
 * （去空白、小写、去重），空或 undefined 的当前调色板一律不命中。
 */
export const matchesColorPalette = (
    preset: ColorPalettePreset,
    currentPalette: string[] | null | undefined,
): boolean => {
    if (!currentPalette || currentPalette.length === 0) {
        return false;
    }
    const currentKey = paletteKey(currentPalette);
    return [preset.colors, ...(preset.legacyColors ?? [])].some(
        (candidate) => paletteKey(candidate) === currentKey,
    );
};

export default COLOR_PALETTE_PRESETS;
