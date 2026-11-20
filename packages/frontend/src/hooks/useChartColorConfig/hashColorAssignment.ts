import { parseToRgb } from 'polished';
import {
    lookupSyncedColor,
    normalizeColorSyncKeys,
    toColorSyncKey,
} from './colorSyncKeys';

const FALLBACK_COLOR = '#868e96';
/**
 * 主题色板内部的最小可接受感知色差（CIEDE2000，ΔE00）。
 *
 * 取 12 的依据：20 色纯霓虹色板（S=1、L=0.5 色相环重采样）的两两 ΔE00
 * 上限实测只有 12.56，取 12 才能保住「20 系列全部用色板原色」；
 * 换成明度/饱和度分层色板后可抬到 15–19。原 RGB 欧氏距离口径的 45
 * 与 ΔE00 相关性仅 0.788，`#00FF00/#00FF40`（ΔE00 2.52、RGB 64）会被
 * 45/60 同时放过，属于量纲错误而非数值大小问题。
 */
export const MIN_COLOR_DIFF = 12;
/**
 * 阶梯目标（deterministic ladder）：已用色越多，可接受的候选色差越低。
 * 取代旧的「必须 ≥12/15 才接受」：
 * - used < 40  → 12（MIN_COLOR_DIFF）：绝大多数图（≤ 40 系列）保持全量
 *   高色差；20 色板 + 40 个扩展变体（构造自检 ≥ 15）覆盖到 60，前 40 个
 *   名字几乎总能拿到 ≥ 12 的候选。
 * - 40 ≤ used < 80 → 8：候选开始互相挤占，8 仍是肉眼清晰可分的色差
 *   （旧饱和保底档的档位）。
 * - used ≥ 80 → 5：硬底线档。80 之后目标已降到 5，任意候选扫描几乎
 *   第一个就早退命中，不再需要大候选池。
 *
 * 语义底线不变：任何档位都不接受 ΔE < 5 的候选（P0，见 HARD_FLOOR）。
 */
const LADDER_MID_DIFF = 8;
const HARD_FLOOR_DIFF = 5;
const LADDER_MID_USED = 40;
const LADDER_FLOOR_USED = 80;

/** 硬底线：永不返回与已用色 ΔE00 < 5 的候选（肉眼同一颜色，P0）。 */
export const effectiveTarget = (usedCount: number): number => {
    if (usedCount < LADDER_MID_USED) return MIN_COLOR_DIFF;
    if (usedCount < LADDER_FLOOR_USED) return LADDER_MID_DIFF;
    return HARD_FLOOR_DIFF;
};
const MAX_AVOID_ATTEMPTS = 100;

type ParsedRgb = { r: number; g: number; b: number };
type Lab = { L: number; a: number; b: number };

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

/** sRGB（gamma 展开）→ XYZ(D65) → CIE Lab。 */
const rgbToLab = ({ r, g, b }: ParsedRgb): Lab => {
    const toLinear = (v: number): number => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const R = toLinear(r);
    const G = toLinear(g);
    const B = toLinear(b);
    const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
    const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
    const f = (t: number): number =>
        t > 0.008856451679035631
            ? Math.cbrt(t)
            : 7.787037037037035 * t + 16 / 116;
    const fx = f(X / 0.95047);
    const fy = f(Y);
    const fz = f(Z / 1.08883);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
};

/**
 * hex→Lab 缓存。分配是 O(N²·候选) 的比较密集型，不做缓存时每次比较
 * 都要重跑 gamma 展开与立方根（20 系列 × 100 候选 × 20 已用色 ≈ 4 万次
 * 转换/图，看板多图叠加会卡），必须走 Map。
 */
const labCache = new Map<string, Lab | null>();
const getLab = (color: string): Lab | null => {
    const key = normalizeColor(color);
    if (labCache.has(key)) return labCache.get(key) ?? null;
    const rgb = parseColor(key);
    const lab = rgb ? rgbToLab(rgb) : null;
    labCache.set(key, lab);
    return lab;
};

const DEG = Math.PI / 180;
const POW25_7 = 25 ** 7;

/** CIEDE2000（kL=kC=kH=1，Sharma 2005 标准实现）。无内层闭包：本函数处于 O(N²·候选) 热路径。 */
const ciede2000 = (lab1: Lab, lab2: Lab): number => {
    const L1 = lab1.L;
    const a1 = lab1.a;
    const b1 = lab1.b;
    const L2 = lab2.L;
    const a2 = lab2.a;
    const b2 = lab2.b;
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cbar = (C1 + C2) / 2;
    const Cbar7 = Cbar ** 7;
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);
    let h1p = 0;
    if (b1 !== 0 || a1p !== 0) {
        h1p = Math.atan2(b1, a1p) / DEG;
        if (h1p < 0) h1p += 360;
    }
    let h2p = 0;
    if (b2 !== 0 || a2p !== 0) {
        h2p = Math.atan2(b2, a2p) / DEG;
        if (h2p < 0) h2p += 360;
    }
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) dhp -= 360;
        else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG);
    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;
    let hbarp = h1p + h2p;
    if (C1p * C2p !== 0) {
        if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
        else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
        else hbarp = (h1p + h2p - 360) / 2;
    }
    const T =
        1 -
        0.17 * Math.cos((hbarp - 30) * DEG) +
        0.24 * Math.cos(2 * hbarp * DEG) +
        0.32 * Math.cos((3 * hbarp + 6) * DEG) -
        0.2 * Math.cos((4 * hbarp - 63) * DEG);
    const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
    const Cbarp7 = Cbarp ** 7;
    const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
    const SL =
        1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
    const SC = 1 + 0.045 * Cbarp;
    const SH = 1 + 0.015 * Cbarp * T;
    const RT = -Math.sin(2 * dTheta * DEG) * RC;
    const tL = dLp / SL;
    const tC = dCp / SC;
    const tH = dHp / SH;
    return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
};

/**
 * 可解析色按 CIEDE2000 感知色差；无效色回落到规范化字符串
 * （相同为 0，否则视为足够远）。导出名、参数、返回类型与旧版一致。
 */
export const colorDifference = (color1: string, color2: string): number => {
    const lab1 = getLab(color1);
    const lab2 = getLab(color2);
    if (lab1 && lab2) {
        return ciede2000(lab1, lab2);
    }
    return normalizeColor(color1) === normalizeColor(color2)
        ? 0
        : Number.POSITIVE_INFINITY;
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

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * 分配循环内传递的已用色累加器：颜色串 + Lab 并行数组 + 归一化集合。
 * 只做追加与带剪枝的最小距离/成员查询；不维护候选池的增量 minDist
 * （阶梯阈值下早退占绝对主导，全量重算配合 abortBelow 剪枝已足够快，
 * 实测 240 已用色全程 < 150ms）。
 */
class UsedColorTracker {
    readonly colors: string[] = [];

    private readonly labs: Array<Lab | null> = [];

    private readonly normalizedColors = new Set<string>();

    push(color: string): void {
        this.colors.push(color);
        this.labs.push(getLab(color));
        this.normalizedColors.add(normalizeColor(color));
    }

    /** color 是否已被本累加器记录（规范化比较）。 */
    has(color: string): boolean {
        return this.normalizedColors.has(normalizeColor(color));
    }

    /** color 与已用色的最小 ΔE00；一旦低于 abortBelow 立即返回（剪枝上界，< abortBelow ⟹ 必然落选）。 */
    minDistance(color: string, abortBelow: number): number {
        const lab = getLab(color);
        if (!lab) return Number.POSITIVE_INFINITY;
        let min = Number.POSITIVE_INFINITY;
        for (const usedLab of this.labs) {
            if (!usedLab) continue;
            const d = ciede2000(lab, usedLab);
            if (d < min) {
                min = d;
                if (min < abortBelow) return min;
            }
        }
        return min;
    }

    isFarEnough(color: string, threshold: number): boolean {
        return this.minDistance(color, threshold) >= threshold;
    }
}

/** 扩展变体构造时的自检阈值：变体与基色（及已收入扩展表的所有色）至少差 15。 */
const MIN_GENERATED_COLOR_DIFF = 15;

/**
 * 主题色用尽后的生成变体：每个基色只补 2 个，且取向按「色相错开 + 明度
 * 拉开」排列（h±10° 配 l±0.18 起步，不够再加大角度），并对每个变体做
 * ΔE ≥ MIN_GENERATED_COLOR_DIFF 的自检（对照基色与已收入扩展表的所有
 * 颜色），不达标就换下一个取向；全部不达标时取 max-min 取向兜底。
 *
 * 旧实现是 4 个同色相明暗变体（l±0.14 / s±0.12），其中 2 个与基色的
 * ΔE00 < 8（`#FFFF00→#FFFF47` 仅 2.56），是「同一图里两条一样的黄」的
 * 直接来源。结果按调色板缓存，同一调色板 → 同一结果（确定性）。
 *
 * 注意：15 只是**构造**自检；分配时是否接受一个变体由阶梯阈值
 * `effectiveTarget` 决定（变体还必须与当时的全部已用色达标）。
 */
const EXPAND_ORIENTATIONS: ReadonlyArray<{
    dh: number;
    dl: number;
    ds: number;
}> = [
    { dh: 10, dl: 0.18, ds: 0 },
    { dh: -10, dl: -0.18, ds: 0 },
    { dh: 24, dl: 0.24, ds: -0.1 },
    { dh: -24, dl: -0.24, ds: -0.1 },
    { dh: 40, dl: 0.05, ds: -0.2 },
    { dh: -40, dl: -0.05, ds: 0.15 },
    { dh: 65, dl: -0.12, ds: -0.1 },
    { dh: -65, dl: 0.12, ds: 0.1 },
    // 极端明度取向：色相密集的色板簇（如黄/橙族）在常规取向下可能全部
    // < 15，必须拉开明度才能达标（否则兜底取向产出近色变体）。
    { dh: 8, dl: 0.3, ds: -0.25 },
    { dh: -8, dl: -0.3, ds: -0.25 },
];

const expandedPaletteCache = new Map<string, string[]>();

export const expandPalette = (colorPalette: string[]): string[] => {
    const cacheKey = colorPalette.join(',');
    const cached = expandedPaletteCache.get(cacheKey);
    if (cached) return cached;

    const expanded: string[] = [...colorPalette];
    // reference = 调色板原色 + 已收入的全部变体，用累加器增量维护
    const reference = new UsedColorTracker();
    colorPalette.forEach((color) => reference.push(color));
    for (const color of colorPalette) {
        const { h, s, l } = hexToHSL(color);
        for (let slot = 0; slot < 2; slot++) {
            let chosen = '';
            let chosenMin = -1;
            for (const o of EXPAND_ORIENTATIONS) {
                const candidate = hslToHex(
                    h + o.dh,
                    clamp(s + o.ds, 0.25, 1),
                    clamp(l + o.dl, 0.14, 0.9),
                );
                if (reference.has(candidate)) {
                    continue;
                }
                const min = reference.minDistance(candidate, -1);
                if (min >= MIN_GENERATED_COLOR_DIFF) {
                    chosen = candidate;
                    break;
                }
                if (min > chosenMin) {
                    chosenMin = min;
                    chosen = candidate;
                }
            }
            if (chosen) {
                expanded.push(chosen);
                reference.push(chosen);
            }
        }
    }

    expandedPaletteCache.set(cacheKey, expanded);
    return expanded;
};

export const getHashColor = (
    identifier: string,
    colorPalette: string[],
): string => {
    if (!colorPalette || colorPalette.length === 0) {
        return FALLBACK_COLOR;
    }
    return colorPalette[hashString(identifier) % colorPalette.length];
};

/**
 * 第 1–11 个候选保持历史上的 +30° 步进（既有分配结果不变）。
 * 原为 12 步，但第 12 个候选 12×30°=360° 会绕回基色相（与基色 ΔE00 仅
 * 2.1–4.1，如 `#FFFF00→#ECEC13`），因此历史兼容范围缩短为 11 步。
 */
const LEGACY_HUE_STEPS = 11;
const LEGACY_HUE_STEP_DEG = 30;
/** 之后改用黄金角，让候选色相尽量分散，避免绕回撞色 */
const GOLDEN_ANGLE_DEG = 137.508;

/**
 * 第 `attempt` 个候选色。
 *
 * 前 11 个与历史实现逐字一致（色相 +30°、饱和度/亮度取 base 的钳制值），
 * 保证"以前能分配成功"的系列颜色完全不变；从第 12 个起用黄金角扩空间。
 * 黄金角分支的饱和度/亮度网格依赖 base 的 s/l（避免不同基色收敛到同格）。
 */
const hueCandidateAt = (
    base: { h: number; s: number; l: number },
    attempt: number,
): string => {
    if (attempt <= LEGACY_HUE_STEPS) {
        return hslToHex(
            (base.h + attempt * LEGACY_HUE_STEP_DEG) % 360,
            clamp(base.s, 0.4, 0.85),
            clamp(base.l, 0.35, 0.7),
        );
    }

    const step = attempt - LEGACY_HUE_STEPS;
    const hue =
        (base.h +
            LEGACY_HUE_STEPS * LEGACY_HUE_STEP_DEG +
            step * GOLDEN_ANGLE_DEG) %
        360;
    const saturation = clamp(base.s - 0.4 + (step % 4) * 0.22, 0.15, 0.95);
    const lightness = clamp(
        base.l - 0.24 + (Math.floor(step / 4) % 4) * 0.18,
        0.16,
        0.88,
    );
    return hslToHex(hue, saturation, lightness);
};

/**
 * 兜底候选网格（静态 216 色，Lab 预热进 labCache）：
 * h 每 15°（24 档）× s∈{0.45,0.6,0.75} × l∈{0.35,0.5,0.65}。
 * 阶梯阈值下（≥80 已用色后目标降为 5）早退几乎立刻命中，不再需要
 * 更大的候选池或增量 minDist 状态。
 */
const FALLBACK_GRID: string[] = [];
const buildFallbackGrid = (): void => {
    for (let hi = 0; hi < 24; hi++) {
        for (const s of [0.45, 0.6, 0.75]) {
            for (const l of [0.35, 0.5, 0.65]) {
                const hex = hslToHex(hi * 15, s, l);
                FALLBACK_GRID.push(hex);
                getLab(hex);
            }
        }
    }
};
buildFallbackGrid();

/** 细搜偏移：在网格最优点周围 ±1.875° / ±0.019 内再探一步，钉住格点之间的空隙。 */
const FINE_OFFSETS: ReadonlyArray<{ dh: number; ds: number; dl: number }> = [
    ...[-1.875, -0.9375, 0, 0.9375, 1.875].flatMap((dh) =>
        [-0.01875, -0.009375, 0, 0.009375, 0.01875].flatMap((ds) =>
            [-0.01875, -0.009375, 0, 0.009375, 0.01875].map((dl) => ({
                dh,
                ds,
                dl,
            })),
        ),
    ),
].filter((o) => !(o.dh === 0 && o.ds === 0 && o.dl === 0));

/**
 * 网格兜底（唯一一套，所有调用方共用）：从 hash 起点确定性遍历 216 网格，
 * 命中第一个 minΔE ≥ target 的候选就返回（早退）；全部不达标时对最优
 * 格点做一轮细搜后返回 max-min 候选（并列按遍历序第一）。target 来自
 * 阶梯（≥ HARD_FLOOR_DIFF），因此早退结果永不违反 P0；max-min 结果只有
 * 在整个候选空间（变体 + 色相候选 + 216 网格 + 细搜，> 2400 个候选）
 * 全部低于 5 时才可能 < 5——支持的规模（≤ 240 系列）下不可达。
 */
const gridFallback = (
    hash: number,
    used: UsedColorTracker,
    target: number,
): string => {
    const startIdx = hash % FALLBACK_GRID.length;
    let best = '';
    let bestMin = -1;
    for (let i = 0; i < FALLBACK_GRID.length; i++) {
        const candidate = FALLBACK_GRID[(startIdx + i) % FALLBACK_GRID.length];
        if (used.has(candidate)) continue; // 已用格点最小距离为 0，直接跳过
        const min = used.minDistance(candidate, Math.max(target, bestMin));
        if (min >= target) {
            return candidate;
        }
        if (min > bestMin) {
            bestMin = min;
            best = candidate;
        }
    }
    if (best) {
        const { h, s, l } = hexToHSL(best);
        for (const o of FINE_OFFSETS) {
            const candidate = hslToHex(
                h + o.dh,
                clamp(s + o.ds, 0.05, 1),
                clamp(l + o.dl, 0.05, 0.95),
            );
            const min = used.minDistance(candidate, Math.max(target, bestMin));
            if (min >= target) {
                return candidate;
            }
            if (min > bestMin) {
                bestMin = min;
                best = candidate;
            }
        }
    }
    return best || FALLBACK_COLOR;
};

/**
 * 同一张图内分配颜色（所有调用方共用这一套避让 + 兜底）。
 *
 * 顺序：主题色（两趟）→ 扩展变体 → 同基色色相候选 → 网格兜底。
 * 主题色两趟规则：
 * 1. 从 hash 起点线性探测，返回第一个「未用过 且 与已用色 ΔE ≥
 *    MIN_COLOR_DIFF」的调色板色；
 * 2. 仍无解时返回第一个「未用过」的调色板色——保证本图系列数 ≤ 调色板
 *    色数时永远只出调色板原色（选了色板，线就是色板里的色）；由此产生
 *    的近色对来自色板自身，与兜底无关。
 *
 * 生成色与兜底段统一按阶梯阈值 `effectiveTarget(已用色数)` 扫描：命中
 * 第一个 ≥ target 的候选即返回（早退）；全不达标时由 gridFallback 返回
 * max-min 候选。任何档位都不接受 ΔE < 5（P0）。
 */
const pickAvoidingColor = (
    identifier: string,
    colorPalette: string[],
    used: UsedColorTracker,
): string => {
    if (!colorPalette || colorPalette.length === 0) {
        return FALLBACK_COLOR;
    }

    const hash = hashString(identifier);
    const start = hash % colorPalette.length;

    // 第 1 趟：未用过 且 与已用色感知距离足够
    for (let offset = 0; offset < colorPalette.length; offset++) {
        const color = colorPalette[(start + offset) % colorPalette.length];
        if (used.has(color)) {
            continue;
        }
        if (used.isFarEnough(color, MIN_COLOR_DIFF)) {
            return color;
        }
    }
    // 第 2 趟（色板保真兜底）：只要求完全不同。单色系色板（商务/复古）的
    // 深浅过渡是设计意图，按阈值拒绝会让用户看到一堆别处的颜色。
    for (let offset = 0; offset < colorPalette.length; offset++) {
        const color = colorPalette[(start + offset) % colorPalette.length];
        if (!used.has(color)) {
            return color;
        }
    }

    const target = effectiveTarget(used.colors.length);
    const expanded = expandPalette(colorPalette);
    for (let index = colorPalette.length; index < expanded.length; index++) {
        const color = expanded[index]!;
        if (used.has(color)) continue; // 已用过的变体直接跳过，不做距离扫描
        if (used.isFarEnough(color, target)) {
            return color;
        }
    }

    const base = hexToHSL(colorPalette[start]!);
    for (let attempt = 1; attempt <= MAX_AVOID_ATTEMPTS; attempt++) {
        const color = hueCandidateAt(base, attempt);
        if (used.has(color)) continue; // 同上：跳过已消耗的候选
        if (used.isFarEnough(color, target)) {
            return color;
        }
    }

    return gridFallback(hash, used, target);
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
 * 同名全局一色；只与同图共现的名称避让（每次分配只把共现邻居的已分配色
 * 装进累加器，走与其他调用方完全相同的 pickAvoidingColor/gridFallback）。
 * 手配色不参与分配。未传 chartGroups 时，knownColorKeys 视为同一组。
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
        const used = new UsedColorTracker();
        (neighbors.get(key) ?? []).forEach((neighbor) => {
            const color = assignments[neighbor];
            if (color) used.push(color);
        });
        assignments[key] = pickAvoidingColor(key, colorPalette, used);
    });

    return assignments;
};

/**
 * 看板级追加未知名：只给还没有颜色的名字分配。
 * 占色范围是全部已知色 + 已经追加过的未知名，不看当前图还剩哪些系列。
 * 同一批次待分配名按 UTF-16 码元排序后再逐个避让：不同图/不同注册顺序下，
 * 同一批新增名得到相同的分配结果，跨图同名同色不依赖注册顺序。
 * 已有名字原样返回；无新 key 时复用 appendedAssignments 引用。
 */
export const appendDashboardUnknownHashColors = (
    incomingKeys: string[],
    colorPalette: string[],
    knownAssignments: Record<string, string>,
    appendedAssignments: Record<string, string>,
): Record<string, string> => {
    const incoming = normalizeColorSyncKeys(incomingKeys);
    const unknown = incoming.filter(
        (key) =>
            !lookupSyncedColor(key, knownAssignments) &&
            !lookupSyncedColor(key, appendedAssignments),
    );

    if (unknown.length === 0) {
        return appendedAssignments;
    }

    const next = { ...appendedAssignments };
    const used = new UsedColorTracker();
    [...Object.values(knownAssignments), ...Object.values(next)].forEach(
        (color) => used.push(color),
    );

    // 显式按 UTF-16 码元排序，不依赖 normalizeColorSyncKeys 的顺带排序；
    // 保证同批次分配与传入顺序无关（确定性）。
    const sortedUnknown = [...unknown].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
    );

    sortedUnknown.forEach((key) => {
        const color = pickAvoidingColor(key, colorPalette, used);
        next[key] = color;
        used.push(color);
    });

    return next;
};

/**
 * 本图可见名只追加：不在 known 里的按 UTF-16 排序后避让本图已见色，不回头改 known。
 * 无未知 key 时复用 knownAssignments 引用；同一 known 对象上的相同可见集走有界缓存。
 */
const APPEND_UNKNOWN_CACHE_MAX = 64;
const appendUnknownCache = new WeakMap<
    Record<string, string>,
    Map<string, Record<string, string>>
>();

const getAppendUnknownCacheKey = (
    visibleNormalized: string[],
    colorPalette: string[],
): string => `${visibleNormalized.join('\u0001')}|${colorPalette.join(',')}`;

export const appendUnknownHashColors = (
    visibleKeys: string[],
    colorPalette: string[],
    knownAssignments: Record<string, string>,
): Record<string, string> => {
    const visibleNormalized = normalizeColorSyncKeys(visibleKeys);
    const unknown = visibleNormalized.filter(
        (key) => !lookupSyncedColor(key, knownAssignments),
    );

    if (unknown.length === 0) {
        return knownAssignments;
    }

    const cacheKey = getAppendUnknownCacheKey(visibleNormalized, colorPalette);
    let cacheForKnown = appendUnknownCache.get(knownAssignments);
    const cached = cacheForKnown?.get(cacheKey);
    if (cached) {
        return cached;
    }

    const assignments = { ...knownAssignments };
    const used = new UsedColorTracker();
    visibleNormalized.forEach((key) => {
        const color = lookupSyncedColor(key, assignments);
        if (color) used.push(color);
    });

    unknown.forEach((key) => {
        const color = pickAvoidingColor(key, colorPalette, used);
        assignments[key] = color;
        used.push(color);
    });

    if (!cacheForKnown) {
        cacheForKnown = new Map();
        appendUnknownCache.set(knownAssignments, cacheForKnown);
    }
    if (cacheForKnown.size >= APPEND_UNKNOWN_CACHE_MAX) {
        const oldestKey = cacheForKnown.keys().next().value;
        if (oldestKey !== undefined) {
            cacheForKnown.delete(oldestKey);
        }
    }
    cacheForKnown.set(cacheKey, assignments);

    return assignments;
};

/**
 * 按本图容量分配颜色（ECharts 通道口径）。
 *
 * 看板级合并表（appendDashboardUnknownHashColors）按「整板不重复系列名」
 * 避让，几十个商品名很快占满调色板，单图即使只有 9 条线也会退化成
 * 生成色（实测 40 名 → 20 个颜色落在调色板外）。本函数只看本图：
 * 本图可见系列数 ≤ 调色板去重颜色数时，每条系列都拿到调色板里的原始
 * 颜色且两两不同；只有本图自身超过容量时，才用生成色补足。
 *
 * 分配顺序（key 归一化后按 UTF-16 排序，与输入顺序无关，确定性）：
 * 1. preferred 基准色：key 在看板基准表里有值、该色属于**当前**调色板
 *    （归一化比较）且本图未占用 → 直接继承（保持已保存/跨图稳定）。
 *    过期调色板的色一律忽略——用户切换调色板后必须立刻全部变成
 *    新调色板的色，绝不硬用旧值。
 * 2. 哈希基准色：base = palette[hash(key) % len]，未被本图占用则用；
 *    否则从 base 起线性探测调色板取第一个本图未用的色。
 * 3. 生成色：本图调色板色耗尽（本图系列数 > 调色板去重色数）后沿用
 *    既有生成逻辑（expandPalette / hueCandidateAt / 网格兜底），
 *    仍保证本图内两两不重复。
 *
 * 跨图同名同色由哈希基准色的确定性与 preferred 继承保证；与本图可读性
 * 冲突时以本图优先（对方图若有空闲基准色会通过各自的 preferred 继承回去）。
 */
export const assignVisibleChartColors = ({
    visibleKeys,
    colorPalette,
    preferredAssignments,
}: {
    /** 本图可见系列名 */
    visibleKeys: string[];
    /** 当前选中的调色板 */
    colorPalette: string[];
    /** 看板级基准色（knownHashAssignments），仅作参考继承 */
    preferredAssignments: Record<string, string>;
}): Record<string, string> => {
    const sortedKeys = normalizeColorSyncKeys(visibleKeys);
    const assignments: Record<string, string> = {};

    if (!colorPalette || colorPalette.length === 0) {
        // 空调色板：preferred 里的任何色都不可能属于「当前调色板」，占位色兜底
        sortedKeys.forEach((key) => {
            assignments[key] = FALLBACK_COLOR;
        });
        return assignments;
    }

    const paletteColors = new Set(colorPalette.map(normalizeColor));
    const used = new UsedColorTracker();

    // 第 1 轮：继承「仍在当前调色板内且本图未占用」的基准色
    const pendingKeys = sortedKeys.filter((key) => {
        const preferred = lookupSyncedColor(key, preferredAssignments);
        if (!preferred) return true;
        if (!paletteColors.has(normalizeColor(preferred))) {
            return true; // 过期调色板色：忽略
        }
        if (used.has(preferred)) {
            return true; // 本图已被同名优先级更高的 key 占用
        }
        assignments[key] = preferred;
        used.push(preferred);
        return false;
    });

    // 第 2 + 3 轮：pickAvoidingColor 的主题色两趟即「base 起线性探测调色板」，
    // 调色板耗尽后自动进入生成色段（expandPalette / hueCandidateAt / 网格兜底）
    pendingKeys.forEach((key) => {
        const color = pickAvoidingColor(key, colorPalette, used);
        assignments[key] = color;
        used.push(color);
    });

    return assignments;
};

/**
 * 本图颜色分配器：给「色表里没覆盖到」的系列名兜底，保证不撞色。
 *
 * 历史 bug：取色时 `lookupSyncedColor` 没命中就直接 `getHashColor`（纯哈希取模、无避让），
 * 20 色板上 10 个系列名必有几对撞色。本分配器以预先算好的本图色表为种子，
 * 遇到未覆盖的名字时才按 `pickAvoidingColor` 分配（仍只在本图内避让），
 * 因此任何渲染系列都不会回到无避让的 hash 路径。
 *
 * 注意：分配是惰性、累加的（与 encountered 顺序有关），同一个 allocator 实例在
 * 同一批渲染里结果稳定；新建实例（调色板/种子变化）时重置。
 */
export const createChartColorAllocator = ({
    colorPalette,
    seedAssignments,
}: {
    colorPalette: string[];
    seedAssignments: Record<string, string>;
}): {
    resolve: (identifier: string) => string | undefined;
} => {
    const used = new UsedColorTracker();
    Object.values(seedAssignments).forEach((color) => used.push(color));
    const extraAssignments: Record<string, string> = {};

    return {
        resolve(identifier: string): string | undefined {
            const key = identifier ? toColorSyncKey(identifier) : '';
            if (!key) return undefined;

            const hit =
                lookupSyncedColor(key, seedAssignments) ??
                lookupSyncedColor(key, extraAssignments);
            if (hit) return hit;

            const color = pickAvoidingColor(key, colorPalette, used);
            used.push(color);
            extraAssignments[key] = color;
            return color;
        },
    };
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
