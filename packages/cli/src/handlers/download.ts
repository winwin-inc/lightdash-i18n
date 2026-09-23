/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
import {
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    ApiDashboardAsCodeListResponse,
    ApiSqlChartAsCodeListResponse,
    assertUnreachable,
    AuthorizationError,
    ChartAsCode,
    ContentAsCodeType,
    DashboardAsCode,
    getErrorMessage,
    LightdashError,
    PromotionAction,
    PromotionChanges,
    type SqlChartAsCode,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import {
    downloadSpaces,
    isSpaceAsCodeFetchError,
    uploadSpaces,
    writeEmbeddedSpaces,
} from './spacesAsCode';

export type DownloadHandlerOptions = {
    verbose: boolean;
    charts: string[]; // These can be slugs, uuids or urls
    dashboards: string[]; // These can be slugs, uuids or urls
    force: boolean;
    path?: string; // New optional path parameter
    project?: string;
    languageMap: boolean;
    skipSpaceCreate: boolean;
    includeCharts: boolean;
};

const getDownloadFolder = (customPath?: string): string => {
    if (customPath) {
        return path.isAbsolute(customPath)
            ? customPath
            : path.join(process.cwd(), customPath);
    }
    return path.join(process.cwd(), 'lightdash');
};

/*
    This function is used to parse the content filters.
    It can be slugs, uuids or urls
    We remove the URL part (if any) and return a list of `slugs or uuids` that can be used in the API call
*/
const parseContentFilters = (items: string[]): string => {
    if (items.length === 0) return '';

    const parsedItems = items.map((item) => {
        const uuidMatch = item.match(
            /https?:\/\/.+\/(?:saved|dashboards)\/([a-f0-9-]+)/i,
        );
        return uuidMatch ? uuidMatch[1] : item;
    });

    return `?${new URLSearchParams(
        parsedItems.map((item) => ['ids', item] as [string, string]),
    ).toString()}`;
};

// TODO: translations should be partials of ChartAsCode and DashboardAsCode
type DownloadableContent =
    | {
          type: 'chart';
          content: ChartAsCode;
          translationMap: object | undefined;
      }
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          translationMap: object | undefined;
      };

const isSqlChartFile = (file: string) => file.endsWith('.sql.yml');

const createDirForContent = async (
    items: (ChartAsCode | DashboardAsCode)[],
    folder: 'charts' | 'dashboards',
    customPath: string | undefined,
) => {
    const outputDir = path.join(getDownloadFolder(customPath), folder);

    GlobalState.debug(`Writing ${items.length} ${folder} into ${outputDir}`);
    const created = await fs.mkdir(outputDir, { recursive: true });
    if (created) console.info(`\nCreated new folder: ${outputDir} `);

    return outputDir;
};

const writeContent = async (
    contentAsCode: DownloadableContent,
    outputDir: string,
    languageMap: boolean,
) => {
    const itemPath = path.join(outputDir, `${contentAsCode.content.slug}.yml`);
    const chartYml = yaml.dump(contentAsCode.content, {
        quotingType: '"',
    });
    await fs.writeFile(itemPath, chartYml);

    if (contentAsCode.translationMap && languageMap) {
        const translationPath = path.join(
            outputDir,
            `${contentAsCode.content.slug}.language.map.yml`,
        );
        await fs.writeFile(
            translationPath,
            yaml.dump(contentAsCode.translationMap),
        );
    }
};

const readCodeFiles = async <T extends ChartAsCode | DashboardAsCode>(
    folder: 'charts' | 'dashboards',
    customPath?: string,
): Promise<(T & { needsUpdating: boolean })[]> => {
    const inputDir = path.join(getDownloadFolder(customPath), folder);

    console.info(`Reading ${folder} from ${inputDir}`);
    const items: (T & { needsUpdating: boolean })[] = [];
    try {
        // Read all files from the lightdash directory
        // if folder does not exist, this throws an error
        const files = await fs.readdir(inputDir);
        const yamlFiles = files
            .filter((file) => file.endsWith('.yml'))
            .filter((file) => !file.endsWith('.language.map.yml'))
            .filter((file) => !isSqlChartFile(file));

        // Load each JSON file
        for (const file of yamlFiles) {
            const filePath = path.join(inputDir, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const item = yaml.load(fileContent) as T;

            const fileUpdatedAt = (await fs.stat(filePath)).mtime;
            // We override the updatedAt to the file's updatedAt
            // in case there were some changes made locally
            // do not override if the file was just created
            const downloadedAt = item.downloadedAt
                ? new Date(item.downloadedAt)
                : undefined;
            const needsUpdating =
                downloadedAt &&
                Math.abs(fileUpdatedAt.getTime() - downloadedAt.getTime()) >
                    30000;

            const locallyUpdatedItem = {
                ...item,
                updatedAt: needsUpdating ? fileUpdatedAt : item.updatedAt, // Force the update by changing updatedAt , which is what promotion is going to compare
                needsUpdating: needsUpdating ?? true, // if downloadAt is not set, we force the update
            };
            items.push(locallyUpdatedItem);
        }
    } catch (error) {
        // Folder does not exist
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.error(
                styles.warning(
                    `Unable to upload ${folder}, "${inputDir}" folder not found. Run download command first.`,
                ),
            );
            return [];
        }
        // Unknown error
        console.error(styles.error(`Error reading ${inputDir}: ${error}`));
        throw error;
    }

    return items;
};

export const downloadContent = async (
    ids: string[], // slug, uuid or url
    type: 'charts' | 'dashboards',
    projectId: string,
    customPath?: string,
    languageMap: boolean = false,
): Promise<[number, string[]]> => {
    const spinner = GlobalState.getActiveSpinner();
    const contentFilters = parseContentFilters(ids);
    let contentAsCode:
        | ApiChartAsCodeListResponse['results']
        | ApiDashboardAsCodeListResponse['results'];
    let offset = 0;
    let chartSlugs: string[] = [];
    do {
        GlobalState.debug(
            `Downloading ${type} with offset "${offset}" and filters "${contentFilters}"`,
        );

        const commonParams = `offset=${offset}&languageMap=${languageMap}`;

        const queryParams = contentFilters
            ? `${contentFilters}&${commonParams}`
            : `?${commonParams}`;
        contentAsCode = await lightdashApi({
            method: 'GET',
            url: `/api/v1/projects/${projectId}/code/${type}${queryParams}`,
            body: undefined,
        });
        spinner?.start(
            `Downloaded ${contentAsCode.offset} of ${contentAsCode.total} ${type}`,
        );
        contentAsCode.missingIds.forEach((missingId) => {
            console.warn(styles.warning(`\nNo ${type} with id "${missingId}"`));
        });

        if ('dashboards' in contentAsCode) {
            const outputDir = await createDirForContent(
                contentAsCode.dashboards,
                'dashboards',
                customPath,
            );

            for (const [
                index,
                dashboard,
            ] of contentAsCode.dashboards.entries()) {
                await writeContent(
                    {
                        type: 'dashboard',
                        content: dashboard,
                        translationMap: contentAsCode.languageMap?.[index],
                    },
                    outputDir,
                    languageMap,
                );
            }

            // Extract chart slugs from dashboards
            chartSlugs = contentAsCode.dashboards.reduce<string[]>(
                (acc, dashboard) => {
                    const slugs = dashboard.tiles.map((chart) =>
                        'chartSlug' in chart.properties
                            ? (chart.properties.chartSlug as string)
                            : undefined,
                    );
                    return [
                        ...acc,
                        ...slugs.filter(
                            (slug): slug is string => slug !== undefined,
                        ),
                    ];
                },
                [],
            );
        } else {
            const outputDir = await createDirForContent(
                contentAsCode.charts,
                'charts',
                customPath,
            );
            for (const [index, chart] of contentAsCode.charts.entries()) {
                await writeContent(
                    {
                        type: 'chart',
                        content: chart,
                        translationMap: contentAsCode.languageMap?.[index],
                    },
                    outputDir,
                    languageMap,
                );
            }
        }
        if ('spaces' in contentAsCode) {
            await writeEmbeddedSpaces(contentAsCode.spaces, customPath);
        }
        offset = contentAsCode.offset;
    } while (contentAsCode.offset < contentAsCode.total);

    return [contentAsCode.total, [...new Set(chartSlugs)]];
};

const downloadSqlCharts = async (
    ids: string[],
    projectId: string,
    customPath?: string,
): Promise<number> => {
    const contentFilters = parseContentFilters(ids);
    let offset = 0;
    let total = 0;
    do {
        const commonParams = `offset=${offset}`;
        const queryParams = contentFilters
            ? `${contentFilters}&${commonParams}`
            : `?${commonParams}`;
        const results = (await lightdashApi({
            method: 'GET',
            url: `/api/v1/projects/${projectId}/code/sqlCharts${queryParams}`,
            body: undefined,
        })) as unknown as ApiSqlChartAsCodeListResponse['results'];
        const outputDir = path.join(getDownloadFolder(customPath), 'charts');
        await fs.mkdir(outputDir, { recursive: true });
        for (const sqlChart of results.sqlCharts) {
            await fs.writeFile(
                path.join(outputDir, `${sqlChart.slug}.sql.yml`),
                yaml.dump(
                    { ...sqlChart, contentType: ContentAsCodeType.SQL_CHART },
                    { quotingType: '"' },
                ),
            );
        }
        await writeEmbeddedSpaces(results.spaces, customPath);
        offset = results.offset;
        total = results.total;
    } while (offset < total);
    return total;
};

export const downloadHandler = async (
    options: DownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const projectId = options.project || config.context.project;
    if (!projectId) {
        throw new Error(
            'No project selected. Run lightdash config set-project',
        );
    }

    // For analytics
    let chartTotal: number | undefined;
    let dashboardTotal: number | undefined;
    const start = Date.now();

    await LightdashAnalytics.track({
        event: 'download.started',
        properties: {
            userId: config.user?.userUuid,
            organizationId: config.user?.organizationUuid,
            projectId,
        },
    });
    try {
        // If any filter is provided, we skip those items without filters
        // eg: if a --charts filter is provided, we skip dashboards if no --dashboards filter is provided
        const hasFilters =
            options.charts.length > 0 || options.dashboards.length > 0;

        if (!hasFilters) {
            try {
                const spaceTotal = await downloadSpaces(projectId, options.path);
                console.info(`Downloaded ${spaceTotal} spaces`);
            } catch (error) {
                if (!isSpaceAsCodeFetchError(error)) {
                    throw error;
                }
                console.warn(
                    styles.warning(
                        'Space access is unavailable; continuing with legacy space metadata where available.',
                    ),
                );
            }
        }

        // Download charts
        if (hasFilters && options.charts.length === 0) {
            console.info(
                styles.warning(`No charts filters provided, skipping`),
            );
        } else {
            const spinner = GlobalState.startSpinner(`Downloading charts`);
            [chartTotal] = await downloadContent(
                options.charts,
                'charts',
                projectId,
                options.path,
                options.languageMap,
            );
            spinner.succeed(`Downloaded ${chartTotal} charts`);
            try {
                const sqlTotal = await downloadSqlCharts(
                    options.charts,
                    projectId,
                    options.path,
                );
                if (sqlTotal > 0) {
                    console.info(`Downloaded ${sqlTotal} SQL charts`);
                }
            } catch (error) {
                if (
                    !(
                        error instanceof LightdashError &&
                        error.statusCode === 404
                    )
                ) {
                    throw error;
                }
            }
        }
        // Download dashboards
        if (hasFilters && options.dashboards.length === 0) {
            console.info(
                styles.warning(`No dashboards filters provided, skipping`),
            );
        } else {
            const spinner = GlobalState.startSpinner(`Downloading dashboards`);
            let chartSlugs: string[] = [];

            [dashboardTotal, chartSlugs] = await downloadContent(
                options.dashboards,
                'dashboards',
                projectId,
                options.path,
                options.languageMap,
            );

            spinner.succeed(`Downloaded ${dashboardTotal} dashboards`);

            // If any filter is provided, we download all charts for these dashboard
            // We don't need to do this if we download everything (no filters)
            if (hasFilters && chartSlugs.length > 0) {
                spinner.start(
                    `Downloading ${chartSlugs.length} charts linked to dashboards`,
                );

                const [totalCharts] = await downloadContent(
                    chartSlugs,
                    'charts',
                    projectId,
                    options.path,
                    options.languageMap,
                );

                spinner.succeed(
                    `Downloaded ${totalCharts} charts linked to dashboards`,
                );
            }
        }

        const end = Date.now();

        await LightdashAnalytics.track({
            event: 'download.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                chartsNum: chartTotal,
                dashboardsNum: dashboardTotal,
                timeToCompleted: (end - start) / 1000, // in seconds
            },
        });
        } catch (error) {
        console.error(styles.error(`\nError downloading ${error}`));
        await LightdashAnalytics.track({
            event: 'download.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                error: `${error}`,
            },
        });
        throw error;
    }
};

const getPromoteAction = (action: PromotionAction) => {
    switch (action) {
        case PromotionAction.CREATE:
            return 'created';
        case PromotionAction.UPDATE:
            return 'updated';
        case PromotionAction.DELETE:
            return 'deleted';
        case PromotionAction.NO_CHANGES:
            return 'skipped';
        default:
            assertUnreachable(action, `Unknown promotion action: ${action}`);
    }
    return 'skipped';
};

const storeUploadChanges = (
    changes: Record<string, number>,
    promoteChanges: PromotionChanges,
): Record<string, number> => {
    const getPromoteChanges = (
        resource: 'spaces' | 'charts' | 'dashboards',
    ) => {
        const promotions: { action: PromotionAction }[] =
            promoteChanges[resource];
        return promotions.reduce<Record<string, number>>(
            (acc, promoteChange) => {
                const action = getPromoteAction(promoteChange.action);
                const key = `${resource} ${action}`;
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
            },
            {},
        );
    };

    const updatedChanges: Record<string, number> = {
        ...changes,
    };

    ['spaces', 'charts', 'dashboards'].forEach((resource) => {
        const resourceChanges = getPromoteChanges(
            resource as 'spaces' | 'charts' | 'dashboards',
        );
        Object.entries(resourceChanges).forEach(([key, value]) => {
            updatedChanges[key] = (updatedChanges[key] ?? 0) + value;
        });
    });

    return updatedChanges;
};

const logUploadChanges = (changes: Record<string, number>) => {
    Object.entries(changes).forEach(([key, value]) => {
        console.info(`Total ${key}: ${value} `);
    });
};

/**
 *
 * @param slugs if slugs are provided, we only force upsert the charts/dashboards that match the slugs, if slugs are empty, we upload files that were locally updated
 */
const upsertResources = async <T extends ChartAsCode | DashboardAsCode>(
    type: 'charts' | 'dashboards',
    projectId: string,
    changes: Record<string, number>,
    force: boolean,
    slugs: string[],
    customPath?: string,
    skipSpaceCreate?: boolean,
): Promise<{ changes: Record<string, number>; total: number }> => {
    const config = await getConfig();

    const items = await readCodeFiles<T>(type, customPath);

    console.info(`Found ${items.length} ${type} files`);

    const hasFilter = slugs.length > 0;
    const filteredItems = hasFilter
        ? items.filter((item) => slugs.includes(item.slug))
        : items;
    if (hasFilter) {
        console.info(
            `Filtered ${filteredItems.length} ${type} with slugs: ${slugs.join(
                ', ',
            )}`,
        );
        const missingItems = slugs.filter(
            (slug) => !items.find((item) => item.slug === slug),
        );
        missingItems.forEach((slug) => {
            console.warn(styles.warning(`No ${type} with slug: "${slug}"`));
        });
    }

    for (const item of filteredItems) {
        // If a chart fails to update, we keep updating the rest
        try {
            if (!force && !item.needsUpdating) {
                if (hasFilter) {
                    console.warn(
                        styles.warning(
                            `Skipping ${type} "${item.slug}" with no local changes`,
                        ),
                    );
                }
                GlobalState.debug(
                    `Skipping ${type} "${item.slug}" with no local changes`,
                );
                changes[`${type} skipped`] =
                    (changes[`${type} skipped`] ?? 0) + 1;
                // eslint-disable-next-line no-continue
                continue;
            }
            GlobalState.debug(`Upserting ${type} ${item.slug}`);
            const upsertData = await lightdashApi<
                ApiChartAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/code/${type}/${item.slug}`,
                body: JSON.stringify({
                    ...item,
                    skipSpaceCreate,
                    force,
                    publicSpaceCreate: false,
                }),
            });

            GlobalState.debug(
                `${type} "${item.name}": ${upsertData[type]?.[0].action}`,
            );

            changes = storeUploadChanges(changes, upsertData);
        } catch (error: unknown) {
            if (
                error instanceof LightdashError &&
                error.name === 'NotFoundError' &&
                skipSpaceCreate
            ) {
                console.warn(
                    styles.warning(
                        `Skipping ${type} "${item.slug}" because space "${item.spaceSlug}" does not exist and --skip-space-create is true`,
                    ),
                );
                changes[`${type} skipped`] =
                    (changes[`${type} skipped`] ?? 0) + 1;
            } else {
                changes[`${type} with errors`] =
                    (changes[`${type} with errors`] ?? 0) + 1;
                console.error(
                    styles.error(
                        `Error upserting ${type}: ${getErrorMessage(error)}`,
                    ),
                );

                await LightdashAnalytics.track({
                    event: 'download.error',
                    properties: {
                        userId: config.user?.userUuid,
                        organizationId: config.user?.organizationUuid,
                        projectId,
                        type,
                        error: getErrorMessage(error),
                    },
                });
            }
        }
    }
    return { changes, total: filteredItems.length };
};

const readSqlCodeFiles = async (
    customPath?: string,
): Promise<(SqlChartAsCode & { needsUpdating: boolean })[]> => {
    const inputDir = path.join(getDownloadFolder(customPath), 'charts');
    try {
        const files = (await fs.readdir(inputDir)).filter(isSqlChartFile);
        const items: (SqlChartAsCode & { needsUpdating: boolean })[] = [];
        for (const file of files) {
            const filePath = path.join(inputDir, file);
            const item = yaml.load(await fs.readFile(filePath, 'utf-8')) as SqlChartAsCode;
            const fileUpdatedAt = (await fs.stat(filePath)).mtime;
            const downloadedAt = item.downloadedAt
                ? new Date(item.downloadedAt)
                : undefined;
            const needsUpdating =
                downloadedAt &&
                Math.abs(fileUpdatedAt.getTime() - downloadedAt.getTime()) >
                    30000;
            items.push({
                ...item,
                updatedAt: needsUpdating ? fileUpdatedAt : item.updatedAt,
                needsUpdating: needsUpdating ?? true,
            });
        }
        return items;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

const upsertSqlResources = async (
    projectId: string,
    changes: Record<string, number>,
    force: boolean,
    slugs: string[],
    customPath?: string,
    skipSpaceCreate?: boolean,
): Promise<{ changes: Record<string, number>; total: number }> => {
    const items = await readSqlCodeFiles(customPath);
    const hasFilter = slugs.length > 0;
    const filteredItems = hasFilter
        ? items.filter((item) => slugs.includes(item.slug))
        : items;

    for (const item of filteredItems) {
        try {
            if (!force && !item.needsUpdating) {
                changes['charts skipped'] = (changes['charts skipped'] ?? 0) + 1;
                // eslint-disable-next-line no-continue
                continue;
            }
            const upsertData = await lightdashApi<
                ApiChartAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/code/sqlCharts/${item.slug}`,
                body: JSON.stringify({
                    ...item,
                    skipSpaceCreate,
                    force,
                    publicSpaceCreate: false,
                }),
            });
            changes = storeUploadChanges(changes, upsertData);
        } catch (error: unknown) {
            changes['charts with errors'] =
                (changes['charts with errors'] ?? 0) + 1;
            console.error(
                styles.error(
                    `Error upserting SQL chart: ${getErrorMessage(error)}`,
                ),
            );
        }
    }

    return { changes, total: filteredItems.length };
};

const getDashboardChartSlugs = async (
    dashboardSlugs: string[],
    customPath?: string,
) => {
    const dashboardItems = await readCodeFiles<DashboardAsCode>(
        'dashboards',
        customPath,
    );

    const filteredDashboardItems =
        dashboardSlugs.length > 0
            ? dashboardItems.filter((dashboard) =>
                  dashboardSlugs.includes(dashboard.slug),
              )
            : dashboardItems;

    return filteredDashboardItems.reduce<string[]>((acc, dashboard) => {
        const dashboardChartSlugs = dashboard.tiles
            .map((tile) =>
                'chartSlug' in tile.properties
                    ? tile.properties.chartSlug
                    : undefined,
            )
            .filter(
                (dashboardChartSlug): dashboardChartSlug is string =>
                    !!dashboardChartSlug,
            );

        return [...acc, ...dashboardChartSlugs];
    }, []);
};

export const uploadHandler = async (
    options: DownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();
    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const projectId = options.project || config.context.project;
    if (!projectId) {
        throw new Error(
            'No project selected. Run lightdash config set-project',
        );
    }

    let changes: Record<string, number> = {};
    // For analytics
    let chartTotal: number | undefined;
    let dashboardTotal: number | undefined;
    const start = Date.now();

    await LightdashAnalytics.track({
        event: 'upload.started',
        properties: {
            userId: config.user?.userUuid,
            organizationId: config.user?.organizationUuid,
            projectId,
        },
    });

    try {
        // If any filter is provided, we skip those items without filters
        // eg: if a --charts filter is provided, we skip dashboards if no --dashboards filter is provided
        const hasFilters =
            options.charts.length > 0 || options.dashboards.length > 0;

        // Always include the charts from dashboards if includeCharts is true regardless of the charts filters
        const chartSlugs = options.includeCharts
            ? Array.from(
                  new Set([
                      ...options.charts,
                      ...(await getDashboardChartSlugs(
                          options.dashboards,
                          options.path,
                      )),
                  ]),
              )
            : options.charts;

        if (!hasFilters) {
            const spaceCount = await uploadSpaces(
                projectId,
                options.skipSpaceCreate,
                options.path,
            );
            if (spaceCount > 0) {
                console.info(`Uploaded ${spaceCount} spaces`);
            }
        }

        if (hasFilters && chartSlugs.length === 0) {
            console.info(
                styles.warning(`No charts filters provided, skipping`),
            );
        } else {
            const { changes: chartChanges, total } =
                await upsertResources<ChartAsCode>(
                    'charts',
                    projectId,
                    changes,
                    options.force,
                    chartSlugs,
                    options.path,
                    options.skipSpaceCreate,
                );
            changes = chartChanges;
            chartTotal = total;
            const { changes: sqlChanges, total: sqlTotal } =
                await upsertSqlResources(
                    projectId,
                    changes,
                    options.force,
                    chartSlugs,
                    options.path,
                    options.skipSpaceCreate,
                );
            changes = sqlChanges;
            chartTotal = (chartTotal ?? 0) + sqlTotal;
        }

        if (hasFilters && options.dashboards.length === 0) {
            console.info(
                styles.warning(`No dashboard filters provided, skipping`),
            );
        } else {
            const { changes: dashboardChanges, total } =
                await upsertResources<DashboardAsCode>(
                    'dashboards',
                    projectId,
                    changes,
                    options.force,
                    options.dashboards,
                    options.path,
                    options.skipSpaceCreate,
                );
            changes = dashboardChanges;
            dashboardTotal = total;
        }
        const end = Date.now();

        await LightdashAnalytics.track({
            event: 'upload.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                chartsNum: chartTotal,
                dashboardsNum: dashboardTotal,
                timeToCompleted: (end - start) / 1000, // in seconds
            },
        });

        logUploadChanges(changes);
    } catch (error) {
        console.error(
            styles.error(`\nError uploading: ${getErrorMessage(error)}`),
        );
        await LightdashAnalytics.track({
            event: 'download.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                error: getErrorMessage(error),
            },
        });
        throw error;
    }
};
