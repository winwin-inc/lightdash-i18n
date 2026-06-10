import { extractLightdashConfig } from './extractLightdashConfig';
import { DEFAULT_RESPONSIVE_BREAKPOINT, type VegaSpec } from './types';

export type DecomposedCustomVisSpec = {
    desktop: VegaSpec;
    mobile: VegaSpec | null;
    breakpoint: number;
    rewrite: boolean;
};

export function decomposeCustomVisSpec(
    spec: VegaSpec,
): DecomposedCustomVisSpec {
    const rewrite = spec.rewrite === true;
    const { desktopSpec, responsiveConfig } = extractLightdashConfig(spec);
    const { rewrite: _rewrite, ...desktopWithoutRewrite } = desktopSpec;

    if (!responsiveConfig?.mobile) {
        return {
            desktop: desktopWithoutRewrite,
            mobile: null,
            breakpoint: DEFAULT_RESPONSIVE_BREAKPOINT,
            rewrite,
        };
    }

    return {
        desktop: desktopWithoutRewrite,
        mobile: responsiveConfig.mobile,
        breakpoint: responsiveConfig.breakpoint,
        rewrite,
    };
}
