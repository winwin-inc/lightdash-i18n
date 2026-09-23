import {
    ChartAsCode,
    CustomBinDimension,
    DashboardAsCode,
    SEED_PROJECT,
} from '@lightdash/common';
import * as yaml from 'js-yaml';

describe('Charts as Code API', () => {
    let chartAsCode: ChartAsCode;
    beforeEach(() => {
        cy.readFile('./cypress/support/chartAsCode.yml', 'utf8').then(
            (chartFile) => {
                chartAsCode = yaml.load(chartFile) as ChartAsCode;
            },
        );
        cy.login();
    });

    it('make sure the chart is loaded from YML', () => {
        cy.log('chartAsCode', chartAsCode);
        cy.wrap(chartAsCode).should('exist');
    });
    it('should download charts as code', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);

            const { results } = response.body;

            cy.wrap(results).should('exist');
            cy.wrap(results.charts).should('be.an', 'array');
            cy.wrap(results.charts).its('length').should('be.gt', 0);
            const chart = results.charts.find(
                (c: { slug: string }) => c.slug === chartAsCode.slug,
            );
            cy.wrap(chart).should('exist');

            // makes sure we donwloaded everything
            // This will not work if the project has more than 100 charts
            if (results.charts.length < 100)
                cy.wrap(results.total).should('eq', results.charts.length);
        });
    });

    it('should download charts as code by slug', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code?ids=${chartAsCode.slug}`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.charts.length).should('eq', 1);
            const chart = response.body.results.charts.find(
                (c: { slug: string }) => c.slug === chartAsCode.slug,
            );
            cy.wrap(chart).should('exist');
            cy.wrap(response.body.results.missingIds).should('be.an', 'array');
            cy.wrap(response.body.results.missingIds)
                .its('length')
                .should('eq', 0);
        });
    });

    it('should download charts as code with offset', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code?offset=5`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            const { results } = response.body;
            cy.wrap(results).should('exist');
            cy.wrap(results.charts.length).should('be.gt', 0);
            cy.wrap(results.total - results.charts.length).should('eq', 5); // We skipped the first 5
        });
    });

    it('should upload chart as code', () => {
        const newDescription = `Updated description ${new Date().toISOString()}`;
        const newBinNumber = Math.floor(Math.random() * 10) + 1;
        const customDimension: CustomBinDimension = chartAsCode.metricQuery
            .customDimensions![0] as CustomBinDimension;
        const updatedChartAsCode = {
            ...chartAsCode,
            description: newDescription,
            metricQuery: {
                ...chartAsCode.metricQuery,
                customDimensions: [
                    {
                        ...customDimension,
                        binNumber: newBinNumber,
                    },
                ],
            },
        };

        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/${chartAsCode.slug}/code`,
            body: updatedChartAsCode,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.charts).should('be.an', 'array');
            cy.wrap(response.body.results.charts[0].action).should(
                'eq',
                'update',
            );
            const updatedChart = response.body.results.charts[0].data;
            cy.wrap(updatedChart.description).should('eq', newDescription);
            cy.wrap(
                updatedChart.metricQuery.customDimensions[0].binNumber,
            ).should('eq', newBinNumber);
        });
    });
});

describe('Dashboards as Code API', () => {
    let dashboardAsCode: DashboardAsCode;
    beforeEach(() => {
        cy.readFile('./cypress/support/dashboardAsCode.yml', 'utf8').then(
            (dashboardFile) => {
                dashboardAsCode = yaml.load(dashboardFile) as DashboardAsCode;
            },
        );
        cy.login();
    });
    it('make sure the dashboard is loaded from YML', () => {
        cy.log('dashboardAsCode', dashboardAsCode);
        cy.wrap(dashboardAsCode).should('exist');
    });
    it('should download dashboards as code', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/code`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.dashboards).should('be.an', 'array');
            cy.wrap(response.body.results.dashboards)
                .its('length')
                .should('be.gt', 0);
            const dashboard = response.body.results.dashboards.find(
                (c: { slug: string }) => c.slug === dashboardAsCode.slug,
            );
            cy.wrap(dashboard).should('exist');
        });
    });

    it('should download dashboards as code by slug', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/code?ids=${dashboardAsCode.slug}`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.dashboards.length).should('eq', 1);
            const dashboard = response.body.results.dashboards.find(
                (c: { slug: string }) => c.slug === dashboardAsCode.slug,
            );
            cy.wrap(dashboard).should('exist');
            cy.wrap(response.body.results.missingIds).should('be.an', 'array');
            cy.wrap(response.body.results.missingIds)
                .its('length')
                .should('eq', 0);
        });
    });

    it('should download dashboards as code with offset', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/code?offset=1`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            const { results } = response.body;
            cy.wrap(results).should('exist');
            cy.wrap(results.dashboards.length).should('be.gt', 0);
            cy.wrap(results.total - results.dashboards.length).should('eq', 1);
        });
    });

    it('should upload dashboard as code', () => {
        const newDescription = `Updated description ${new Date().toISOString()}`;
        const updateddashboardAsCode = {
            ...dashboardAsCode,
            description: newDescription,
        };

        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardAsCode.slug}/code`,
            body: updateddashboardAsCode,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.dashboards).should('be.an', 'array');
            cy.wrap(response.body.results.dashboards[0].action).should(
                'eq',
                'update',
            );
            const updateddashboard = response.body.results.dashboards[0].data;
            cy.wrap(updateddashboard.description).should('eq', newDescription);
        });
    });
});

describe('Content as Code new /code/* routes', () => {
    beforeEach(() => {
        cy.login();
    });

    it('should download charts from /code/charts and include spaces', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/charts`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results.charts).should('be.an', 'array');
            cy.wrap(response.body.results.charts).its('length').should('be.gt', 0);
            cy.wrap(response.body.results.spaces).should('be.an', 'array');
        });
    });

    it('should download dashboards from /code/dashboards and include spaces', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/dashboards`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results.dashboards).should('be.an', 'array');
            cy.wrap(response.body.results.spaces).should('be.an', 'array');
        });
    });

    it('should list spaces from /code/spaces', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/spaces`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results.spaces).should('be.an', 'array');
            cy.wrap(response.body.results.skipped).should('be.an', 'array');
        });
    });

    it('should list SQL charts from /code/sqlCharts', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/sqlCharts`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results.sqlCharts).should('be.an', 'array');
            cy.wrap(response.body.results.spaces).should('be.an', 'array');
        });
    });

    it('should keep tab.filters after dashboard as-code round-trip', () => {
        cy.readFile('./cypress/support/dashboardAsCode.yml', 'utf8').then(
            (dashboardFile) => {
                const dashboardAsCode = yaml.load(
                    dashboardFile,
                ) as DashboardAsCode;
                const slug = `tab-filters-roundtrip-${Date.now()}`;
                const tabFilters = {
                    dimensions: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: 'equals',
                            values: ['completed'],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                };
                const payload = {
                    ...dashboardAsCode,
                    slug,
                    force: true,
                    tabs: [
                        {
                            uuid: 'tab-filters-roundtrip',
                            name: 'Filtered tab',
                            order: 0,
                            filters: tabFilters,
                        },
                    ],
                    tiles: dashboardAsCode.tiles.map((tile) => ({
                        ...tile,
                        tabUuid: 'tab-filters-roundtrip',
                    })),
                };

                cy.request({
                    method: 'POST',
                    url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/dashboards/${slug}`,
                    body: payload,
                }).then((uploadResponse) => {
                    cy.wrap(uploadResponse).its('status').should('eq', 200);
                    cy.wrap(uploadResponse.body.results.dashboards).should(
                        'be.an',
                        'array',
                    );
                    cy.wrap(
                        uploadResponse.body.results.dashboards[0].action,
                    ).should('be.oneOf', ['create', 'update']);

                    cy.request({
                        method: 'GET',
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/dashboards?ids=${slug}`,
                    }).then((downloadResponse) => {
                        const downloaded =
                            downloadResponse.body.results.dashboards[0];
                        cy.wrap(downloaded.tabs).should('have.length', 1);
                        cy.wrap(downloaded.tabs[0].filters).should('exist');
                        cy.wrap(
                            downloaded.tabs[0].filters.dimensions,
                        ).should('have.length', 1);
                        cy.wrap(
                            downloaded.tabs[0].filters.dimensions[0].values,
                        ).should('deep.equal', ['completed']);
                    });
                });
            },
        );
    });
});
