import { parseToRgb } from 'polished';
import {
    lookupSyncedColor,
    normalizeColorSyncKeys,
    toColorSyncKey,
} from './colorSyncKeys';

const FALLBACK_COLOR = '#868e96';
export const MIN_COLOR_DIFF = 45;
const MAX_AVOID_ATTEMPTS = 100;

type ParsedRgb = { r: number; g: number; b: number };

const normalizeColor = (color: string): string => color.trim().toLowerCase();

/** hex / rgb / rgba / hsl 统一成 RGB；解析失败返回 null。 */
const parseColor = (color: string): ParsedRgb | null => {
    const trimmed = color.trim();
    if (!trimmed) return null;

    const tryParse = (value: string): ParsedRgb | null => {
        try {
            const rgb = parseToRgb(value);
            return { r: rgb.red, g: rgb.green, b: rgb.blue };
        } catch {
            return null;
        }
    };

    const parsed = tryParse(trimmed);
    if (parsed) return parsed;
    if (!trimmed.startsWith('#')) {
        return tryParse(`#${trimmed}`);
    }
    return null;
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

export const hslToHex = (h: number, s: number, l: number): string => {
    const safeH = ((h % 360) + 360) % 360;
    const safeS = Math.max(0, Math.min(1, s));
    const safeL = Math.max(0, Math.min(1, l));

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

export { hexToHSL };

const hashString = (str: string): number => {
    const key = toColorSyncKey(str);
    // FNV-1a，32 位回绕，避免 JS 乘法丢精度
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const expandedPaletteCache = new Map<string, string[]>();

/** 主题色用尽后只做同色相深浅微调，不再大角度转色。 */
export const expandPalette = (colorPalette: string[]): string[] => {
    const cacheKey = colorPalette.join(',');
    const cached = expandedPaletteCache.get(cacheKey);
    if (cached) return cached;

    const expanded: string[] = [...colorPalette];
    for (const color of colorPalette) {
        const { h, s, l } = hexToHSL(color);
        expanded.push(hslToHex(h, s, Math.min(0.78, l + 0.14)));
        expanded.push(hslToHex(h, s, Math.max(0.28, l - 0.14)));
        expanded.push(
            hslToHex(h, Math.max(0.35, s - 0.12), Math.min(0.72, l + 0.08)),
        );
        expanded.push(
            hslToHex(h, Math.min(0.85, s + 0.08), Math.max(0.32, l - 0.08)),
        );
    }

    expandedPaletteCache.set(cacheKey, expanded);
    return expanded;
};

const rgbDistance = (a: ParsedRgb, b: ParsedRgb): number =>
    Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);

/** 可解析色按 RGB 欧氏距离；无效色回落到规范化字符串（相同为 0，否则视为足够远）。 */
export const colorDifference = (color1: string, color2: string): number => {
    const rgb1 = parseColor(color1);
    const rgb2 = parseColor(color2);
    if (rgb1 && rgb2) {
        return rgbDistance(rgb1, rgb2);
    }
    return normalizeColor(color1) === normalizeColor(color2)
        ? 0
        : Number.POSITIVE_INFINITY;
};

const conflictsWithUsed = (color: string, usedColors: string[]): boolean =>
    usedColors.some((used) => colorDifference(color, used) < MIN_COLOR_DIFF);

export const getHashColor = (
    identifier: string,
    colorPalette: string[],
): string => {
    if (!colorPalette || colorPalette.length === 0) {
        return FALLBACK_COLOR;
    }
    return colorPalette[hashString(identifier) % colorPalette.length];
};

const pickAvoidingColor = (
    identifier: string,
    colorPalette: string[],
    usedColors: string[],
): string => {
    if (!colorPalette || colorPalette.length === 0) {
        return FALLBACK_COLOR;
    }

    const hash = hashString(identifier);
    const start = hash % colorPalette.length;

    for (let offset = 0; offset < colorPalette.length; offset++) {
        const color = colorPalette[(start + offset) % colorPalette.length];
        if (!conflictsWithUsed(color, usedColors)) {
            return color;
        }
    }

    const expanded = expandPalette(colorPalette);
    for (let index = colorPalette.length; index < expanded.length; index++) {
        const color = expanded[index];
        if (!conflictsWithUsed(color, usedColors)) {
            return color;
        }
    }

    const base = hexToHSL(colorPalette[start]);
    let color = colorPalette[start];
    for (let attempt = 1; attempt <= MAX_AVOID_ATTEMPTS; attempt++) {
        color = hslToHex(
            (base.h + attempt * 30) % 360,
            Math.max(0.4, Math.min(0.85, base.s)),
            Math.max(0.35, Math.min(0.7, base.l)),
        );
        if (!conflictsWithUsed(color, usedColors)) {
            return color;
        }
    }

    return color;
};

const buildCooccurrenceNeighbors = (
    keys: string[],
    chartGroups: string[][],
): Map<string, Set<string>> => {
    const neighbors = new Map<string, Set<string>>();
    keys.forEach((key) => neighbors.set(key, new Set()));

    chartGroups.forEach((group) => {
        const normalized = normalizeColorSyncKeys(group);
        for (let i = 0; i < normalized.length; i++) {
            for (let j = i + 1; j < normalized.length; j++) {
                neighbors.get(normalized[i])?.add(normalized[j]);
                neighbors.get(normalized[j])?.add(normalized[i]);
            }
        }
    });

    return neighbors;
};

/**
 * 按共现关系从看板主题色分配。
 * 同名全局一色；只与同图共现的名称避让。手配色不参与分配。
 * 未传 chartGroups 时，knownColorKeys 视为同一组（全部互斥）。
 */
export const assignKnownHashColors = (
    knownColorKeys: string[],
    colorPalette: string[],
    _manualColors: Record<string, string> = {},
    chartGroups: string[][] = [],
): Record<string, string> => {
    const groups =
        chartGroups.length > 0
            ? chartGroups
                  .map((group) => normalizeColorSyncKeys(group))
                  .filter((group) => group.length > 0)
            : [normalizeColorSyncKeys(knownColorKeys)].filter(
                  (group) => group.length > 0,
              );
    const allKeys = normalizeColorSyncKeys([
        ...knownColorKeys,
        ...groups.flat(),
    ]);
    const neighbors = buildCooccurrenceNeighbors(allKeys, groups);
    const assignments: Record<string, string> = {};

    allKeys.forEach((key) => {
        const usedByNeighbors = [...(neighbors.get(key) ?? [])]
            .map((neighbor) => assignments[neighbor])
            .filter((color): color is string => Boolean(color));
        assignments[key] = pickAvoidingColor(
            key,
            colorPalette,
            usedByNeighbors,
        );
    });

    return assignments;
};

/**
 * 本图可见名只追加：不在 known 里的按 UTF-16 排序后避让本图已见色，不回头改 known。
 */
export const appendUnknownHashColors = (
    visibleKeys: string[],
    colorPalette: string[],
    knownAssignments: Record<string, string>,
): Record<string, string> => {
    const assignments = { ...knownAssignments };
    const visibleNormalized = normalizeColorSyncKeys(visibleKeys);
    const usedColors = visibleNormalized
        .map((key) => lookupSyncedColor(key, assignments))
        .filter((color): color is string => Boolean(color));
    const unknown = visibleNormalized.filter(
        (key) => !lookupSyncedColor(key, assignments),
    );

    unknown.forEach((key) => {
        const color = pickAvoidingColor(key, colorPalette, usedColors);
        assignments[key] = color;
        usedColors.push(color);
    });

    return assignments;
};

/**
 * known 命中则用预分配；未知名只取主题哈希，不避让全看板已占色。
 */
export const resolveSyncedHashColor = (
    identifier: string,
    colorPalette: string[],
    knownAssignments: Record<string, string>,
): string => {
    const mapped = lookupSyncedColor(identifier, knownAssignments);
    if (mapped) return mapped;
    return getHashColor(identifier, colorPalette);
};
