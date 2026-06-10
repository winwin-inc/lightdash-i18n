import { DEFAULT_RESPONSIVE_BREAKPOINT, type VegaSpec } from './types';

export type ComposeCustomVisSpecInput = {
    desktop: VegaSpec;
    mobile: VegaSpec | null;
    breakpoint?: number;
    rewrite?: boolean;
};

export function composeCustomVisSpec({
    desktop,
    mobile,
    breakpoint = DEFAULT_RESPONSIVE_BREAKPOINT,
    rewrite = false,
}: ComposeCustomVisSpecInput): VegaSpec {
    const {
        lightdash: _lightdash,
        rewrite: _rewrite,
        ...desktopRest
    } = desktop;
    const shouldRewrite = rewrite || desktop.rewrite === true;

    const base: VegaSpec = shouldRewrite
        ? { ...desktopRest, rewrite: true }
        : { ...desktopRest };

    if (mobile === null) {
        return base;
    }

    return {
        ...base,
        lightdash: {
            responsive: {
                breakpoint,
                mobile,
            },
        },
    };
}
