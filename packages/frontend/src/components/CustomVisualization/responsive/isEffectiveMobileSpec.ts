import type { VegaSpec } from './types';

/** 是否有可用的 mobile spec（空对象不算配置） */
export function isEffectiveMobileSpec(
    mobile: VegaSpec | null | undefined,
): mobile is VegaSpec {
    return (
        mobile !== null &&
        mobile !== undefined &&
        typeof mobile === 'object' &&
        Object.keys(mobile).length > 0
    );
}
