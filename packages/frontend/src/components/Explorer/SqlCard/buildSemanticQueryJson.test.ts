import { buildSemanticQueryJson } from './buildSemanticQueryJson';

describe('buildSemanticQueryJson', () => {
    const metricQuery = {
        exploreName: 'ads_touziren_sales_m',
        dimensions: ['ads_touziren_sales_m_month_2'],
        metrics: ['ads_touziren_sales_m_total_active_branch_count'],
    };

    it('returns plain metricQuery JSON when no context', () => {
        const json = buildSemanticQueryJson(metricQuery);
        expect(JSON.parse(json)).toEqual(metricQuery);
    });

    it('injects projectUuid only', () => {
        const projectUuid = '3667f682-4080-44a4-8365-49f405936e09';
        const json = buildSemanticQueryJson(metricQuery, { projectUuid });
        const parsed = JSON.parse(json) as Record<string, unknown>;
        expect(parsed).toEqual({
            projectUuid,
            ...metricQuery,
        });
        expect(Object.keys(parsed)[0]).toBe('projectUuid');
    });

    it('injects dashboardUuid only', () => {
        const dashboardUuid = '6cd77b2e-b5e2-4611-9a00-e0c08d3ed39d';
        const json = buildSemanticQueryJson(metricQuery, { dashboardUuid });
        const parsed = JSON.parse(json) as Record<string, unknown>;
        expect(parsed).toEqual({
            dashboardUuid,
            ...metricQuery,
        });
        expect(Object.keys(parsed)[0]).toBe('dashboardUuid');
    });

    it('injects projectUuid then dashboardUuid when both present', () => {
        const projectUuid = '3667f682-4080-44a4-8365-49f405936e09';
        const dashboardUuid = '6cd77b2e-b5e2-4611-9a00-e0c08d3ed39d';
        const json = buildSemanticQueryJson(metricQuery, {
            projectUuid,
            dashboardUuid,
        });
        const parsed = JSON.parse(json) as Record<string, unknown>;
        expect(parsed).toEqual({
            projectUuid,
            dashboardUuid,
            ...metricQuery,
        });
        expect(Object.keys(parsed)[0]).toBe('projectUuid');
        expect(Object.keys(parsed)[1]).toBe('dashboardUuid');
    });

    it('ignores empty projectUuid and dashboardUuid', () => {
        const json = buildSemanticQueryJson(metricQuery, {
            projectUuid: '',
            dashboardUuid: '',
        });
        expect(JSON.parse(json)).toEqual(metricQuery);
    });
});
