import type {
    CategoryItem,
    CategoryRpcResponse,
    DashboardByMobileItem,
    DashboardByMobileRpcResponse,
} from '@lightdash/common';
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
                headers.apikey = apiKey;
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

            this.logger.info(
                `categories: ${JSON.stringify(
                    data.result.slice(0, 10),
                )}, size: ${data.result.length}`,
            );

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

    /**
     * 通过手机号查询用户有权限的看板列表
     * @param mobile 手机号（从邮箱中提取，去掉 @ 后面的部分）
     */
    async findAllDashboardByMobile(
        mobile: string,
    ): Promise<DashboardByMobileItem[]> {
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
                headers.apikey = apiKey;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    method: 'winwin.report.ReportObj.findAllDashboardByMobile',
                    id: 0,
                    params: [mobile],
                }),
            });

            if (!response.ok) {
                this.logger.error(
                    `Failed to fetch dashboards by mobile: ${response.status} ${response.statusText}`,
                );
                throw new UnexpectedServerError(
                    `Failed to fetch dashboards by mobile: ${response.status}`,
                );
            }

            const data =
                (await response.json()) as DashboardByMobileRpcResponse;

            if (data.jsonrpc !== '2.0' || !data.result) {
                this.logger.error(
                    `Invalid RPC response format: ${JSON.stringify(data)}`,
                );
                throw new UnexpectedServerError('Invalid RPC response format');
            }

            this.logger.info(
                `dashboards by mobile: ${JSON.stringify(data.result)}`,
            );

            return data.result;
        } catch (error) {
            this.logger.error(
                `Error fetching dashboards by mobile: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error instanceof Error
                ? error
                : new UnexpectedServerError(
                      'Failed to fetch dashboards by mobile',
                  );
        }
    }
}
