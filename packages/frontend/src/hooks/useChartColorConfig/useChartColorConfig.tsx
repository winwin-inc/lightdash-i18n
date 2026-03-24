import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
import { ASSIGNMENT_IDX_KEY } from './constants';
import { ChartColorMappingContext } from './context';
import { type ChartColorMappingContextProps, type SeriesLike } from './types';
import { calculateSeriesLikeIdentifier } from './utils';

/**
 * 提取维度值的类别部分
 * 例如: "其他品牌：包含494个" -> "其他品牌", "QQ星, 4.44%" -> "QQ星"
 */
const extractCategory = (str: string): string => {
    const separators = ['：', ',', '，'];
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
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        const char = category.charCodeAt(i);
        hash = (hash << 5) - hash + char;
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
    const hueToRgb = (p: number, q: number, t: number) => {
        let tNorm = t;
        if (tNorm < 0) tNorm += 1;
        if (tNorm > 1) tNorm -= 1;
        if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
        if (tNorm < 1 / 2) return q;
        if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
        return p;
    };

    const hNorm = h / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = Math.round(hueToRgb(p, q, hNorm + 1 / 3) * 255);
    const g = Math.round(hueToRgb(p, q, hNorm) * 255);
    const b = Math.round(hueToRgb(p, q, hNorm - 1 / 3) * 255);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
 * 扩展调色板：为每个基色生成 4 个变体，用于 hash 模式减少碰撞
 * 9 色 → 45 色，碰撞概率进一步降低到 ~2.2%
 * 纯函数，结果缓存
 */
const expandedPaletteCache = new Map<string, string[]>();
const expandPalette = (colorPalette: string[]): string[] => {
    const cacheKey = colorPalette.join(',');
    const cached = expandedPaletteCache.get(cacheKey);
    if (cached) return cached;

    const expanded: string[] = [...colorPalette];
    for (const color of colorPalette) {
        const { h, s, l } = hexToHSL(color);
        // 变体1：略浅（亮度+10%，饱和度-8%）
        expanded.push(
            hslToHex(
                h,
                Math.max(0.2, Math.min(1.0, s - 0.08)),
                Math.max(0.35, Math.min(0.85, l + 0.1)),
            ),
        );
        // 变体2：略深（亮度-10%，饱和度+6%）
        expanded.push(
            hslToHex(
                h,
                Math.max(0.25, Math.min(1.0, s + 0.06)),
                Math.max(0.25, Math.min(0.65, l - 0.1)),
            ),
        );
        // 变体3：更浅（亮度+18%，饱和度-12%）
        expanded.push(
            hslToHex(
                h,
                Math.max(0.15, Math.min(0.9, s - 0.12)),
                Math.max(0.45, Math.min(0.9, l + 0.18)),
            ),
        );
        // 变体4：更深（亮度-18%，饱和度+10%）
        expanded.push(
            hslToHex(
                h,
                Math.max(0.3, Math.min(1.0, s + 0.1)),
                Math.max(0.2, Math.min(0.55, l - 0.18)),
            ),
        );
    }

    expandedPaletteCache.set(cacheKey, expanded);
    return expanded;
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
}: {
    colorPalette: string[];
    /** 当为 true 时，使用哈希分配颜色，相同 identifier 获得相同颜色 */
    useHashBased?: boolean;
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

            // 哈希模式：纯函数分配，跨图表一致
            if (useHashBased) {
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
        [colorPalette, colorMappings, theme, useHashBased],
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
