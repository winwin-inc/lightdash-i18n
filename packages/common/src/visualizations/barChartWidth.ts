export type BarMaxWidthConfig = {
    barMaxWidth?: number;
    barMaxWidthMobile?: number;
};

export const resolveBarMaxWidth = (
    config: BarMaxWidthConfig | undefined,
    isMobile: boolean,
): number | undefined => {
    if (!config) return undefined;
    if (isMobile && config.barMaxWidthMobile != null) {
        return config.barMaxWidthMobile;
    }
    return config.barMaxWidth;
};

export const applyBarMaxWidthToEchartsSpec = <
    T extends Record<string, unknown>,
>(
    spec: T,
    barMaxWidth: number | undefined,
): T => {
    if (!Array.isArray(spec.series)) return spec;

    return {
        ...spec,
        series: spec.series.map(
            (series: { type?: string; barMaxWidth?: number }) => {
                if (series.type !== 'bar') return series;
                if (barMaxWidth == null) {
                    if (series.barMaxWidth === undefined) return series;
                    const rest = { ...series };
                    delete rest.barMaxWidth;
                    return rest;
                }
                return { ...series, barMaxWidth };
            },
        ),
    };
};
