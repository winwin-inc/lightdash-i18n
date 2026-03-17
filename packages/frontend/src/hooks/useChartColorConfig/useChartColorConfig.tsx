import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
import { ASSIGNMENT_IDX_KEY } from './constants';
import { ChartColorMappingContext } from './context';
import { type ChartColorMappingContextProps, type SeriesLike } from './types';
import { calculateSeriesLikeIdentifier } from './utils';

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

const rotateHue = (hexColor: string, degrees: number): string => {
    const { h, s, l } = hexToHSL(hexColor);
    const newH = (h + degrees) % 360;
    return hslToHex(newH, s, l);
};

/**
 * Get a color from the palette, generating new colors beyond palette size.
 * Uses hue rotation with golden angle (137.5°) for optimal color distribution.
 */
const getColorFromPalette = (index: number, colorPalette: string[]): string => {
    // If index is within palette range, return the original color
    if (index < colorPalette.length) {
        return colorPalette[index];
    }

    // Beyond palette range, generate new colors using hue rotation
    const baseColorIndex = index % colorPalette.length;
    const baseColor = colorPalette[baseColorIndex];
    const rotationCycles = Math.floor(index / colorPalette.length);
    const hueRotation = rotationCycles * 137.5; // Golden angle

    return rotateHue(baseColor, hueRotation);
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
}: {
    colorPalette: string[];
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
        [colorPalette, colorMappings, theme],
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
