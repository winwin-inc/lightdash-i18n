import { UnexpectedServerError } from '@lightdash/common';
import type { Response } from 'node-fetch';
import fetch from 'node-fetch';
import { LightdashConfig } from '../../config/parseConfig';

export type ChartTemplateListItem = Record<string, unknown>;
export type ChartTemplateDetail = Record<string, unknown>;

export class ChartTemplateClient {
    private readonly config: LightdashConfig;

    constructor(config: LightdashConfig) {
        this.config = config;
    }

    private getBaseUrl() {
        return this.config.adminNest.baseUrl.replace(/\/+$/, '');
    }

    private async request<T>(path: string): Promise<T> {
        const { timeoutMs } = this.config.adminNest;
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
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
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
}
