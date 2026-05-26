import { type ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import useQueryError from '../../../hooks/useQueryError';
import {
    type ChartTemplateDetail,
    type ChartTemplateListItem,
    getChartTemplate,
    getChartTemplates,
} from '../api/templatesApi';

export const useChartTemplates = (
    useQueryOptions?: UseQueryOptions<ChartTemplateListItem[], ApiError>,
) => {
    const setErrorResponse = useQueryError();

    return useQuery<ChartTemplateListItem[], ApiError>({
        queryKey: ['chart-templates'],
        queryFn: getChartTemplates,
        retry: false,
        onError: (result) => {
            setErrorResponse(result);
        },
        ...useQueryOptions,
    });
};

export const useChartTemplate = (
    templateId: string | undefined,
    useQueryOptions?: UseQueryOptions<ChartTemplateDetail, ApiError>,
) => {
    const setErrorResponse = useQueryError();

    return useQuery<ChartTemplateDetail, ApiError>({
        queryKey: ['chart-template', templateId],
        queryFn: () => getChartTemplate(templateId ?? ''),
        retry: false,
        onError: (result) => {
            setErrorResponse(result);
        },
        ...useQueryOptions,
        enabled: !!templateId && (useQueryOptions?.enabled ?? true),
    });
};
