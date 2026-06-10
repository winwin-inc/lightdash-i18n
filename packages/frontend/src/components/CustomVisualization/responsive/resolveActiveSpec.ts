import { isCompositeVegaSpec } from '../normalizeVegaSpecSizing';
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

let compositeResponsiveWarned = false;

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

    if (isCompositeVegaSpec(desktopSpec)) {
        if (import.meta.env.DEV && !compositeResponsiveWarned) {
            compositeResponsiveWarned = true;
            console.warn(
                '[CustomViz responsive] Composite spec ignores lightdash.responsive.mobile',
            );
        }
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

/** 测试用：重置 composite 警告单次标记 */
export function resetCompositeResponsiveWarnedForTests(): void {
    compositeResponsiveWarned = false;
}
