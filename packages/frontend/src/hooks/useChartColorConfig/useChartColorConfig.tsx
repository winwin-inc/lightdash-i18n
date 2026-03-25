/* eslint-disable @typescript-eslint/no-loop-func */
import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
import { ASSIGNMENT_IDX_KEY } from './constants';
import { ChartColorMappingContext } from './context';
import { type ChartColorMappingContextProps, type SeriesLike } from './types';
import { calculateSeriesLikeIdentifier } from './utils';

/**
 * 提取维度值的类别部分
 * 例如: "其他品牌：包含494个" -> "其他品牌", "其他集团-包含368个" -> "其他集团", "QQ星, 4.44%" -> "QQ星", "品牌A_已选择" -> "品牌A"
 */
const extractCategory = (str: string): string => {
    // 常见分隔符：下划线、竖线、斜杠、连字符、中文冒号、逗号、括号等
    const separators = ['-', '_', '|', '/', '\\', '：', ',', '，', '(', '（'];
    for (const sep of separators) {
        const parts = str.split(sep);
        if (parts.length > 1) {
            return parts[0].trim();
        }
    }
    return str;
};

const hashString = (str: string): number => {
    const category = extractCategory(str);
    // FNV-1a 哈希算法，分布更均匀
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < category.length; i++) {
        hash ^= category.charCodeAt(i);
        hash *= 16777619; // FNV prime
    }
    return Math.abs(hash);
};

const hexToHSL = (hex: string): { h: number; s: number; l: number } => {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
    const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
    const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return { h: h * 360, s, l };
};

const hslToHex = (h: number, s: number, l: number): string => {
    // 安全检查：确保值在有效范围内
    const safeH = ((h % 360) + 360) % 360; // 确保色相在 0-359 之间
    const safeS = Math.max(0, Math.min(1, s)); // 确保饱和度 0-1
    const safeL = Math.max(0, Math.min(1, l)); // 确保亮度 0-1

    const hueToRgb = (p: number, q: number, t: number) => {
        let tNorm = t;
        if (tNorm < 0) tNorm += 1;
        if (tNorm > 1) tNorm -= 1;
        if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
        if (tNorm < 1 / 2) return q;
        if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
        return p;
    };

    const hNorm = safeH / 360;
    const q = safeL < 0.5 ? safeL * (1 + safeS) : safeL + safeS - safeL * safeS;
    const p = 2 * safeL - q;

    const r = Math.round(
        Math.max(0, Math.min(255, hueToRgb(p, q, hNorm + 1 / 3) * 255)),
    );
    const g = Math.round(
        Math.max(0, Math.min(255, hueToRgb(p, q, hNorm) * 255)),
    );
    const b = Math.round(
        Math.max(0, Math.min(255, hueToRgb(p, q, hNorm - 1 / 3) * 255)),
    );

    return `#${r.toString(16).padStart(2, '0')}${g
        .toString(16)
        .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * 计算两个颜色的差异度（欧氏距离）
 * 返回 0-255 之间的值，值越大差异越大
 * 阈值 30 可以区分明显的颜色差异
 */
const colorDifference = (color1: string, color2: string): number => {
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');

    const r1 = parseInt(hex1.slice(0, 2), 16);
    const g1 = parseInt(hex1.slice(2, 4), 16);
    const b1 = parseInt(hex1.slice(4, 6), 16);

    const r2 = parseInt(hex2.slice(0, 2), 16);
    const g2 = parseInt(hex2.slice(2, 4), 16);
    const b2 = parseInt(hex2.slice(4, 6), 16);

    return Math.sqrt(
        Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2),
    );
};

// 色差最小阈值（低于此值认为颜色太相似）
const MIN_COLOR_DIFF = 45;

// 扩展调色板缓存
const expandedPaletteCache = new Map<string, string[]>();

/**
 * 扩展调色板：为每个基色生成 20 个变体
 * 9 色 → 189 色
 */
const expandPalette = (colorPalette: string[]): string[] => {
    const cacheKey = colorPalette.join(',');
    const cached = expandedPaletteCache.get(cacheKey);
    if (cached) return cached;

    const expanded: string[] = [...colorPalette];
    for (const color of colorPalette) {
        const { h, s, l } = hexToHSL(color);
        // 确保饱和度和亮度在合理范围
        const safeS = Math.max(0.4, Math.min(1.0, s));
        const safeL = Math.max(0.35, Math.min(0.75, l));

        // 变体1-4：亮度/饱和度微调
        expanded.push(
            hslToHex(
                h,
                Math.max(0.4, safeS - 0.08),
                Math.min(0.75, safeL + 0.1),
            ),
        );
        expanded.push(
            hslToHex(
                h,
                Math.max(0.4, safeS + 0.06),
                Math.max(0.35, safeL - 0.1),
            ),
        );
        expanded.push(
            hslToHex(
                h,
                Math.max(0.4, safeS - 0.12),
                Math.min(0.8, safeL + 0.18),
            ),
        );
        expanded.push(
            hslToHex(
                h,
                Math.max(0.4, safeS + 0.1),
                Math.max(0.35, safeL - 0.15),
            ),
        );
        // 变体5-8：色相偏移，确保亮度足够
        expanded.push(
            hslToHex((h + 60) % 360, Math.max(0.5, safeS + 0.15), safeL),
        );
        expanded.push(
            hslToHex((h + 120) % 360, Math.max(0.4, safeS - 0.1), safeL),
        );
        expanded.push(
            hslToHex((h + 180) % 360, safeS, Math.min(0.7, safeL + 0.15)),
        );
        expanded.push(
            hslToHex((h + 240) % 360, safeS, Math.max(0.4, safeL - 0.1)),
        );
        // 变体9-12：色相偏移
        expanded.push(
            hslToHex(
                (h + 30) % 360,
                Math.max(0.5, safeS),
                Math.max(0.4, safeL),
            ),
        );
        expanded.push(
            hslToHex(
                (h + 90) % 360,
                Math.max(0.5, safeS),
                Math.max(0.4, safeL),
            ),
        );
        expanded.push(
            hslToHex(
                (h + 150) % 360,
                Math.max(0.5, safeS),
                Math.max(0.4, safeL),
            ),
        );
        expanded.push(
            hslToHex(
                (h + 210) % 360,
                Math.max(0.5, safeS),
                Math.max(0.4, safeL),
            ),
        );
        // 变体13-16：高饱和度，确保亮度足够
        expanded.push(hslToHex(h, 0.9, Math.max(0.4, safeL)));
        expanded.push(hslToHex((h + 60) % 360, 0.9, Math.max(0.4, safeL)));
        expanded.push(hslToHex((h + 120) % 360, 0.9, Math.max(0.4, safeL)));
        expanded.push(hslToHex((h + 180) % 360, 0.9, Math.max(0.4, safeL)));
        // 变体17-20：低饱和度高亮度，确保不产生暗色
        expanded.push(hslToHex(h, 0.4, 0.65));
        expanded.push(hslToHex((h + 90) % 360, 0.4, 0.65));
        expanded.push(hslToHex((h + 180) % 360, 0.4, 0.65));
        expanded.push(hslToHex((h + 270) % 360, 0.4, 0.65));
    }

    expandedPaletteCache.set(cacheKey, expanded);
    return expanded;
};

// 全局颜色分配器，按 Dashboard 隔离
const globalColorAssignments = new Map<string, Map<string, string>>();

/**
 * 重置指定 Dashboard 的颜色分配状态
 */
export const resetDashboardColorAssignments = (dashboardUuid: string) => {
    globalColorAssignments.delete(dashboardUuid);
};

/**
 * 全局哈希颜色分配（带色差保障）
 * - 相同 identifier → 相同颜色（跨图表一致）
 * - 不同 identifier → 颜色差异足够大（避免相似）
 */
export const getGlobalHashColor = (
    identifier: string,
    colorPalette: string[],
    dashboardUuid: string,
): string => {
    if (!colorPalette || colorPalette.length === 0) {
        return '#868e96';
    }

    // 获取或创建该 Dashboard 的颜色分配记录
    let dashboardAssignments = globalColorAssignments.get(dashboardUuid);
    if (!dashboardAssignments) {
        dashboardAssignments = new Map();
        globalColorAssignments.set(dashboardUuid, dashboardAssignments);
    }

    // 如果已分配过，直接返回（跨图表一致）
    if (dashboardAssignments.has(identifier)) {
        return dashboardAssignments.get(identifier)!;
    }

    // 获取扩展调色板（包含所有变体）
    const expanded = expandPalette(colorPalette);

    // 计算初始颜色索引
    const hash = hashString(identifier);
    let colorIndex = hash % expanded.length;
    let color = expanded[colorIndex];

    // 色差检查
    const usedColors = [...dashboardAssignments.values()];
    let safetyCounter = 0;
    const maxAttempts = 100; // 最多尝试100次
    let currentColor = color;

    // 色差检查循环 - 使用函数外部变量来避免闭包问题
    let needsColorAdjustment = usedColors.some(
        (usedColor) =>
            colorDifference(currentColor, usedColor) < MIN_COLOR_DIFF,
    );
    while (needsColorAdjustment) {
        colorIndex++;
        // 超出扩展调色板范围时，使用色相旋转生成新颜色
        if (colorIndex >= expanded.length) {
            // 使用更大的色相间隔，确保颜色差异明显
            const step = 13 + safetyCounter * 7; // 质数间隔，分布更均匀
            const hue = (hash + step * safetyCounter * 17) % 360;
            // 饱和度和亮度使用更大范围，确保不会过低
            const sat = Math.max(
                0.5,
                Math.min(1.0, 0.5 + ((safetyCounter * 11) % 50) / 100),
            ); // 0.5-1.0
            const lig = Math.max(
                0.4,
                Math.min(0.7, 0.4 + ((safetyCounter * 13) % 30) / 100),
            ); // 0.4-0.7
            currentColor = hslToHex(hue, sat, lig);
        } else {
            currentColor = expanded[colorIndex];
        }
        // 更新检查条件
        needsColorAdjustment = usedColors.some(
            (usedColor) =>
                colorDifference(currentColor, usedColor) < MIN_COLOR_DIFF,
        );
        safetyCounter++;

        if (safetyCounter >= maxAttempts) {
            break;
        }
    }

    // 记录分配结果
    dashboardAssignments.set(identifier, currentColor);
    return currentColor;
};

/**
 * Get a color from the palette, generating new colors beyond palette size.
 * Uses hue rotation (30°) with saturation/lightness adjustments for harmonious colors.
 */
const getColorFromPalette = (index: number, colorPalette: string[]): string => {
    // Safety check: if palette is empty or undefined, return a default gray color
    if (!colorPalette || colorPalette.length === 0) {
        return '#868e96'; // gray.6 fallback
    }

    // If index is within palette range, return the original color
    if (index < colorPalette.length) {
        return colorPalette[index];
    }

    // Beyond palette range, generate new colors
    const baseColorIndex = index % colorPalette.length;
    const baseColor = colorPalette[baseColorIndex];
    const rotationCycles = Math.floor(index / colorPalette.length);

    // Use 30° hue rotation - more subtle than golden angle
    const hueRotation = rotationCycles * 30;

    // Adjust saturation and lightness in a wave pattern for visual variety
    const saturationAdjustment = Math.sin(rotationCycles * Math.PI * 0.5) * 15;
    const lightnessAdjustment = Math.sin(rotationCycles * Math.PI * 0.3) * 10;

    // Convert base color to HSL, adjust, and convert back
    const { h, s, l } = hexToHSL(baseColor);
    const newH = (h + hueRotation) % 360;
    const newS = Math.max(0.4, Math.min(1.0, s + saturationAdjustment / 100));
    const newL = Math.max(0.3, Math.min(0.8, l + lightnessAdjustment / 100));

    return hslToHex(newH, newS, newL);
};

/**
 * 哈希颜色分配（纯函数）
 * 使用扩展调色板（原色+变体），减少碰撞
 * 相同 identifier + 相同 colorPalette → 永远返回相同颜色
 * 保证跨图表一致性：不同图表中同名的 identifier 颜色一定相同
 */
export const getHashColor = (
    identifier: string,
    colorPalette: string[],
): string => {
    if (!colorPalette || colorPalette.length === 0) {
        return '#868e96';
    }
    const expanded = expandPalette(colorPalette);
    const colorIndex = hashString(identifier) % expanded.length;
    return expanded[colorIndex];
};

const useChartColorMappingContext = (): ChartColorMappingContextProps => {
    const ctx = useContext(ChartColorMappingContext);

    if (ctx == null) {
        throw new Error(
            'useChartColorMappingContext must be used inside ChartColorMappingContextProvider ',
        );
    }

    return ctx;
};

export const useChartColorConfig = ({
    colorPalette,
    useHashBased = false,
    dashboardUuid,
}: {
    colorPalette: string[];
    /** 当为 true 时，使用哈希分配颜色，相同 identifier 获得相同颜色 */
    useHashBased?: boolean;
    /** Dashboard UUID，用于全局颜色分配器隔离 */
    dashboardUuid?: string;
}) => {
    const theme = useMantineTheme();
    const { colorMappings } = useChartColorMappingContext();

    /**
     * Given the org's color palette, and an identifier, return the color palette value
     * for said identifier.
     *
     * This works by taking a group and identifier, and cycling through the color palette
     * colors on a first-come first-serve basis, scoped to a particular group of identifiers.
     *
     * 'Group' will generally be something like a table or model name, e.g 'customer',
     * 'Identifier' will generally be something like a field name, or a group value.
     *
     * Because this color cycling is done per group, it allows unrelated charts/series
     * to cycle through colors in the palette in parallel.
     */
    const calculateKeyColorAssignment = useCallback(
        (group: string, identifier: string) => {
            // Ensure we always color null the same:
            if (!identifier || identifier === 'null') {
                return theme.colors.gray[6];
            }

            // 哈希模式：带色差保障的全局颜色分配
            if (useHashBased) {
                // 如果提供了 dashboardUuid，使用全局分配器（跨图表一致 + 色差保障）
                if (dashboardUuid) {
                    return getGlobalHashColor(
                        identifier,
                        colorPalette,
                        dashboardUuid,
                    );
                }
                // 否则使用纯函数方式（可能存在颜色相似问题）
                return getHashColor(identifier, colorPalette);
            }

            // 顺序模式：按到达顺序分配颜色（原有逻辑）
            let groupMappings = colorMappings.get(group);

            /**
             * If we already picked a color for this group/identifier pair, return it:
             */
            if (groupMappings && groupMappings.has(identifier)) {
                const colorIndex = groupMappings.get(identifier)!;
                return getColorFromPalette(colorIndex, colorPalette);
            }

            /**
             * If this is the first time we're seeing this group, create a sub-map for it:
             */
            if (!groupMappings) {
                groupMappings = new Map<string, number>();
                colorMappings.set(group, groupMappings);
            }

            /**
             * Figure out the last color assigned in this group, and increment the index.
             * No longer wraps back to 0 - will generate new colors beyond palette size.
             */
            const currentIdx = groupMappings.get(ASSIGNMENT_IDX_KEY) ?? -1;
            const nextIdx = currentIdx + 1;
            const colorHex = getColorFromPalette(nextIdx, colorPalette);

            // Keep track of the current value of the color idx for this group:
            groupMappings.set(ASSIGNMENT_IDX_KEY, nextIdx);

            // Keep track of the color idx used for this identifier, within this group:
            groupMappings.set(identifier, nextIdx);

            return colorHex;
        },
        [colorPalette, colorMappings, theme, useHashBased, dashboardUuid],
    );

    const calculateSeriesColorAssignment = useCallback(
        (series: SeriesLike) => {
            const [baseField, completeIdentifier] =
                calculateSeriesLikeIdentifier(series);

            return calculateKeyColorAssignment(baseField, completeIdentifier);
        },
        [calculateKeyColorAssignment],
    );

    return {
        calculateKeyColorAssignment,
        calculateSeriesColorAssignment,
    };
};
