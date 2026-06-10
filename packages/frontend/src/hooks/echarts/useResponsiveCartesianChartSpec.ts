import {
    applyResponsiveCartesianSpec,
    type BarMaxWidthConfig,
} from '@lightdash/common';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo } from 'react';

const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

export const useResponsiveCartesianChartSpec = <
    T extends Record<string, unknown>,
>(
    spec: T | undefined,
    barMaxWidthConfig: BarMaxWidthConfig | undefined,
): T | undefined => {
    const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

    return useMemo(() => {
        if (!spec) return spec;
        return applyResponsiveCartesianSpec(spec, {
            isMobile: !!isMobile,
            barMaxWidthConfig,
        });
    }, [spec, barMaxWidthConfig, isMobile]);
};
