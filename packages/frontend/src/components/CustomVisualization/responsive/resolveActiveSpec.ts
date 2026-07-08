import { isEffectiveMobileSpec } from './isEffectiveMobileSpec';
import {
    DEFAULT_RESPONSIVE_BREAKPOINT,
    type LightdashResponsiveConfig,
    type VegaSpec,
} from './types';

export type ResponsivePreviewOverride = 'desktop' | 'mobile';

export type ActiveSpecResolution = {
    spec: VegaSpec;
    variant: 'desktop' | 'mobile';
};

export function resolveActiveSpec(
    desktopSpec: VegaSpec,
    responsiveConfig: LightdashResponsiveConfig | null,
    viewportWidth: number,
    previewOverride?: ResponsivePreviewOverride,
): ActiveSpecResolution {
    const mobile = responsiveConfig?.mobile ?? null;

    if (!isEffectiveMobileSpec(mobile)) {
        return { spec: desktopSpec, variant: 'desktop' };
    }

    if (previewOverride === 'mobile') {
        return { spec: mobile, variant: 'mobile' };
    }

    if (previewOverride === 'desktop') {
        return { spec: desktopSpec, variant: 'desktop' };
    }

    const breakpoint =
        responsiveConfig?.breakpoint ?? DEFAULT_RESPONSIVE_BREAKPOINT;

    if (viewportWidth < breakpoint) {
        return { spec: mobile, variant: 'mobile' };
    }

    return { spec: desktopSpec, variant: 'desktop' };
}
