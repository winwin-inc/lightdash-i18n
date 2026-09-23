import {
    ChartAsCode,
    ChartKind,
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
                        cy.wrap(downloaded.tabs[0].slug).should(
                            'eq',
                            'filtered-tab',
                        );
                        cy.wrap(downloaded.tabs[0].slug).should(
                            'not.match',
                            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                        );
                        downloaded.tiles.forEach(
                            (tile: { tabSlug?: string }) => {
                                cy.wrap(tile.tabSlug).should(
                                    'eq',
                                    'filtered-tab',
                                );
                            },
                        );
                    });
                });
            },
        );
    });

    it('should round-trip dashboard config slugs and locked tabs', () => {
        cy.readFile('./cypress/support/dashboardAsCode.yml', 'utf8').then(
            (dashboardFile) => {
                const dashboardAsCode = yaml.load(
                    dashboardFile,
                ) as DashboardAsCode;
                const slug = `config-slugs-roundtrip-${Date.now()}`;
                const chartSlug =
                    'how-much-revenue-do-we-have-per-payment-method';
                const payload = {
                    ...dashboardAsCode,
                    slug,
                    force: true,
                    tabs: [
                        {
                            name: 'Filtered tab',
                            order: 0,
                            slug: 'filtered-tab',
                        },
                    ],
                    tiles: dashboardAsCode.tiles.map((tile) => ({
                        ...tile,
                        tabSlug: 'filtered-tab',
                    })),
                    filters: {
                        dimensions: [
                            {
                                target: { fieldId: 'orders_status' },
                                operator: 'equals',
                                values: ['completed'],
                                lockedTabUuids: ['filtered-tab'],
                            },
                        ],
                        metrics: [],
                        tableCalculations: [],
                    },
                    config: {
                        isDateZoomDisabled: false,
                        syncChartColors: true,
                        tabFilterEnabled: { 'filtered-tab': true },
                        showTabAddFilterButton: { 'filtered-tab': false },
                        syncChartTileUuids: [chartSlug],
                    },
                };

                cy.request({
                    method: 'POST',
                    url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/dashboards/${slug}`,
                    body: payload,
                }).then((uploadResponse) => {
                    cy.wrap(uploadResponse).its('status').should('eq', 200);

                    cy.request({
                        method: 'GET',
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/dashboards?ids=${slug}`,
                    }).then((downloadResponse) => {
                        const downloaded =
                            downloadResponse.body.results.dashboards[0];
                        cy.wrap(downloaded.config.tabFilterEnabled).should(
                            'deep.equal',
                            { 'filtered-tab': true },
                        );
                        cy.wrap(
                            downloaded.config.showTabAddFilterButton,
                        ).should('deep.equal', { 'filtered-tab': false });
                        cy.wrap(downloaded.config.syncChartTileUuids).should(
                            'include',
                            chartSlug,
                        );
                        cy.wrap(
                            downloaded.filters.dimensions[0].lockedTabUuids,
                        ).should('deep.equal', ['filtered-tab']);
                        cy.wrap(downloaded.tabs[0].name).should(
                            'eq',
                            'Filtered tab',
                        );
                        downloaded.tiles.forEach(
                            (tile: { tabSlug?: string }) => {
                                cy.wrap(tile.tabSlug).should(
                                    'eq',
                                    'filtered-tab',
                                );
                            },
                        );
                    });
                });
            },
        );
    });

    it('should keep Chinese space names and export private spaces as skipped', () => {
        const slug = `zhongwen-space-${Date.now()}`;
        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/spaces`,
            body: {
                contentType: 'space',
                version: 1,
                spaceName: '销售分析',
                slug,
            },
        }).then((createResponse) => {
            cy.wrap(createResponse).its('status').should('eq', 200);

            cy.request({
                method: 'GET',
                url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/spaces`,
            }).then((listResponse) => {
                const created = listResponse.body.results.spaces.find(
                    (space: { slug: string; spaceName: string }) =>
                        space.slug === slug,
                );
                cy.wrap(created).should('exist');
                cy.wrap(created.spaceName).should('eq', '销售分析');
                cy.wrap(created.slug).should('eq', slug);
            });
        });

        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/spaces`,
            headers: { 'Content-type': 'application/json' },
            body: { name: `cac-private-${Date.now()}` },
        }).then((spaceResponse) => {
            const privateName = spaceResponse.body.results.name;
            cy.request({
                method: 'GET',
                url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/spaces`,
            }).then((adminList) => {
                const privateSpace = adminList.body.results.spaces.find(
                    (space: { spaceName: string; slug: string }) =>
                        space.spaceName === privateName,
                );
                cy.wrap(privateSpace).should('exist');

                cy.loginAsEditor();
                cy.request({
                    method: 'GET',
                    url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/spaces`,
                }).then((editorList) => {
                    const inSpaces = editorList.body.results.spaces.find(
                        (space: { slug: string }) =>
                            space.slug === privateSpace.slug,
                    );
                    const skipped = editorList.body.results.skipped.find(
                        (space: { slug: string }) =>
                            space.slug === privateSpace.slug,
                    );
                    cy.wrap(inSpaces).should('not.exist');
                    cy.wrap(skipped).should('exist');
                    cy.wrap(skipped.reason).should('eq', 'No view access');
                });
            });
        });
    });

    it('should keep tabSlug when uploading via the legacy dashboard as-code route', () => {
        cy.readFile('./cypress/support/dashboardAsCode.yml', 'utf8').then(
            (dashboardFile) => {
                const dashboardAsCode = yaml.load(
                    dashboardFile,
                ) as DashboardAsCode;
                const slug = `legacy-tab-slug-${Date.now()}`;
                const payload = {
                    ...dashboardAsCode,
                    slug,
                    force: true,
                    tabs: [
                        {
                            name: 'Filtered tab',
                            order: 0,
                            slug: 'filtered-tab',
                        },
                    ],
                    tiles: dashboardAsCode.tiles.map((tile) => ({
                        ...tile,
                        tabUuid: undefined,
                        tabSlug: 'filtered-tab',
                    })),
                };

                cy.request({
                    method: 'POST',
                    url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/${slug}/code`,
                    body: payload,
                }).then((uploadResponse) => {
                    cy.wrap(uploadResponse).its('status').should('eq', 200);

                    cy.request({
                        method: 'GET',
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/dashboards?ids=${slug}`,
                    }).then((downloadResponse) => {
                        const downloaded =
                            downloadResponse.body.results.dashboards[0];
                        cy.wrap(downloaded.tabs[0].slug).should(
                            'eq',
                            'filtered-tab',
                        );
                        downloaded.tiles.forEach(
                            (tile: { tabSlug?: string }) => {
                                cy.wrap(tile.tabSlug).should(
                                    'eq',
                                    'filtered-tab',
                                );
                            },
                        );
                    });
                });
            },
        );
    });

    it('should warn and keep the dashboard when a tile chart is missing', () => {
        cy.readFile('./cypress/support/dashboardAsCode.yml', 'utf8').then(
            (dashboardFile) => {
                const dashboardAsCode = yaml.load(
                    dashboardFile,
                ) as DashboardAsCode;
                const slug = `missing-chart-warn-${Date.now()}`;
                const missingChartSlug = `does-not-exist-${Date.now()}`;
                const payload = {
                    ...dashboardAsCode,
                    slug,
                    force: true,
                    tiles: dashboardAsCode.tiles.map((tile) =>
                        tile.type === 'saved_chart' &&
                        tile.properties &&
                        'chartSlug' in tile.properties &&
                        tile.properties.chartSlug ===
                            'how-much-revenue-do-we-have-per-payment-method'
                            ? {
                                  ...tile,
                                  properties: {
                                      ...tile.properties,
                                      chartSlug: missingChartSlug,
                                  },
                              }
                            : tile,
                    ),
                };

                cy.request({
                    method: 'POST',
                    url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/dashboards/${slug}`,
                    body: payload,
                }).then((uploadResponse) => {
                    cy.wrap(uploadResponse).its('status').should('eq', 200);
                    cy.wrap(uploadResponse.body.results.warnings).should(
                        'be.an',
                        'array',
                    );
                    cy.wrap(
                        uploadResponse.body.results.warnings.join(' '),
                    ).should('include', missingChartSlug);
                });
            },
        );
    });

    it('should hide SQL charts in private spaces from editors', () => {
        const spaceName = `cac-private-sql-${Date.now()}`;
        const chartName = `private-sql-chart-${Date.now()}`;
        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/spaces`,
            headers: { 'Content-type': 'application/json' },
            body: { name: spaceName },
        }).then((spaceResponse) => {
            cy.request({
                method: 'POST',
                url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved`,
                headers: { 'Content-type': 'application/json' },
                body: {
                    name: chartName,
                    description: null,
                    sql: 'SELECT 1',
                    limit: 1,
                    config: {
                        display: {},
                        metadata: { version: 1 },
                        type: ChartKind.TABLE,
                        columns: {},
                    },
                    spaceUuid: spaceResponse.body.results.uuid,
                },
            }).then((createResp) => {
                cy.wrap(createResp).its('status').should('eq', 200);

                cy.request({
                    method: 'GET',
                    url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/sqlCharts`,
                }).then((adminList) => {
                    const created = adminList.body.results.sqlCharts.find(
                        (chart: { name: string; slug: string }) =>
                            chart.name === chartName,
                    );
                    cy.wrap(created).should('exist');

                    cy.loginAsEditor();
                    cy.request({
                        method: 'GET',
                        url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/sqlCharts`,
                    }).then((editorList) => {
                        const leaked = editorList.body.results.sqlCharts.find(
                            (chart: { slug: string }) =>
                                chart.slug === created.slug,
                        );
                        cy.wrap(leaked).should('not.exist');
                    });
                });
            });
        });
    });

    it('should allow editors to download charts as code', () => {
        cy.loginAsEditor();
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/charts`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results.charts).should('be.an', 'array');
        });
    });

    it('should forbid viewers from downloading or uploading as code', () => {
        cy.loginAsViewer();
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/charts`,
            failOnStatusCode: false,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 403);
        });
        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/code/charts/viewer-forbidden`,
            failOnStatusCode: false,
            body: {},
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 403);
        });
    });
});
