import type { CSSProperties } from 'react';

export type VegaSpec = Record<string, unknown>;

export type ResponsiveLayoutVariant = 'desktop' | 'mobile';

export type LightdashResponsiveConfig = {
    breakpoint: number;
    mobile: VegaSpec | null;
};

export type ResponsiveLayout = {
    layoutId: ResponsiveLayoutVariant;
    variant: ResponsiveLayoutVariant;
    useStepHeight: boolean;
    /** Discrete band width (width.step / x.scale.rangeStep) — natural width + optional H-scroll */
    useStepWidth: boolean;
    useAutosizeNone: boolean;
    chartSize: { width: number; height: number };
    containerStyle: CSSProperties;
    vegaStyle: { width: number; height: number };
};

export const DEFAULT_RESPONSIVE_BREAKPOINT = 768;
