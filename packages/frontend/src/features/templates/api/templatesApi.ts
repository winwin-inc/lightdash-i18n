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
    fieldMapping?: Record<string, string>;
};

export type GeneratedTemplateCompatibility = {
    isReasonable: boolean;
    level: string;
    reasons: string[];
    suggestions: string[];
};

export type GenerateChartTemplateCandidatesResponse = {
    templateId: number;
    model: string;
    renderable: boolean;
    usedFallback: boolean;
    compatibility: GeneratedTemplateCompatibility;
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
    const normalizeCompatibility = (
        input: unknown,
    ): GeneratedTemplateCompatibility => {
        if (!isRecord(input)) {
            return {
                isReasonable: false,
                level: 'warning',
                reasons: [],
                suggestions: [],
            };
        }

        return {
            isReasonable: Boolean(input.isReasonable),
            level:
                typeof input.level === 'string' && input.level.trim().length > 0
                    ? input.level
                    : 'warning',
            reasons: Array.isArray(input.reasons)
                ? input.reasons.filter(
                      (reason): reason is string => typeof reason === 'string',
                  )
                : [],
            suggestions: Array.isArray(input.suggestions)
                ? input.suggestions.filter(
                      (suggestion): suggestion is string =>
                          typeof suggestion === 'string',
                  )
                : [],
        };
    };

    const normalizeCandidates = (
        input: unknown,
    ): GeneratedChartTemplateCandidate[] =>
        Array.isArray(input)
            ? input
                  .filter((candidate): candidate is Record<string, unknown> =>
                      isRecord(candidate),
                  )
                  .map((candidate) => ({
                      strategy:
                          candidate.strategy === 'secondary' ||
                          candidate.strategy === 'conservative'
                              ? candidate.strategy
                              : 'primary',
                      reasoning:
                          typeof candidate.reasoning === 'string'
                              ? candidate.reasoning
                              : '',
                      spec: isRecord(candidate.spec) ? candidate.spec : {},
                      valid: Boolean(candidate.valid),
                      errors: Array.isArray(candidate.errors)
                          ? candidate.errors.filter(
                                (error): error is string =>
                                    typeof error === 'string',
                            )
                          : [],
                      fieldMapping: isRecord(candidate.fieldMapping)
                          ? (candidate.fieldMapping as Record<string, string>)
                          : undefined,
                  }))
            : [];

    const normalizeGenerateData = (
        value: unknown,
    ): GenerateChartTemplateCandidatesResponse | null => {
        if (!isRecord(value)) {
            return null;
        }

        const candidates = normalizeCandidates(value.candidates);
        const renderable =
            typeof value.renderable === 'boolean'
                ? value.renderable
                : candidates.length > 0;

        return {
            templateId:
                typeof value.templateId === 'number' ? value.templateId : -1,
            model: typeof value.model === 'string' ? value.model : '',
            renderable,
            usedFallback: Boolean(value.usedFallback),
            compatibility: normalizeCompatibility(value.compatibility),
            candidates,
        };
    };

    if (
        isRecord(response) &&
        typeof response.success === 'boolean' &&
        isRecord(response.data)
    ) {
        return normalizeGenerateData(response.data);
    }

    if (isRecord(response) && isRecord(response.results)) {
        return normalizeGenerateData(response.results);
    }

    if (
        isRecord(response) &&
        isRecord(response.data) &&
        isRecord(response.data.results)
    ) {
        return normalizeGenerateData(response.data.results);
    }

    if (isRecord(response) && isRecord(response.data)) {
        const normalized = normalizeGenerateData(response.data);
        if (normalized) {
            return normalized;
        }
    }

    if (isRecord(response) && Array.isArray(response.candidates)) {
        return normalizeGenerateData(response);
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
