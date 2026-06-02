import type { RequestJsonFn } from './types';

export function createEndpointMethods(requestJson: RequestJsonFn) {
    async function listExplores(
        apiKey: string,
        projectUuid: string,
        filtered: boolean,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${ 
                encodeURIComponent(projectUuid) 
                }/explores?filtered=${ 
                filtered ? 'true' : 'false'}`,
        );
        return json.results ?? json;
    }

    async function getExplore(
        apiKey: string,
        projectUuid: string,
        exploreId: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${ 
                encodeURIComponent(projectUuid) 
                }/explores/${ 
                encodeURIComponent(exploreId)}`,
        );
        return json.results ?? json;
    }

    async function listProjects(apiKey: string): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v1/org/projects',
        );
        return json.results ?? json;
    }

    async function listSpaces(
        apiKey: string,
        projectUuid: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${ 
                encodeURIComponent(projectUuid) 
                }/spaces`,
        );
        return json.results ?? json;
    }

    async function searchContent(
        apiKey: string,
        projectUuid: string,
        options: {
            search?: string;
            contentTypes?: string[];
            spaceUuids?: string[];
            page?: number;
            pageSize?: number;
        },
    ): Promise<unknown> {
        const params = new URLSearchParams();
        if (options.search) params.set('search', options.search);
        if (options.contentTypes?.length) {
            options.contentTypes.forEach((t) => params.append('contentTypes', t));
        }
        if (options.spaceUuids?.length) {
            options.spaceUuids.forEach((id) => params.append('spaceUuids', id));
        }
        if (options.page) params.set('page', String(options.page));
        if (options.pageSize) params.set('pageSize', String(options.pageSize));
        params.set('projectUuids', projectUuid);

        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v2/content?${  params.toString()}`,
        );
        return json.results ?? json;
    }

    async function getSavedChart(
        apiKey: string,
        chartUuid: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/saved/${  encodeURIComponent(chartUuid)}`,
        );
        return json.results ?? json;
    }

    async function getHealth(apiKey: string): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            '/api/v1/health',
        );
        return json.results ?? json;
    }

    async function getProject(
        apiKey: string,
        projectUuid: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${  encodeURIComponent(projectUuid)}`,
        );
        return json.results ?? json;
    }

    async function getDashboard(
        apiKey: string,
        dashboardUuidOrSlug: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/dashboards/${encodeURIComponent(dashboardUuidOrSlug)}`,
        );
        return json.results ?? json;
    }

    async function getCatalog(
        apiKey: string,
        projectUuid: string,
        query: { search?: string; type?: 'table' | 'field'; catalogTags?: string[] },
    ): Promise<unknown> {
        const params = new URLSearchParams();
        if (query.search) params.set('search', query.search);
        if (query.type) params.set('type', query.type);
        if (query.catalogTags?.length) {
            query.catalogTags.forEach((t) => params.append('catalogTags', t));
        }
        const q = params.toString();
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${ 
                encodeURIComponent(projectUuid) 
                }/dataCatalog${ 
                q ? `?${  q}` : ''}`,
        );
        return json.results ?? json;
    }

    async function searchFieldUniqueValues(
        apiKey: string,
        projectUuid: string,
        args: {
            table: string;
            fieldId: string;
            search: string;
            limit?: number;
            filters?: unknown;
            forceRefresh?: boolean;
            parameters?: Record<string, unknown>;
            dashboardSlug?: string;
            dashboardName?: string;
        },
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${encodeURIComponent(
                projectUuid,
            )}/field/${encodeURIComponent(args.fieldId)}/search`,
            {
                method: 'POST',
                body: JSON.stringify({
                    table: args.table,
                    search: args.search,
                    limit: args.limit ?? 100,
                    filters: args.filters,
                    forceRefresh: args.forceRefresh,
                    parameters: args.parameters,
                    dashboardSlug: args.dashboardSlug,
                    dashboardName: args.dashboardName,
                }),
            },
        );
        return json.results ?? json;
    }

    async function listVerifiedContent(
        apiKey: string,
        projectUuid: string,
    ): Promise<unknown> {
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${ 
                encodeURIComponent(projectUuid) 
                }/content-verification`,
        );
        return json.results ?? json;
    }

    async function getDashboardsAsCode(
        apiKey: string,
        projectUuid: string,
        options?: {
            ids?: string[];
            offset?: number;
            languageMap?: boolean;
        },
    ): Promise<unknown> {
        const params = new URLSearchParams();
        if (options?.ids && options.ids.length > 0) {
            options.ids.forEach((id) => params.append('ids', id));
        }
        if (typeof options?.offset === 'number') {
            params.set('offset', String(options.offset));
        }
        if (typeof options?.languageMap === 'boolean') {
            params.set('languageMap', options.languageMap ? 'true' : 'false');
        }
        const query = params.toString();
        const json = await requestJson<{ results?: unknown }>(
            apiKey,
            `/api/v1/projects/${encodeURIComponent(
                projectUuid,
            )}/dashboards/code${query ? `?${query}` : ''}`,
        );
        return json.results ?? json;
    }

    return {
        listExplores,
        getExplore,
        listProjects,
        listSpaces,
        searchContent,
        getSavedChart,
        getHealth,
        getProject,
        getDashboard,
        getCatalog,
        searchFieldUniqueValues,
        listVerifiedContent,
        getDashboardsAsCode,
    };
}
