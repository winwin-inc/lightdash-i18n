import { UnexpectedServerError } from '@lightdash/common';
import type { Response } from 'node-fetch';
import fetch from 'node-fetch';
import { LightdashConfig } from '../../config/parseConfig';

export type ChartTemplateListItem = Record<string, unknown>;
export type ChartTemplateDetail = Record<string, unknown>;
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
export type GenerateChartTemplateCandidatesResponse = {
    success: boolean;
    data: {
        templateId: number;
        model: string;
        renderable: boolean;
        usedFallback: boolean;
        compatibility: {
            isReasonable: boolean;
            level: string;
            reasons: string[];
            suggestions: string[];
        };
        selectionMeta?: {
            chosenDimensions?: string[];
            chosenMetrics?: string[];
            ignoredDimensions?: string[];
            ignoredMetrics?: string[];
            mappingConfidence?: 'high' | 'medium' | 'low';
            usedAiFallback?: boolean;
            ambiguityReasons?: string[];
        };
        candidates: Array<{
            strategy: 'primary' | 'secondary' | 'conservative';
            reasoning: string;
            spec: Record<string, unknown>;
            valid: boolean;
            errors: string[];
            fieldMapping?: Record<string, string>;
        }>;
    };
};

export class ChartTemplateClient {
    private readonly config: LightdashConfig;

    private static readonly GENERATE_TIMEOUT_MS = 30000;

    constructor(config: LightdashConfig) {
        this.config = config;
    }

    private getBaseUrl() {
        return this.config.adminNest.baseUrl.replace(/\/+$/, '');
    }

    private async request<T>(
        path: string,
        options?: {
            method?: 'GET' | 'POST';
            body?: Record<string, unknown>;
            timeoutMs?: number;
        },
    ): Promise<T> {
        const timeoutMs = options?.timeoutMs ?? this.config.adminNest.timeoutMs;
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(
                    new UnexpectedServerError(
                        `Admin nest request timed out after ${timeoutMs}ms`,
                    ),
                );
            }, timeoutMs);
        });

        const response = (await Promise.race([
            fetch(`${this.getBaseUrl()}${path}`, {
                method: options?.method || 'GET',
                headers: {
                    Accept: 'application/json',
                    ...(options?.body
                        ? {
                              'Content-Type': 'application/json',
                          }
                        : {}),
                },
                ...(options?.body
                    ? {
                          body: JSON.stringify(options.body),
                      }
                    : {}),
            }),
            timeoutPromise,
        ])) as Response;

        if (!response.ok) {
            const responseBody = await response.text();
            throw new UnexpectedServerError(
                `Admin nest request failed with status ${response.status}: ${
                    responseBody || '(empty body)'
                }`,
            );
        }

        return (await response.json()) as T;
    }

    async getTemplates(): Promise<ChartTemplateListItem[]> {
        return this.request<ChartTemplateListItem[]>(
            '/api/nest/chart-library/lightdash/templates',
        );
    }

    async getTemplateById(templateId: string): Promise<ChartTemplateDetail> {
        return this.request<ChartTemplateDetail>(
            `/api/nest/chart-library/lightdash/templates/${encodeURIComponent(
                templateId,
            )}`,
        );
    }

    async generateTemplateCandidates(
        templateId: string,
        payload: GenerateChartTemplateCandidatesRequest,
    ): Promise<GenerateChartTemplateCandidatesResponse> {
        return this.request<GenerateChartTemplateCandidatesResponse>(
            `/api/nest/chart-library/lightdash/templates/${encodeURIComponent(
                templateId,
            )}/generate`,
            {
                method: 'POST',
                body: payload,
                timeoutMs: ChartTemplateClient.GENERATE_TIMEOUT_MS,
            },
        );
    }
}
