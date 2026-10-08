import type { DashboardAsCode, DashboardTab } from '@lightdash/common';
import type { RequestHandler } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';

export const restoreDashboardTabFilters = (
    dashboard: DashboardAsCode,
    rawBody: Partial<DashboardAsCode> & {
        tabs?: Array<Partial<DashboardTab> & { slug?: string }>;
    },
): DashboardAsCode => ({
    ...dashboard,
    description: dashboard.description ?? undefined,
    tabs:
        rawBody.tabs?.map((rawTab, index) => {
            const parsedTab = dashboard.tabs?.[index];
            const parsedSlug = (parsedTab as { slug?: string } | undefined)
                ?.slug;
            const rawSlug = (rawTab as { slug?: string }).slug;
            return {
                uuid: parsedTab?.uuid || rawTab.uuid || '',
                name: parsedTab?.name || rawTab.name || '',
                order: parsedTab?.order ?? rawTab.order ?? index,
                hidden: parsedTab?.hidden ?? rawTab.hidden,
                slug: parsedSlug || rawSlug,
                filters: rawTab.filters || parsedTab?.filters,
            };
        }) || dashboard.tabs,
});

export const CODE_READ_MIDDLEWARES: RequestHandler[] = [
    allowApiKeyAuthentication,
    isAuthenticated,
];

export const CODE_WRITE_MIDDLEWARES: RequestHandler[] = [
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
];

export const codeSuccess = <Results>(
    results: Results,
): { status: 'ok'; results: Results } => ({ status: 'ok', results });
