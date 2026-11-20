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

    test('accepts legacy null config and null description from old downloads', () => {
        expect(
            validate({
                ...baseDashboard,
                description: null,
                config: null,
                tabs: [{ slug: 'overview', name: 'Overview', order: 0 }],
            }),
        ).toBe(true);
    });

    test('accepts fork cascade, group and range-limiter fields', () => {
        const forkRule = {
            operator: 'equals',
            target: { fieldId: 'orders_status', tableName: 'orders' },
            values: ['completed'],
            requiredGroupId: 'group-1',
            clearable: false,
            dataAvailableFromDay: 5,
            rollingMinAllowedMonths: 3,
            enableDynamicMaxAllowedDate: true,
            minAllowedDate: '2024-01-01',
            maxAllowedDate: '2025-12-31',
            allowedOperators: ['equals'],
            excludedValues: ['cancelled'],
            parentFieldId: 'orders_status',
            parentScope: 'tab',
            parentTabUuid: 'overview',
            categoryLevel: 2,
            singleValue: true,
            hideTilesWhenEmpty: true,
            readOnly: true,
            lockedTabUuids: ['overview'],
        };

        // root filters carry ids, tab filters don't (portable export strips them)
        expect(
            validate({
                ...baseDashboard,
                filters: {
                    dimensions: [{ ...forkRule, id: 'filter-1' }],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs: [
                    {
                        slug: 'overview',
                        name: 'Overview',
                        order: 0,
                        filters: {
                            dimensions: [forkRule],
                            metrics: [],
                            tableCalculations: [],
                        },
                    },
                ],
            }),
        ).toBe(true);
    });

    test('accepts the parentTabSlug alias next to legacy parentTabUuid refs', () => {
        expect(
            validate({
                ...baseDashboard,
                filters: {
                    dimensions: [
                        {
                            id: 'filter-1',
                            operator: 'equals',
                            target: {
                                fieldId: 'orders_status',
                                tableName: 'orders',
                            },
                            parentScope: 'tab',
                            parentTabSlug: 'overview',
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
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
                                        fieldId: 'orders_channel',
                                        tableName: 'orders',
                                    },
                                    parentScope: 'tab',
                                    // Stock shape: the canonical field keeps
                                    // working for existing YAML files.
                                    parentTabUuid: 'overview',
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
