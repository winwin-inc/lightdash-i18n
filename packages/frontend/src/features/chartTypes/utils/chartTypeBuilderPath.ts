// STUB: chart-types gallery not ported — path kept for AppGenerate links.
export const chartTypeBuilderPath = (
    projectUuid: string,
    dataAppVizUuid: string | null = null,
) => `/projects/${projectUuid}/chart-types/${dataAppVizUuid ?? 'new'}`;
