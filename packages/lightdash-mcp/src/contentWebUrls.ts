/**
 * 基于 LIGHTDASH_SITE_URL 与前端路由约定，为内容项生成可在浏览器打开的 URL（MCP 侧拼接）。
 */

export type WebPathTemplates = {
    dashboard: string;
    chart: string;
    space: string;
};

export const DEFAULT_WEB_PATH_TEMPLATES: WebPathTemplates = {
    dashboard: '/projects/{projectUuid}/dashboards/{uuid}/view',
    chart: '/projects/{projectUuid}/saved/{uuid}',
    space: '/projects/{projectUuid}/spaces/{uuid}',
};

function trimSlash(s: string): string {
    return s.replace(/\/$/, '');
}

function interpolate(
    template: string,
    vars: { projectUuid: string; uuid: string; slug: string },
): string {
    return template
        .replaceAll('{projectUuid}', encodeURIComponent(vars.projectUuid))
        .replaceAll('{uuid}', encodeURIComponent(vars.uuid))
        .replaceAll('{slug}', encodeURIComponent(vars.slug));
}

export function joinSiteUrl(siteBaseUrl: string, path: string): string {
    const base = trimSlash(siteBaseUrl);
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
}

type ContentLike = {
    contentType?: string;
    uuid?: string;
    slug?: string;
    project?: { uuid?: string };
};

function webUrlForContentItem(
    siteBaseUrl: string,
    templates: WebPathTemplates,
    item: ContentLike,
): string | undefined {
    const projectUuid = item.project?.uuid;
    const uuid = item.uuid;
    const slug = typeof item.slug === 'string' ? item.slug : '';
    if (!projectUuid || !uuid || !item.contentType) return undefined;

    let path: string | undefined;
    switch (item.contentType) {
        case 'dashboard':
            path = interpolate(templates.dashboard, {
                projectUuid,
                uuid,
                slug,
            });
            break;
        case 'chart':
            path = interpolate(templates.chart, {
                projectUuid,
                uuid,
                slug,
            });
            break;
        case 'space':
            path = interpolate(templates.space, {
                projectUuid,
                uuid,
                slug,
            });
            break;
        default:
            return undefined;
    }
    return joinSiteUrl(siteBaseUrl, path);
}

export function enrichContentSearchResults(
    siteBaseUrl: string,
    templates: WebPathTemplates,
    raw: unknown,
): unknown {
    if (!raw || typeof raw !== 'object') return raw;
    const obj = raw as Record<string, unknown>;
    const data = obj.data;
    if (!Array.isArray(data)) return raw;

    const enriched = data.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const item = row as ContentLike;
        const webUrl = webUrlForContentItem(siteBaseUrl, templates, item);
        if (!webUrl) return row;
        return { ...item, webUrl };
    });

    return {
        ...obj,
        siteBaseUrl,
        data: enriched,
    };
}

export function enrichSavedChartResult(
    siteBaseUrl: string,
    chartTemplate: string,
    raw: unknown,
): unknown {
    if (!raw || typeof raw !== 'object') return raw;

    const tryChart = (chart: Record<string, unknown>): unknown => {
        const projectUuid = chart.projectUuid;
        const uuid = chart.uuid;
        if (
            typeof projectUuid !== 'string' ||
            typeof uuid !== 'string' ||
            !projectUuid ||
            !uuid
        ) {
            return raw;
        }
        const slug = typeof chart.slug === 'string' ? chart.slug : '';
        const path = interpolate(chartTemplate, {
            projectUuid,
            uuid,
            slug,
        });
        const webUrl = joinSiteUrl(siteBaseUrl, path);
        return { ...(raw as object), siteBaseUrl, webUrl };
    };

    const top = raw as Record<string, unknown>;
    if (top.chart && typeof top.chart === 'object') {
        return tryChart(top.chart as Record<string, unknown>);
    }
    if (typeof top.projectUuid === 'string' && typeof top.uuid === 'string') {
        return tryChart(top);
    }
    return raw;
}
