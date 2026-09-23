import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import dashboardAsCodeSchema from './json/dashboard-as-code-1.0.json';

const createValidator = () => {
    const ajv = new Ajv({
        allErrors: true,
        allowUnionTypes: true,
        strict: false,
    });
    addFormats(ajv);
    return ajv.compile(dashboardAsCodeSchema);
};

const baseDashboard = {
    name: 'Dashboard',
    slug: 'dashboard',
    spaceSlug: 'space',
    version: 1,
    tiles: [],
    filters: {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
};

describe('dashboardAsCodeSchema', () => {
    const validate = createValidator();

    test('accepts tab-level filters and fork config extras', () => {
        expect(
            validate({
                ...baseDashboard,
                config: {
                    isDateZoomDisabled: false,
                    tabFilterEnabled: { overview: true },
                    syncChartTileUuids: ['revenue-chart'],
                },
                tabs: [
                    {
                        slug: 'overview',
                        name: 'Overview',
                        order: 0,
                        filters: {
                            dimensions: [
                                {
                                    operator: 'equals',
                                    target: {
                                        fieldId: 'orders_status',
                                        tableName: 'orders',
                                    },
                                    values: ['complete'],
                                },
                            ],
                            metrics: [],
                            tableCalculations: [],
                        },
                    },
                ],
            }),
        ).toBe(true);
    });

    test('accepts tabs without filters', () => {
        expect(
            validate({
                ...baseDashboard,
                tabs: [{ slug: 'overview', name: 'Overview', order: 0 }],
            }),
        ).toBe(true);
    });

    test('rejects a dashboard missing its name', () => {
        expect(
            validate({
                slug: baseDashboard.slug,
                spaceSlug: baseDashboard.spaceSlug,
                version: baseDashboard.version,
                tiles: baseDashboard.tiles,
                filters: baseDashboard.filters,
                tabs: [],
            }),
        ).toBe(false);
    });
});
