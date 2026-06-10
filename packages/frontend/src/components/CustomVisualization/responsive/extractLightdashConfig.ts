import { isEffectiveMobileSpec } from './isEffectiveMobileSpec';
import {
    DEFAULT_RESPONSIVE_BREAKPOINT,
    type LightdashResponsiveConfig,
    type VegaSpec,
} from './types';

export type ExtractedLightdashConfig = {
    desktopSpec: VegaSpec;
    responsiveConfig: LightdashResponsiveConfig | null;
};

export function extractLightdashConfig(
    spec: VegaSpec,
): ExtractedLightdashConfig {
    const lightdash = spec.lightdash;
    const { lightdash: _lightdash, ...desktopSpec } = spec;

    if (
        lightdash === undefined ||
        typeof lightdash !== 'object' ||
        lightdash === null
    ) {
        return { desktopSpec: spec, responsiveConfig: null };
    }

    const responsive = (lightdash as VegaSpec).responsive;
    if (
        responsive === undefined ||
        typeof responsive !== 'object' ||
        responsive === null
    ) {
        return { desktopSpec, responsiveConfig: null };
    }

    const responsiveRaw = responsive as VegaSpec;
    const breakpoint =
        typeof responsiveRaw.breakpoint === 'number' &&
        responsiveRaw.breakpoint > 0
            ? responsiveRaw.breakpoint
            : DEFAULT_RESPONSIVE_BREAKPOINT;

    const mobileCandidate =
        responsiveRaw.mobile !== undefined &&
        typeof responsiveRaw.mobile === 'object' &&
        responsiveRaw.mobile !== null
            ? (responsiveRaw.mobile as VegaSpec)
            : null;

    if (!isEffectiveMobileSpec(mobileCandidate)) {
        return { desktopSpec, responsiveConfig: null };
    }

    return {
        desktopSpec,
        responsiveConfig: { breakpoint, mobile: mobileCandidate },
    };
}
