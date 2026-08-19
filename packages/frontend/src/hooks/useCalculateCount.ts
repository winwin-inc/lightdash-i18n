import {
    type ApiCalculateCountResponse,
    type ApiError,
    type CalculateCountFromQuery,
    type DashboardFilters,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import {
    convertDateDashboardFilters,
    convertDateFilters,
} from '../utils/dateFilter';

type DashboardContextInput = {
    dashboardSlug?: string;
    dashboardName?: string;
};

const calculateCountFromQuery = async (
    projectUuid: string,
    metricQuery: MetricQuery,
    explore: string,
    parameters?: ParametersValuesMap,
    dashboardContext?: DashboardContextInput,
): Promise<ApiCalculateCountResponse['results']> => {
    const payload: CalculateCountFromQuery = {
        explore,
        metricQuery: {
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
        },
        parameters,
        dashboardSlug: dashboardContext?.dashboardSlug,
        dashboardName: dashboardContext?.dashboardName,
    };
    return lightdashApi<ApiCalculateCountResponse['results']>({
        url: `/projects/${projectUuid}/calculate-count`,
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

const calculateCountFromSavedChart = async (
    savedChartUuid: string,
    dashboardFilters?: DashboardFilters,
    invalidateCache?: boolean,
    parameters?: ParametersValuesMap,
    dashboardContext?: DashboardContextInput,
): Promise<ApiCalculateCountResponse['results']> => {
    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    return lightdashApi<ApiCalculateCountResponse['results']>({
        url: `/saved/${savedChartUuid}/calculate-count`,
        method: 'POST',
        body: JSON.stringify({
            dashboardFilters: timezoneFixFilters,
            invalidateCache,
            parameters,
            dashboardSlug: dashboardContext?.dashboardSlug,
            dashboardName: dashboardContext?.dashboardName,
        }),
    });
};

export const useCalculateCount = ({
    metricQuery,
    explore,
    savedChartUuid,
    dashboardFilters,
    invalidateCache,
    parameters,
    dashboardContext,
    enabled = true,
}: {
    metricQuery?: MetricQuery;
    explore?: string;
    savedChartUuid?: string;
    dashboardFilters?: DashboardFilters;
    invalidateCache?: boolean;
    parameters?: ParametersValuesMap;
    dashboardContext?: DashboardContextInput;
    enabled?: boolean;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const queryKey = savedChartUuid
        ? {
              savedChartUuid,
              dashboardFilters: JSON.stringify(dashboardFilters ?? null),
              invalidateCache,
              parameters,
          }
        : {
              filters: JSON.stringify(metricQuery?.filters ?? null),
              dimensions: metricQuery?.dimensions,
              metrics: metricQuery?.metrics,
              additionalMetrics: metricQuery?.additionalMetrics,
              tableCalculations: metricQuery?.tableCalculations,
              customDimensions: metricQuery?.customDimensions,
              parameters,
          };

    return useQuery<ApiCalculateCountResponse['results'], ApiError>({
        queryKey: ['calculate_count', projectUuid, queryKey],
        queryFn: () => {
            if (savedChartUuid) {
                return calculateCountFromSavedChart(
                    savedChartUuid,
                    dashboardFilters,
                    invalidateCache,
                    parameters,
                    dashboardContext,
                );
            }
            if (projectUuid && metricQuery && explore) {
                return calculateCountFromQuery(
                    projectUuid,
                    metricQuery,
                    explore,
                    parameters,
                    dashboardContext,
                );
            }
            return Promise.reject();
        },
        retry: false,
        enabled:
            enabled &&
            (savedChartUuid !== undefined ||
                (metricQuery !== undefined && explore !== undefined)),
        onError: (result) =>
            console.error(
                `Unable to calculate count from query: ${
                    result?.error?.message || result
                }`,
            ),
    });
};
