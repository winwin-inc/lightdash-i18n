import { type ApiError } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseQueryOptions,
} from '@tanstack/react-query';
import useQueryError from '../../../hooks/useQueryError';
import {
    generateChartTemplateCandidates,
    getChartTemplate,
    getChartTemplates,
    type ChartTemplateDetail,
    type ChartTemplateListItem,
    type GenerateChartTemplateCandidatesRequest,
    type GenerateChartTemplateCandidatesResponse,
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
    useQueryOptions?: UseQueryOptions<ChartTemplateDetail | null, ApiError>,
) => {
    const setErrorResponse = useQueryError();

    return useQuery<ChartTemplateDetail | null, ApiError>({
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

export const useGenerateChartTemplateCandidates = () => {
    const setErrorResponse = useQueryError();

    return useMutation<
        GenerateChartTemplateCandidatesResponse | null,
        ApiError,
        { templateId: string; payload: GenerateChartTemplateCandidatesRequest }
    >({
        mutationKey: ['generate-chart-template-candidates'],
        mutationFn: ({ templateId, payload }) =>
            generateChartTemplateCandidates(templateId, payload),
        onError: (result) => {
            setErrorResponse(result);
        },
    });
};
