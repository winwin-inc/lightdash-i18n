import { type AnyType } from '@lightdash/common';
import { lightdashApi } from '../../../api';

export type ChartTemplateListItem = {
    id: number;
    chart_type?: string;
    example_name?: string;
    data_url?: string;
    data_type?: string;
    cover_image_url?: string;
    is_enabled?: number;
    created_by?: string | null;
    updated_by?: string | null;
    created_at?: string;
    updated_at?: string;
};

export type ChartTemplateDetail = ChartTemplateListItem & {
    vega_config?: Record<string, unknown>;
};

export type GenerateChartTemplateCandidatesRequest = {
    fields: Array<{
        fieldId: string;
        label?: string;
        fieldKind?: 'dimension' | 'metric' | 'unknown';
        isSelected?: boolean;
    }>;
    selectedDimensions?: string[];
    selectedMetrics?: string[];
    userPrompt?: string;
    model?: string;
};

export type GeneratedChartTemplateCandidate = {
    strategy: 'primary' | 'secondary' | 'conservative';
    reasoning: string;
    spec: Record<string, unknown>;
    valid: boolean;
    errors: string[];
};

export type GenerateChartTemplateCandidatesResponse = {
    templateId: number;
    model: string;
    candidates: GeneratedChartTemplateCandidate[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const normalizeTemplateList = (response: unknown): ChartTemplateListItem[] => {
    if (Array.isArray(response)) {
        return response as ChartTemplateListItem[];
    }

    if (!isRecord(response)) {
        return [];
    }

    if (Array.isArray(response.data)) {
        return response.data as ChartTemplateListItem[];
    }

    if (isRecord(response.data) && Array.isArray(response.data.list)) {
        return response.data.list as ChartTemplateListItem[];
    }

    return [];
};

const normalizeTemplateDetail = (
    response: unknown,
): ChartTemplateDetail | null => {
    if (
        isRecord(response) &&
        isRecord(response.results) &&
        isRecord(response.results.data)
    ) {
        return response.results.data as ChartTemplateDetail;
    }

    if (
        isRecord(response) &&
        isRecord(response.data) &&
        isRecord(response.data.data)
    ) {
        return response.data.data as ChartTemplateDetail;
    }

    if (isRecord(response) && isRecord(response.data)) {
        return response.data as ChartTemplateDetail;
    }

    if (isRecord(response)) {
        return response as ChartTemplateDetail;
    }

    return null;
};

const normalizeGeneratedCandidates = (
    response: unknown,
): GenerateChartTemplateCandidatesResponse | null => {
    if (isRecord(response) && isRecord(response.results)) {
        return response.results as GenerateChartTemplateCandidatesResponse;
    }

    if (
        isRecord(response) &&
        isRecord(response.data) &&
        isRecord(response.data.results)
    ) {
        return response.data.results as GenerateChartTemplateCandidatesResponse;
    }

    if (isRecord(response) && Array.isArray(response.candidates)) {
        return response as GenerateChartTemplateCandidatesResponse;
    }

    return null;
};

export const getTemplateSpec = (
    template: ChartTemplateDetail | null | undefined,
): Record<string, unknown> | null => {
    if (!template?.vega_config || !isRecord(template.vega_config)) {
        return null;
    }

    const specCandidate = template.vega_config.spec;
    if (isRecord(specCandidate)) {
        return specCandidate;
    }

    return template.vega_config;
};

export const getChartTemplates = async (): Promise<ChartTemplateListItem[]> =>
    normalizeTemplateList(
        await lightdashApi<AnyType>({
            url: '/chart-templates',
            method: 'GET',
            body: undefined,
        }),
    );

export const getChartTemplate = async (
    templateId: string,
): Promise<ChartTemplateDetail | null> =>
    normalizeTemplateDetail(
        await lightdashApi<AnyType>({
            url: `/chart-templates/${encodeURIComponent(templateId)}`,
            method: 'GET',
            body: undefined,
        }),
    );

export const generateChartTemplateCandidates = async (
    templateId: string,
    payload: GenerateChartTemplateCandidatesRequest,
): Promise<GenerateChartTemplateCandidatesResponse | null> =>
    normalizeGeneratedCandidates(
        await lightdashApi<AnyType>({
            url: `/chart-templates/${encodeURIComponent(templateId)}/generate`,
            method: 'POST',
            body: JSON.stringify(payload),
        }),
    );
