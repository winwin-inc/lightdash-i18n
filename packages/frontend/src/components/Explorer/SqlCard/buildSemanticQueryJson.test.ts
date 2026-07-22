import { buildSemanticQueryJson } from './buildSemanticQueryJson';

describe('buildSemanticQueryJson', () => {
    const metricQuery = {
        exploreName: 'ads_touziren_sales_m',
        dimensions: ['ads_touziren_sales_m_month_2'],
        metrics: ['ads_touziren_sales_m_total_active_branch_count'],
    };

    it('returns plain metricQuery JSON when no dashboard context', () => {
        const json = buildSemanticQueryJson(metricQuery, undefined);
        expect(JSON.parse(json)).toEqual(metricQuery);
    });

    it('injects dashboardUuid when fromDashboard is present', () => {
        const dashboardUuid = '6cd77b2e-b5e2-4611-9a00-e0c08d3ed39d';
        const json = buildSemanticQueryJson(metricQuery, dashboardUuid);
        const parsed = JSON.parse(json) as Record<string, unknown>;
        expect(parsed).toEqual({
            dashboardUuid,
            ...metricQuery,
        });
        expect(Object.keys(parsed)[0]).toBe('dashboardUuid');
    });

    it('ignores empty dashboardUuid', () => {
        const json = buildSemanticQueryJson(metricQuery, '');
        expect(JSON.parse(json)).toEqual(metricQuery);
    });
});
