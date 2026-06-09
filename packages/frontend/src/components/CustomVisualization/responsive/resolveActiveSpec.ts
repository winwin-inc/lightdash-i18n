import { isCompositeVegaSpec } from '../normalizeVegaSpecSizing';
import type { LightdashResponsiveConfig, VegaSpec } from './types';

export type ActiveSpecResolution = {
    spec: VegaSpec;
    variant: 'desktop' | 'mobile';
};

let compositeResponsiveWarned = false;

export function resolveActiveSpec(
    desktopSpec: VegaSpec,
    responsiveConfig: LightdashResponsiveConfig | null,
    containerWidth: number,
): ActiveSpecResolution {
    if (responsiveConfig?.mobile === null || !responsiveConfig?.mobile) {
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

    if (containerWidth < responsiveConfig.breakpoint) {
        return { spec: responsiveConfig.mobile, variant: 'mobile' };
    }

    return { spec: desktopSpec, variant: 'desktop' };
}

/** 测试用：重置 composite 警告单次标记 */
export function resetCompositeResponsiveWarnedForTests(): void {
    compositeResponsiveWarned = false;
}
