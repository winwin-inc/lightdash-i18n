import type { CategoryItem, CategoryRpcResponse } from '@lightdash/common';
import { MissingConfigError, UnexpectedServerError } from '@lightdash/common';
import fetch from 'node-fetch';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';

export class CategoryRpcClient {
    private readonly config: LightdashConfig;

    private readonly logger: typeof Logger;

    constructor(config: LightdashConfig) {
        this.config = config;
        this.logger = Logger.child({ serviceName: 'CategoryRpcClient' });
    }

    /**
     * 调用 RPC 接口获取所有类目
     */
    async findAllCategories(): Promise<CategoryItem[]> {
        const { host, apiKey } = this.config.adminApi || {};

        if (!host) {
            throw new MissingConfigError(
                'ADMIN_API_HOST environment variable is not set',
            );
        }

        if (!apiKey) {
            throw new MissingConfigError(
                'ADMIN_API_KEY environment variable is not set',
            );
        }

        const url = host.endsWith('/') ? host.slice(0, -1) : host;

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (apiKey) {
                headers['apikey'] = apiKey;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    method: 'kdb.category.CategoryObj.findCategoryAllByVersion',
                    id: 0,
                    params: [{}, ''],
                }),
            });

            if (!response.ok) {
                this.logger.error(
                    `Failed to fetch categories: ${response.status} ${response.statusText}`,
                );
                throw new UnexpectedServerError(
                    `Failed to fetch categories: ${response.status}`,
                );
            }

            const data = (await response.json()) as CategoryRpcResponse;

            if (data.jsonrpc !== '2.0' || !data.result) {
                this.logger.error(
                    `Invalid RPC response format: ${JSON.stringify(data)}`,
                );
                throw new UnexpectedServerError('Invalid RPC response format');
            }

            return data.result;
        } catch (error) {
            this.logger.error(
                `Error fetching categories: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error instanceof Error
                ? error
                : new UnexpectedServerError('Failed to fetch categories');
        }
    }
}
