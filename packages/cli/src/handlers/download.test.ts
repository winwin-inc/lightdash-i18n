import { PromotionAction, type PromotionChanges } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lightdashApi } from './dbt/apiClient';
import {
    downloadContent,
    logUpsertWarnings,
    storeUploadChanges,
} from './download';

jest.mock('./dbt/apiClient', () => ({
    lightdashApi: jest.fn(),
    checkLightdashVersion: jest.fn(),
}));

const dashboardPage = (
    dashboards: { slug: string; chartSlug?: string }[],
    offset: number,
    total: number,
) => ({
    dashboards: dashboards.map((dashboard) => ({
        version: 1,
        name: dashboard.slug,
        slug: dashboard.slug,
        spaceSlug: 'shared',
        tiles: dashboard.chartSlug
            ? [
                  {
                      x: 0,
                      y: 0,
                      w: 4,
                      h: 3,
                      type: 'saved_chart',
                      properties: { chartSlug: dashboard.chartSlug },
                  },
              ]
            : [],
    })),
    offset,
    total,
    missingIds: [] as string[],
});

describe('download', () => {
    describe('downloadContent', () => {
        it('accumulates chart slugs from every dashboard page', async () => {
            const tmpDir = await fs.mkdtemp(
                path.join(os.tmpdir(), 'lightdash-download-test-'),
            );
            try {
                (lightdashApi as jest.Mock).mockImplementation(
                    async ({ url }: { url: string }) => {
                        if (url.includes('offset=0&')) {
                            return dashboardPage(
                                [
                                    { slug: 'd1', chartSlug: 'chart-a' },
                                    { slug: 'd2', chartSlug: 'chart-b' },
                                ],
                                2,
                                4,
                            );
                        }
                        return dashboardPage(
                            [
                                { slug: 'd3', chartSlug: 'chart-c' },
                                { slug: 'd4', chartSlug: 'chart-d' },
                            ],
                            4,
                            4,
                        );
                    },
                );

                const [total, chartSlugs] = await downloadContent(
                    ['d1', 'd2', 'd3', 'd4'],
                    'dashboards',
                    'project-uuid',
                    tmpDir,
                );

                expect(total).toBe(4);
                // Charts linked to dashboards from ALL pages must be kept:
                // overwriting the accumulator per page used to drop
                // every page but the last one.
                expect(chartSlugs).toEqual([
                    'chart-a',
                    'chart-b',
                    'chart-c',
                    'chart-d',
                ]);

                // All dashboard files from both pages are written
                await Promise.all(
                    ['d1', 'd2', 'd3', 'd4'].map(async (slug) => {
                        await expect(
                            fs.access(
                                path.join(tmpDir, 'dashboards', `${slug}.yml`),
                            ),
                        ).resolves.toBeUndefined();
                    }),
                );
            } finally {
                await fs.rm(tmpDir, { recursive: true, force: true });
            }
        });
    });

    describe('storeUploadChanges', () => {
        const promoteChanges = {
            spaces: [
                { action: PromotionAction.NO_CHANGES, data: {} },
                { action: PromotionAction.CREATE, data: {} },
            ],
            dashboards: [{ action: PromotionAction.UPDATE, data: {} }],
            charts: [
                { action: PromotionAction.NO_CHANGES, data: {} },
                { action: PromotionAction.NO_CHANGES, data: {} },
            ],
            sqlCharts: [],
            apps: [],
            conflicts: [],
        } as unknown as PromotionChanges;

        it('only counts the resource of the current upload phase', () => {
            // A dashboard upsert response also reports the dashboard's
            // charts/spaces (usually NO_CHANGES); counting them would
            // double-report resources handled by the charts phase.
            const changes = storeUploadChanges(
                {},
                promoteChanges,
                'dashboards',
            );

            expect(changes).toEqual({
                'dashboards updated': 1,
                'spaces created': 1,
            });
        });

        it('reports sql chart actions under the charts keys', () => {
            const changes = storeUploadChanges(
                {},
                {
                    ...promoteChanges,
                    sqlCharts: [{ action: PromotionAction.CREATE, data: {} }],
                } as unknown as PromotionChanges,
                'sqlCharts',
            );

            expect(changes).toEqual({
                'charts created': 1,
                'spaces created': 1,
            });
        });
    });

    describe('logUpsertWarnings', () => {
        it('prints every warning returned by the server', () => {
            const warnSpy = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => {});

            try {
                logUpsertWarnings('charts', 'my-chart', [
                    'Chart "x" was not found in this project',
                ]);
                expect(warnSpy).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Chart "x" was not found in this project',
                    ),
                );

                // undefined warnings must be a no-op
                expect(() =>
                    logUpsertWarnings('charts', 'my-chart', undefined),
                ).not.toThrow();
            } finally {
                warnSpy.mockRestore();
            }
        });
    });
});
