import { ParameterError, UpdateSqlChart } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { SavedSqlTableName } from '../database/entities/savedSql';
import { SavedSqlModel } from './SavedSqlModel';

const USER_UUID = 'user-uuid';
const PROJECT_UUID = 'project-uuid';
const SPACE_UUID = 'space-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';
const SAVED_SQL_UUID = 'saved-sql-uuid';

const sqlChart: UpdateSqlChart = {
    unversionedData: {
        name: 'My sql chart',
        description: null,
        spaceUuid: SPACE_UUID,
    },
};

describe('SavedSqlModel', () => {
    const model = new SavedSqlModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
    });

    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    describe('create', () => {
        test('should create a chart owned by a dashboard', async () => {
            tracker.on.select(SavedSqlTableName).response([]);
            tracker.on.update(SavedSqlTableName).response([]);
            tracker.on.insert(SavedSqlTableName).response([
                {
                    saved_sql_uuid: SAVED_SQL_UUID,
                    slug: 'my-sql-chart',
                },
            ]);
            tracker.on
                .insert('saved_sql_versions')
                .response([{ saved_sql_version_uuid: 'version-uuid' }]);

            await model.create(USER_UUID, PROJECT_UUID, {
                name: 'My sql chart',
                description: null,
                sql: 'select 1',
                limit: 500,
                config: { type: 'table' } as never,
                dashboardUuid: DASHBOARD_UUID,
            });

            const insert = tracker.history.insert[0];
            expect(insert.bindings).toContain(DASHBOARD_UUID);
            // a chart belongs either to a space or to a dashboard
            expect(insert.bindings).not.toContain(SPACE_UUID);
        });

        test('should throw when the chart belongs to both a space and a dashboard', async () => {
            await expect(
                model.create(USER_UUID, PROJECT_UUID, {
                    name: 'My sql chart',
                    description: null,
                    sql: 'select 1',
                    limit: 500,
                    config: { type: 'table' } as never,
                    spaceUuid: SPACE_UUID,
                    dashboardUuid: DASHBOARD_UUID,
                }),
            ).rejects.toThrow(ParameterError);

            expect(tracker.history.insert).toHaveLength(0);
        });

        test('should throw when the chart belongs to neither a space nor a dashboard', async () => {
            await expect(
                model.create(USER_UUID, PROJECT_UUID, {
                    name: 'My sql chart',
                    description: null,
                    sql: 'select 1',
                    limit: 500,
                    config: { type: 'table' } as never,
                }),
            ).rejects.toThrow(ParameterError);

            expect(tracker.history.insert).toHaveLength(0);
        });
    });

    describe('update', () => {
        test('should not change the ownership of a dashboard owned chart', async () => {
            tracker.on.update(SavedSqlTableName).response([]);

            await model.update({
                userUuid: USER_UUID,
                savedSqlUuid: SAVED_SQL_UUID,
                sqlChart,
                keepOwnership: true,
            });

            const update = tracker.history.update[0];
            // neither the space nor the dashboard of the chart are updated
            expect(update.bindings).not.toContain(SPACE_UUID);
            expect(update.bindings).not.toContain(DASHBOARD_UUID);
        });

        test('should move a chart to a space when its ownership changes', async () => {
            tracker.on.update(SavedSqlTableName).response([]);

            await model.update({
                userUuid: USER_UUID,
                savedSqlUuid: SAVED_SQL_UUID,
                sqlChart,
                keepOwnership: false,
            });

            const update = tracker.history.update[0];
            expect(update.bindings).toContain(SPACE_UUID);
            // the chart does not belong to a dashboard anymore
            expect(update.bindings).toContain(null);
        });

        test('should not change the ownership when no target space is given', async () => {
            tracker.on.update(SavedSqlTableName).response([]);

            await model.update({
                userUuid: USER_UUID,
                savedSqlUuid: SAVED_SQL_UUID,
                sqlChart: {
                    unversionedData: {
                        name: 'My sql chart',
                        description: null,
                    },
                } as UpdateSqlChart,
            });

            const update = tracker.history.update[0];
            // the chart keeps belonging to its space or its dashboard
            expect(update.bindings).not.toContain(SPACE_UUID);
            expect(update.bindings).not.toContain(DASHBOARD_UUID);
        });
    });
});
