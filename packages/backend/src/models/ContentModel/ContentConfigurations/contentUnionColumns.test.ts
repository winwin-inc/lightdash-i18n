import { ContentType } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { MockClient } from 'knex-mock-client';
import { ContentFilters } from '../ContentModelTypes';
import { dashboardContentConfiguration } from './DashboardContentConfiguration';
import { dataAppContentConfiguration } from './DataAppContentConfiguration';
import { dbtExploreChartContentConfiguration } from './DbtExploreChartContentConfiguration';
import { spaceContentConfiguration } from './SpaceContentConfiguration';
import { sqlChartContentConfiguration } from './SqlChartContentConfiguration';

const db = knex({ client: MockClient, dialect: 'pg' });

type ContentConfig = {
    name: string;
    getSummaryQuery: (
        knexClient: Knex,
        filters: ContentFilters,
    ) => Knex.QueryBuilder;
    filters: ContentFilters;
};

/**
 * Extract top-level SELECT aliases from a Knex query builder.
 * Content UNION ALL requires every branch to project the same column aliases.
 */
const getSelectAliases = (query: Knex.QueryBuilder): string[] => {
    // Knex stores select columns in internal _statements; safe for unit tests.
    const statements = (
        query as Knex.QueryBuilder & {
            _statements: Array<{ grouping: string; value: unknown }>;
        }
    )._statements.filter((statement) => statement.grouping === 'columns');

    const aliases: string[] = [];

    for (const statement of statements) {
        const values = Array.isArray(statement.value)
            ? statement.value
            : [statement.value];

        for (const value of values) {
            if (typeof value === 'string') {
                const parts = value.split(/\s+as\s+/i);
                const alias = parts[parts.length - 1]
                    .replace(/["`]/g, '')
                    .trim();
                aliases.push(alias.includes('.') ? alias.split('.').pop()! : alias);
                continue;
            }

            if (value && typeof value === 'object' && 'sql' in value) {
                const sql = (value as { sql: unknown }).sql;
                if (typeof sql === 'string') {
                    const match = sql.match(/\bas\s+([a-z0-9_]+)\s*$/i);
                    if (match) {
                        aliases.push(match[1]);
                    }
                }
            }
        }
    }

    return aliases;
};

const configurations: ContentConfig[] = [
    {
        name: 'sqlChart',
        getSummaryQuery: sqlChartContentConfiguration.getSummaryQuery,
        filters: { contentTypes: [ContentType.CHART] },
    },
    {
        name: 'dbtExploreChart',
        getSummaryQuery: dbtExploreChartContentConfiguration.getSummaryQuery,
        filters: { contentTypes: [ContentType.CHART] },
    },
    {
        name: 'dashboard',
        getSummaryQuery: dashboardContentConfiguration.getSummaryQuery,
        filters: { contentTypes: [ContentType.DASHBOARD] },
    },
    {
        name: 'dataApp',
        getSummaryQuery: dataAppContentConfiguration.getSummaryQuery,
        filters: { contentTypes: [ContentType.DATA_APP] },
    },
    {
        name: 'space',
        getSummaryQuery: spaceContentConfiguration.getSummaryQuery,
        filters: { contentTypes: [ContentType.SPACE] },
    },
];

describe('content configuration UNION column contract', () => {
    it('projects the same SELECT aliases across all content types', () => {
        const aliasSets = configurations.map((config) => ({
            name: config.name,
            aliases: getSelectAliases(
                config.getSummaryQuery(db, config.filters),
            ),
        }));

        const [baseline, ...rest] = aliasSets;
        expect(baseline.aliases.length).toBeGreaterThan(0);
        expect(baseline.aliases).toEqual(
            expect.arrayContaining([
                'deleted_at',
                'deleted_by_user_uuid',
                'deleted_by_user_first_name',
                'deleted_by_user_last_name',
                'verified_at',
                'verified_by_user_uuid',
                'verified_by_user_first_name',
                'verified_by_user_last_name',
                'owner_user_uuid',
                'metadata',
            ]),
        );

        for (const candidate of rest) {
            expect({
                name: candidate.name,
                aliases: candidate.aliases,
            }).toEqual({
                name: candidate.name,
                aliases: baseline.aliases,
            });
        }
    });
});
