import { useMantineTheme } from '@mantine/core';
import { useCallback, useContext } from 'react';
import { ASSIGNMENT_IDX_KEY } from './constants';
import { ChartColorMappingContext } from './context';
import {
    hexToHSL,
    hslToHex,
    resolveSyncedHashColor,
} from './hashColorAssignment';
import { type ChartColorMappingContextProps, type SeriesLike } from './types';
import { calculateSeriesLikeIdentifier } from './utils';

export { getHashColor } from './hashColorAssignment';

/**
 * Get a color from the palette, generating new colors beyond palette size.
 * Uses hue rotation (30°) with saturation/lightness adjustments for harmonious colors.
 */
const getColorFromPalette = (index: number, colorPalette: string[]): string => {
    if (!colorPalette || colorPalette.length === 0) {
        return '#868e96';
    }

    if (index < colorPalette.length) {
        return colorPalette[index];
    }

    const baseColorIndex = index % colorPalette.length;
    const baseColor = colorPalette[baseColorIndex];
    const rotationCycles = Math.floor(index / colorPalette.length);
    const hueRotation = rotationCycles * 30;
    const saturationAdjustment = Math.sin(rotationCycles * Math.PI * 0.5) * 15;
    const lightnessAdjustment = Math.sin(rotationCycles * Math.PI * 0.3) * 10;

    const { h, s, l } = hexToHSL(baseColor);
    const newH = (h + hueRotation) % 360;
    const newS = Math.max(0.4, Math.min(1.0, s + saturationAdjustment / 100));
    const newL = Math.max(0.3, Math.min(0.8, l + lightnessAdjustment / 100));

    return hslToHex(newH, newS, newL);
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
    hashAssignments = {},
}: {
    colorPalette: string[];
    /** 当为 true 时，使用哈希分配颜色，相同 identifier 获得相同颜色 */
    useHashBased?: boolean;
    /** 看板已知系列名的确定性哈希色，筛选新系列只避让这些槽 */
    hashAssignments?: Record<string, string>;
}) => {
    const theme = useMantineTheme();
    const { colorMappings } = useChartColorMappingContext();

    const calculateKeyColorAssignment = useCallback(
        (group: string, identifier: string) => {
            if (!identifier || identifier === 'null') {
                return theme.colors.gray[6];
            }

            if (useHashBased) {
                return resolveSyncedHashColor(
                    identifier,
                    colorPalette,
                    hashAssignments,
                );
            }

            let groupMappings = colorMappings.get(group);

            if (groupMappings && groupMappings.has(identifier)) {
                const colorIndex = groupMappings.get(identifier)!;
                return getColorFromPalette(colorIndex, colorPalette);
            }

            if (!groupMappings) {
                groupMappings = new Map<string, number>();
                colorMappings.set(group, groupMappings);
            }

            const currentIdx = groupMappings.get(ASSIGNMENT_IDX_KEY) ?? -1;
            const nextIdx = currentIdx + 1;
            const colorHex = getColorFromPalette(nextIdx, colorPalette);

            groupMappings.set(ASSIGNMENT_IDX_KEY, nextIdx);
            groupMappings.set(identifier, nextIdx);

            return colorHex;
        },
        [colorPalette, colorMappings, hashAssignments, theme, useHashBased],
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
