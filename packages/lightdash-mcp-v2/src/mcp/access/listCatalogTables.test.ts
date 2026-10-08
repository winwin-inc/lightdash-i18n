import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import { listAllCatalogTables } from './listCatalogTables';

describe('listAllCatalogTables', () => {
    it('returns the first page when pagination is absent', async () => {
        const api = {
            getCatalog: async () => ({
                data: [{ name: 'orders' }],
            }),
        } as unknown as LightdashRestClient;
        const items = await listAllCatalogTables(api, 'key', 'project-1');
        assert.deepEqual(items, [{ name: 'orders' }]);
    });

    it('walks remaining pages when totalPageCount is greater than 1', async () => {
        const calls: Array<{ page?: number; pageSize?: number }> = [];
        const api = {
            getCatalog: async (
                _apiKey: string,
                _projectUuid: string,
                query: { page?: number; pageSize?: number },
            ) => {
                calls.push({ page: query.page, pageSize: query.pageSize });
                if (query.page === 1) {
                    return {
                        data: [{ name: 'page-1' }],
                        pagination: { totalPageCount: 2 },
                    };
                }
                return { data: [{ name: 'page-2' }] };
            },
        } as unknown as LightdashRestClient;
        const items = await listAllCatalogTables(api, 'key', 'project-1');
        assert.deepEqual(items, [{ name: 'page-1' }, { name: 'page-2' }]);
        assert.equal(calls.length, 2);
        assert.equal(calls[0]?.page, 1);
        assert.equal(calls[1]?.page, 2);
    });
});
