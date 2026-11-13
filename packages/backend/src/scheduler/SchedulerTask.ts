import {
    type Account as AccountType,
    AnyType,
    CompileProjectPayload,
    NO_CHARTS_TO_EXPORT_MESSAGE,
    CreateProject,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    CreateSchedulerTarget,
    DashboardFilterRule,
    DashboardFilters,
    DashboardParameterValue,
    type DownloadAsyncQueryResultsPayload,
    DownloadCsvPayload,
    DownloadFileType,
    EmailNotificationPayload,
    ExportCsvDashboardPayload,
    type ExportContentPayload,
    FeatureFlags,
    FieldReferenceError,
    ForbiddenError,
    GsheetsNotificationPayload,
    LightdashPage,
    MAX_SAFE_INTEGER,
    MissingConfigError,
    type MsTeamsNotificationPayload,
    NotEnoughResults,
    NotificationFrequency,
    NotificationPayloadBase,
    ParameterError,
    ParametersValuesMap,
    QueryExecutionContext,
    ReadFileError,
    RenameResourcesPayload,
    ReplaceCustomFields,
    ReplaceCustomFieldsPayload,
    ReplaceableCustomFields,
    type RunQueryTags,
    SCHEDULER_TASKS,
    SavedChartDAO,
    ScheduledDeliveryPayload,
    SchedulerAndTargets,
    SchedulerCreateProjectWithCompilePayload,
    SchedulerFormat,
    type SchedulerIndexCatalogJobPayload,
    SchedulerJobStatus,
    SchedulerLog,
    SessionUser,
    SlackInstallationNotFoundError,
    SlackNotificationPayload,
    SqlRunnerPayload,
    SqlRunnerPivotQueryPayload,
    ThresholdOperator,
    ThresholdOptions,
    UnexpectedGoogleSheetsError,
    UnexpectedServerError,
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
    VizColumn,
    applyDimensionOverrides,
    assertUnreachable,
    convertReplaceableFieldMatchMapToReplaceCustomFields,
    formatRows,
    friendlyName,
    getColumnOrderFromVizTableConfig,
    getCustomLabelsFromTableConfig,
    getCustomLabelsFromVizTableConfig,
    getDashboardFiltersForTab,
    getDashboardFiltersForTile,
    getErrorMessage,
    getExportFilterColumns,
    getFulfilledValues,
    getHiddenFieldsFromVizTableConfig,
    getHiddenTableFields,
    getHumanReadableCronExpression,
    getItemMap,
    getPivotConfig,
    getRequestMethod,
    getSchedulerUuid,
    isChartValidationError,
    isCreateScheduler,
    isCreateSchedulerMsTeamsTarget,
    isCreateSchedulerSlackTarget,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardSqlChartTile,
    isTileInSelectedTabs,
    isDashboardValidationError,
    isSchedulerCsvOptions,
    isSchedulerGsheetsOptions,
    isSchedulerImageOptions,
    isTableChartConfig,
    isVizTableConfig,
    operatorActionValue,
    pivotResultsAsCsv,
    setUuidParam,
    type DateGranularity,
    type Account as QueryAccount,
    type ExportFilterColumn,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import archiver from 'archiver';
import fsSync from 'fs';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { Readable } from 'stream';
import {
    dedupeZipEntryNames,
    sanitizeGenericFileName,
} from '../utils/FileDownloadUtils/FileDownloadUtils';
import { WorkbookExportHelper } from '../services/ExcelService/WorkbookExportHelper';
import slackifyMarkdown from 'slackify-markdown';
import {
    DownloadCsv,
    LightdashAnalytics,
    parseAnalyticsLimit,
} from '../analytics/LightdashAnalytics';
import * as Account from '../auth/account';
import { S3Client } from '../clients/Aws/S3Client';
import EmailClient from '../clients/EmailClient/EmailClient';
import { GoogleDriveClient } from '../clients/Google/GoogleDriveClient';
import { MicrosoftTeamsClient } from '../clients/MicrosoftTeams/MicrosoftTeamsClient';
import { SlackClient } from '../clients/Slack/SlackClient';
import {
    getChartAndDashboardBlocks,
    getChartCsvResultsBlocks,
    getChartThresholdAlertBlocks,
    getDashboardCsvResultsBlocks,
    getNotificationChannelErrorBlocks,
} from '../clients/Slack/SlackMessageBlocks';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { isFeatureFlagEnabled } from '../postHog';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import type { CatalogService } from '../services/CatalogService/CatalogService';
import {
    CsvService,
    getSchedulerCsvLimit,
} from '../services/CsvService/CsvService';
import { DashboardService } from '../services/DashboardService/DashboardService';
import { ExcelService } from '../services/ExcelService/ExcelService';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { RenameService } from '../services/RenameService/RenameService';
import { SchedulerService } from '../services/SchedulerService/SchedulerService';
import {
    ScreenshotContext,
    UnfurlService,
} from '../services/UnfurlService/UnfurlService';
import { UserService } from '../services/UserService';
import { ValidationService } from '../services/ValidationService/ValidationService';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { mapWithConcurrencyLimit } from '../utils/mapWithConcurrencyLimit';
import { SchedulerClient } from './SchedulerClient';

export type SchedulerTaskArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    csvService: CsvService;
    dashboardService: DashboardService;
    projectService: ProjectService;
    schedulerService: SchedulerService;
    unfurlService: UnfurlService;
    userService: UserService;
    validationService: ValidationService;
    emailClient: EmailClient;
    googleDriveClient: GoogleDriveClient;
    s3Client: S3Client;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    catalogService: CatalogService;
    encryptionUtil: EncryptionUtil;
    msTeamsClient: MicrosoftTeamsClient;
    renameService: RenameService;
    asyncQueryService: AsyncQueryService;
};

/**
 * 图表实际会出现在导出表里的字段：用于判断某个筛选器是否已经在列里，
 * 避免同一字段出现两次（筛选器常量列 + 数据列）。隐藏字段不计入。
 */
export const getExportedFieldIds = ({
    metricQuery,
    hiddenFields,
}: {
    metricQuery: MetricQuery;
    hiddenFields: string[];
}): string[] =>
    [
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.tableCalculations.map((calculation) => calculation.name),
        ...(metricQuery.customDimensions ?? []).map(
            (customDimension) => customDimension.id,
        ),
    ].filter((fieldId) => !hiddenFields.includes(fieldId));

/** 导出筛选器列需要的 explore 信息：字段标签 + 该 explore 的表（用于收敛筛选器） */
type ExportExploreInfo = {
    itemMap: ItemsMap;
    tables: string[];
};

export default class SchedulerTask {
    protected readonly lightdashConfig: LightdashConfig;

    protected readonly analytics: LightdashAnalytics;

    protected readonly csvService: CsvService;

    protected readonly dashboardService: DashboardService;

    protected readonly projectService: ProjectService;

    protected readonly schedulerService: SchedulerService;

    protected readonly unfurlService: UnfurlService;

    protected readonly userService: UserService;

    protected readonly validationService: ValidationService;

    protected readonly emailClient: EmailClient;

    protected readonly googleDriveClient: GoogleDriveClient;

    protected readonly s3Client: S3Client;

    protected readonly schedulerClient: SchedulerClient;

    protected readonly slackClient: SlackClient;

    private readonly catalogService: CatalogService;

    private readonly encryptionUtil: EncryptionUtil;

    protected readonly msTeamsClient: MicrosoftTeamsClient;

    private readonly renameService: RenameService;

    protected readonly asyncQueryService: AsyncQueryService;

    constructor(args: SchedulerTaskArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.csvService = args.csvService;
        this.dashboardService = args.dashboardService;
        this.projectService = args.projectService;
        this.schedulerService = args.schedulerService;
        this.unfurlService = args.unfurlService;
        this.userService = args.userService;
        this.validationService = args.validationService;
        this.emailClient = args.emailClient;
        this.googleDriveClient = args.googleDriveClient;
        this.s3Client = args.s3Client;
        this.schedulerClient = args.schedulerClient;
        this.slackClient = args.slackClient;
        this.catalogService = args.catalogService;
        this.encryptionUtil = args.encryptionUtil;
        this.msTeamsClient = args.msTeamsClient;
        this.renameService = args.renameService;
        this.asyncQueryService = args.asyncQueryService;
    }

    private static getCsvOptions(
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
    ) {
        return isSchedulerCsvOptions(scheduler.options)
            ? scheduler.options
            : undefined;
    }

    protected async getChartOrDashboard(
        chartUuid: string | null,
        dashboardUuid: string | null,
        schedulerUuid: string | undefined,
        context: DownloadCsv['properties']['context'],
        selectedTabs: string[] | null,
    ) {
        if (chartUuid) {
            const chart =
                await this.schedulerService.savedChartModel.getSummary(
                    chartUuid,
                );
            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`,
                minimalUrl: `${this.lightdashConfig.headlessBrowser.internalLightdashHost}/minimal/projects/${chart.projectUuid}/saved/${chartUuid}?context=${context}`,
                details: {
                    name: chart.name,
                    description: chart.description,
                },
                pageType: LightdashPage.CHART,
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
            };
        }

        if (dashboardUuid) {
            const dashboard =
                await this.schedulerService.dashboardModel.getByIdOrSlug(
                    dashboardUuid,
                );

            const queryParams = new URLSearchParams();
            if (schedulerUuid) queryParams.set('schedulerUuid', schedulerUuid);
            if (selectedTabs)
                queryParams.set('selectedTabs', JSON.stringify(selectedTabs));
            if (context) queryParams.set('context', context);

            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view`,
                minimalUrl: `${
                    this.lightdashConfig.headlessBrowser.internalLightdashHost
                }/minimal/projects/${
                    dashboard.projectUuid
                }/dashboards/${dashboardUuid}${
                    queryParams.toString() ? `?${queryParams.toString()}` : ''
                }`,
                details: {
                    name: dashboard.name,
                    description: dashboard.description,
                },
                pageType: LightdashPage.DASHBOARD,
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            };
        }

        throw new Error("Chart or dashboard can't be both undefined");
    }

    protected async getNotificationPageData(
        scheduler: CreateSchedulerAndTargets,
        jobId: string,
        /** 每 Tab 实际生效的筛选器（一次性导出时由前端带上来；交付任务缺省） */
        tabFilters?: Record<string, DashboardFilters>,
    ): Promise<NotificationPayloadBase['page']> {
        const {
            createdBy: userUuid,
            savedChartUuid,
            dashboardUuid,
            format,
            options,
        } = scheduler;

        let imageUrl;
        let csvUrl;
        let csvUrls;
        let pdfFile;
        // 看板导出部分失败清单（tile 查询失败 / 合并失败 / 整 Tab 被跳过）：
        // 仅 XLSX dashboard 分支会填充；空时不写入返回值，保持旧 payload 形态
        let failedExports: NotificationPayloadBase['page']['failedExports'];

        const schedulerUuid =
            'schedulerUuid' in scheduler &&
            typeof scheduler.schedulerUuid === 'string'
                ? scheduler.schedulerUuid
                : undefined;

        const sendNowSchedulerFilters =
            !schedulerUuid && isDashboardScheduler(scheduler)
                ? scheduler.filters
                : undefined;

        const sendNowSchedulerParameters =
            !schedulerUuid && isDashboardScheduler(scheduler)
                ? scheduler.parameters
                : undefined;

        const selectedTabs = isDashboardScheduler(scheduler)
            ? scheduler.selectedTabs
            : null;

        const context =
            scheduler.thresholds === undefined ||
            scheduler.thresholds.length === 0
                ? QueryExecutionContext.SCHEDULED_DELIVERY
                : QueryExecutionContext.ALERT;

        const {
            url,
            minimalUrl,
            pageType,
            details,
            organizationUuid,
            projectUuid,
        } = await this.getChartOrDashboard(
            savedChartUuid,
            dashboardUuid,
            schedulerUuid,
            context,
            selectedTabs,
        );

        const schedulerUuidParam = setUuidParam(
            'scheduler_uuid',
            schedulerUuid,
        );
        const deliveryUrl = savedChartUuid
            ? `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/saved/${savedChartUuid}/view?${schedulerUuidParam}`
            : `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/dashboards/${dashboardUuid}/view?${schedulerUuidParam}`;
        switch (format) {
            case SchedulerFormat.IMAGE:
                try {
                    const imageId = `slack-image-notification-${nanoid()}`;
                    const imageOptions = isSchedulerImageOptions(
                        scheduler.options,
                    )
                        ? scheduler.options
                        : undefined;
                    const unfurlImage = await this.unfurlService.unfurlImage({
                        url: minimalUrl,
                        lightdashPage: pageType,
                        imageId,
                        authUserUuid: userUuid,
                        withPdf: imageOptions?.withPdf,
                        gridWidth:
                            isDashboardScheduler(scheduler) &&
                            scheduler.customViewportWidth
                                ? scheduler.customViewportWidth
                                : undefined,
                        context: ScreenshotContext.SCHEDULED_DELIVERY,
                        contextId: jobId,
                        selectedTabs,
                        sendNowSchedulerFilters,
                        sendNowSchedulerParameters,
                    });
                    if (unfurlImage.imageUrl === undefined) {
                        throw new Error('Unable to unfurl image');
                    }
                    pdfFile = unfurlImage.pdfFile;
                    imageUrl = unfurlImage.imageUrl;
                } catch (error) {
                    if (this.slackClient.isEnabled) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    error,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    throw error;
                }
                break;
            case SchedulerFormat.GSHEETS:
                // We don't generate CSV files for Google sheets on handleNotification task,
                // instead we directly upload the data from the row results in the uploadGsheets task
                throw new Error("Don't fetch csv for gsheets");
            case SchedulerFormat.XLSX: {
                const sessionUser = await this.userService.getSessionByUserUuid(
                    userUuid,
                );
                const account = Account.fromSession(sessionUser);
                const csvOptions = isSchedulerCsvOptions(options)
                    ? options
                    : undefined;
                const baseAnalyticsProperties: DownloadCsv['properties'] = {
                    jobId,
                    userId: userUuid,
                    organizationId: account.organization.organizationUuid,
                    projectId: projectUuid,
                    fileType: SchedulerFormat.XLSX,
                    values: csvOptions?.formatted ? 'formatted' : 'raw',
                    limit: parseAnalyticsLimit(csvOptions?.limit),
                    storage: this.s3Client.isEnabled() ? 's3' : 'local',
                    context,
                };

                // 部分失败收集：tile 查询失败（环节 ①）、合并期单文件失败（
                // 环节 ②）、整 Tab 被跳过（环节 ③）都记到这里，随 page 带出
                const failedExportList: NonNullable<
                    NotificationPayloadBase['page']['failedExports']
                > = [];

                try {
                    if (savedChartUuid) {
                        this.analytics.trackAccount(account, {
                            event: 'download_results.started',
                            userId: account.user.id,
                            properties: baseAnalyticsProperties,
                        });
                        const query =
                            await this.asyncQueryService.executeAsyncSavedChartQuery(
                                {
                                    account,
                                    projectUuid,
                                    chartUuid: savedChartUuid,
                                    invalidateCache: true,
                                    context:
                                        QueryExecutionContext.SCHEDULED_DELIVERY,
                                    limit: getSchedulerCsvLimit(csvOptions),
                                },
                            );

                        const chart =
                            await this.schedulerService.savedChartModel.get(
                                savedChartUuid,
                            );
                        const downloadResult =
                            await this.asyncQueryService.downloadSyncQueryResults(
                                {
                                    account,
                                    projectUuid,
                                    queryUuid: query.queryUuid,
                                    type: DownloadFileType.XLSX,
                                    onlyRaw: csvOptions?.formatted === false,
                                    customLabels:
                                        getCustomLabelsFromTableConfig(
                                            chart.chartConfig.config,
                                        ),
                                    hiddenFields: getHiddenTableFields(
                                        chart.chartConfig,
                                    ),
                                    pivotConfig: getPivotConfig(chart),
                                    columnOrder: chart.tableConfig.columnOrder,
                                },
                            );
                        csvUrl = {
                            filename: ExcelService.generateFileId(chart.name),
                            path: downloadResult.fileUrl,
                            localPath:
                            ('localPath' in downloadResult
                                ? downloadResult.localPath
                                : undefined) ?? downloadResult.fileUrl,
                            truncated:
                                'truncated' in downloadResult
                                    ? downloadResult.truncated
                                    : false,
                        };
                        this.analytics.trackAccount(account, {
                            event: 'download_results.completed',
                            userId: account.user.id,
                            properties: baseAnalyticsProperties,
                        });
                    } else if (dashboardUuid) {
                        this.analytics.trackAccount(account, {
                            event: 'download_results.started',
                            userId: account.user.id,
                            properties: baseAnalyticsProperties,
                        });
                        const dashboard =
                            await this.schedulerService.dashboardModel.getByIdOrSlug(
                                dashboardUuid,
                            );

                        const dashboardFilters = dashboard.filters;
                        const schedulerFilters = isDashboardScheduler(scheduler)
                            ? scheduler.filters
                            : undefined;

                        if (schedulerFilters) {
                            dashboardFilters.dimensions =
                                applyDimensionOverrides(
                                    dashboard.filters,
                                    schedulerFilters,
                                );
                        }

                        /**
                         * 某个 Tab 实际生效的筛选器。
                         * 一次性导出会带上页面当前取值（已含全局层）；
                         * 定时交付没有前端状态，按看板保存的定义合并。
                         */
                        const getFiltersForTab = (
                            tabUuid: string | null,
                        ): DashboardFilters => {
                            if (!tabUuid) return dashboardFilters;
                            const provided = tabFilters?.[tabUuid];
                            if (provided) return provided;
                            return getDashboardFiltersForTab({
                                dashboard,
                                tabUuid,
                                globalFilters: dashboardFilters,
                            });
                        };
                        // 同一张 explore 只拉一次，用于把筛选器列名换成字段名
                        const exploreCache = new Map<string, ExportExploreInfo>();

                        const dashboardParameters = dashboard.parameters || {};
                        const schedulerParameters = isDashboardScheduler(
                            scheduler,
                        )
                            ? scheduler.parameters
                            : undefined;

                        // Convert dashboard parameters to ParametersValuesMap format
                        const convertedDashboardParameters: ParametersValuesMap =
                            Object.fromEntries(
                                Object.entries(dashboardParameters).map(
                                    ([key, param]) => [key, param.value],
                                ),
                            );

                        // Merge scheduler parameters with dashboard parameters (scheduler parameters override)
                        const finalParameters: ParametersValuesMap = {
                            ...convertedDashboardParameters,
                            ...schedulerParameters,
                        };

                        // 每张图先落本地，再按 Tab 合并；省掉每张图一次 S3 上传 + 下载
                        const keepTempFilesForMerge = true;

                        const tabNameByUuid = new Map(
                            (dashboard.tabs ?? []).map((tab) => [
                                tab.uuid,
                                tab.name,
                            ]),
                        );
                        const chartTileUuidsWithChartUuids = dashboard.tiles
                            .filter(isDashboardChartTileType)
                            .filter((tile) => tile.properties.savedChartUuid)
                            .filter((tile) =>
                                isTileInSelectedTabs(tile, selectedTabs),
                            )
                            .map((tile) => ({
                                tileUuid: tile.uuid,
                                chartUuid: tile.properties.savedChartUuid!,
                                tabUuid: tile.tabUuid ?? null,
                                tabName: tile.tabUuid
                                    ? tabNameByUuid.get(tile.tabUuid)
                                    : undefined,
                            }));
                        const sqlChartTileUuids = dashboard.tiles
                            .filter(isDashboardSqlChartTile)
                            .filter((tile) => !!tile.properties.savedSqlUuid)
                            // 与 chart tile 一致：只导出选中 Tab 下的图
                            .filter((tile) =>
                                isTileInSelectedTabs(tile, selectedTabs),
                            )
                            .map((tile) => ({
                                tileUuid: tile.uuid,
                                chartUuid: tile.properties.savedSqlUuid!,
                                tabUuid: tile.tabUuid ?? null,
                                tabName: tile.tabUuid
                                    ? tabNameByUuid.get(tile.tabUuid)
                                    : undefined,
                            }));
                        const totalExportTiles =
                            chartTileUuidsWithChartUuids.length +
                            sqlChartTileUuids.length;
                        if (totalExportTiles === 0) {
                            throw new UnexpectedServerError(
                                NO_CHARTS_TO_EXPORT_MESSAGE,
                            );
                        }
                        let settledExportTiles = 0;
                        const onTileSettled = () => {
                            settledExportTiles += 1;
                            void this.reportExportProgress(jobId, {
                                createdByUserUuid: userUuid,
                                projectUuid,
                                organizationUuid,
                                progress: {
                                    done: settledExportTiles,
                                    total: totalExportTiles,
                                },
                            });
                        };
                        // 控制并发：看板一次几十张图，不能同时打满数仓
                        const exportConcurrency = Math.min(
                            3,
                            Math.max(1, totalExportTiles),
                        );

                        // 限流器要的是「tile 描述 + mapper 函数」：先 map(async …) 会立刻
                        // 起跑全部查询，再交给限流器只是排队 await 已在跑的 promise
                        type DashboardExportTile = {
                            tileUuid: string;
                            chartUuid: string;
                            tabUuid: string | null;
                            tabName: string | undefined;
                        };
                        type DashboardExportTileWork =
                            | { kind: 'chart'; tile: DashboardExportTile }
                            | { kind: 'sqlChart'; tile: DashboardExportTile };

                        const exportChartTile = async ({
                            chartUuid,
                            tileUuid,
                            tabUuid,
                            tabName,
                        }: DashboardExportTile) => {
                            // 先取图表定义：筛选器列名要靠它的 explore 解析
                            const chart =
                                await this.schedulerService.savedChartModel.get(
                                    chartUuid,
                                );
                            const tileFilters = getDashboardFiltersForTile({
                                filters: getFiltersForTab(tabUuid),
                                tileUuid,
                            });
                            const leadingColumns =
                                await this.getExportFilterColumnsForTile({
                                    filters: tileFilters,
                                    exploreCache,
                                    timezone: this.lightdashConfig.query.timezone,
                                    locale: csvOptions?.locale,
                                    account,
                                    projectUuid,
                                    tableName: chart.tableName,
                                    metricQuery: chart.metricQuery,
                                    // 图表自己已经导出的列：命中同字段的筛选器不再重复加列
                                    exportedFieldIds: getExportedFieldIds({
                                        metricQuery: chart.metricQuery,
                                        hiddenFields: getHiddenTableFields(
                                            chart.chartConfig,
                                        ),
                                    }),
                                });
                            const chartLimit =
                                getSchedulerCsvLimit(csvOptions);
                            const query =
                                await this.asyncQueryService.executeAsyncDashboardChartQuery(
                                    {
                                        account,
                                        projectUuid,
                                        chartUuid,
                                        invalidateCache: true,
                                        context:
                                            QueryExecutionContext.SCHEDULED_DELIVERY,
                                        dashboardUuid,
                                        // 页面按「全局 + 当前 Tab」合并后再按 tile 收敛
                                        dashboardFilters: tileFilters,
                                        dashboardSorts: [],
                                        parameters: finalParameters,
                                        limit: chartLimit,
                                    },
                                );
                            const downloadResult =
                                await this.asyncQueryService.downloadSyncQueryResults(
                                    {
                                        account,
                                        projectUuid,
                                        queryUuid: query.queryUuid,
                                        type: DownloadFileType.XLSX,
                                        keepTempFile: keepTempFilesForMerge,
                                        leadingColumns,
                                        onlyRaw:
                                            csvOptions?.formatted === false,
                                        customLabels:
                                            getCustomLabelsFromTableConfig(
                                                chart.chartConfig.config,
                                            ),
                                        hiddenFields: getHiddenTableFields(
                                            chart.chartConfig,
                                        ),
                                        pivotConfig: getPivotConfig(chart),
                                        columnOrder:
                                            chart.tableConfig.columnOrder,
                                    },
                                );
                            return {
                                filename: chart.name,
                                path: downloadResult.fileUrl,
                                localPath:
                                    ('localPath' in downloadResult
                                        ? downloadResult.localPath
                                        : undefined) ??
                                    downloadResult.fileUrl,
                                truncated:
                                    'truncated' in downloadResult
                                        ? downloadResult.truncated
                                        : false,
                                tabUuid,
                                tabName,
                            };
                        };

                        const exportSqlChartTile = async ({
                            chartUuid,
                            tileUuid,
                            tabUuid,
                            tabName,
                        }: DashboardExportTile) => {
                            const sqlLimit = getSchedulerCsvLimit(csvOptions);
                            // SQL 图不接收看板筛选器（查询侧要求 tileTargets 显式绑定 SQL 列，
                            // 一般都不满足），所以不写筛选器列，避免导出的列与实际过滤不符
                            const tileFilters = getFiltersForTab(tabUuid);
                            const leadingColumns: ExportFilterColumn[] = [];
                            const query =
                                await this.asyncQueryService.executeAsyncDashboardSqlChartQuery(
                                    {
                                        account,
                                        projectUuid,
                                        savedSqlUuid: chartUuid,
                                        invalidateCache: true,
                                        context:
                                            QueryExecutionContext.SCHEDULED_DELIVERY,
                                        dashboardUuid,
                                        tileUuid,
                                        dashboardFilters: tileFilters,
                                        dashboardSorts: [],
                                        parameters: finalParameters,
                                        limit:
                                            sqlLimit === null
                                                ? MAX_SAFE_INTEGER
                                                : sqlLimit,
                                    },
                                );
                            const chart =
                                await this.asyncQueryService.savedSqlModel.getByUuid(
                                    chartUuid,
                                    {
                                        projectUuid,
                                    },
                                );
                            const downloadResult =
                                await this.asyncQueryService.downloadSyncQueryResults(
                                    {
                                        account,
                                        projectUuid,
                                        queryUuid: query.queryUuid,
                                        type: DownloadFileType.XLSX,
                                        keepTempFile: keepTempFilesForMerge,
                                        leadingColumns,
                                        onlyRaw:
                                            csvOptions?.formatted === false,
                                        customLabels:
                                            getCustomLabelsFromVizTableConfig(
                                                isVizTableConfig(chart.config)
                                                    ? chart.config
                                                    : undefined,
                                            ),
                                        hiddenFields:
                                            getHiddenFieldsFromVizTableConfig(
                                                isVizTableConfig(chart.config)
                                                    ? chart.config
                                                    : undefined,
                                            ),
                                        columnOrder:
                                            getColumnOrderFromVizTableConfig(
                                                isVizTableConfig(chart.config)
                                                    ? chart.config
                                                    : undefined,
                                            ),
                                    },
                                );
                            return {
                                filename: chart.name,
                                path: downloadResult.fileUrl,
                                localPath:
                                    ('localPath' in downloadResult
                                        ? downloadResult.localPath
                                        : undefined) ??
                                    downloadResult.fileUrl,
                                truncated:
                                    'truncated' in downloadResult
                                        ? downloadResult.truncated
                                        : false,
                                tabUuid,
                                tabName,
                            };
                        };

                        // chart 与 sql 图合成一个 work 列表、用同一个限流器跑，
                        // 避免两批各自起跑后叠加打满数仓。
                        // 结果顺序 = work 列表顺序（先 chart 后 sql，各自保持输入顺序）。
                        const exportTileWork: DashboardExportTileWork[] = [
                            ...chartTileUuidsWithChartUuids.map(
                                (tile): DashboardExportTileWork => ({
                                    kind: 'chart',
                                    tile,
                                }),
                            ),
                            ...sqlChartTileUuids.map(
                                (tile): DashboardExportTileWork => ({
                                    kind: 'sqlChart',
                                    tile,
                                }),
                            ),
                        ];
                        const exportResults = await mapWithConcurrencyLimit(
                            exportTileWork,
                            exportConcurrency,
                            (work) =>
                                work.kind === 'chart'
                                    ? exportChartTile(work.tile)
                                    : exportSqlChartTile(work.tile),
                            onTileSettled,
                        );
                        csvUrls = exportResults.flatMap((result) =>
                            result.status === 'fulfilled' ? [result.value] : [],
                        );
                        // 环节 ①：rejected 的 tile 不再静默丢弃，逐个记录失败原因。
                        // 失败路径没有 chart.name（名字在成功路径才解析），补一次查询；
                        // 查不到（图表被删/无权限）时退化为 chartUuid 前缀
                        // eslint-disable-next-line no-restricted-syntax
                        for (const result of exportResults) {
                            if (result.status === 'fulfilled') continue;
                            const reason = getErrorMessage(result.reason);
                            const { kind, tile } = result.item;
                            const failureName =
                                // eslint-disable-next-line no-await-in-loop
                                await this.getFailedTileName(
                                    kind,
                                    tile.chartUuid,
                                    projectUuid,
                                );
                            Logger.warn(
                                `Failed to export dashboard ${kind} tile "${failureName}" (${tile.chartUuid}) on scheduled delivery: ${reason}`,
                            );
                            failedExportList.push({
                                filename: failureName,
                                reason,
                            });
                        }

                        // 记录合并前的 tile 数：workbook / per-tab 合并后 csvUrls 只剩
                        // 1 条（或每 Tab 1 条），不能再用 csvUrls.length 当图数
                        const numExportedCharts = csvUrls.length;

                        // 唯一产物形态：每个 Tab 一个 xlsx，合成一个 zip
                        csvUrls = await this.buildPerTabWorkbookCsvUrls({
                            files: csvUrls,
                            dashboardName: dashboard.name,
                            locale: csvOptions?.locale,
                            onFileError: (filename, reason) => {
                                failedExportList.push({ filename, reason });
                            },
                            onTabSkipped: (tabName, filenames) => {
                                filenames.forEach((filename) =>
                                    failedExportList.push({
                                        filename,
                                        reason: `No sheets could be generated for tab "${tabName}"`,
                                    }),
                                );
                            },
                        });

                        failedExports = failedExportList;

                        this.analytics.trackAccount(account, {
                            event: 'download_results.completed',
                            userId: account.user.id,
                            properties: {
                                ...baseAnalyticsProperties,
                                numCharts: numExportedCharts,
                            },
                        });
                    } else {
                        throw new Error('Not implemented');
                    }
                } catch (e) {
                    Logger.error(
                        `Unable to download XLSX on scheduled task: ${e}`,
                    );

                    if (this.slackClient.isEnabled) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    e,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    this.analytics.trackAccount(account, {
                        event: 'download_results.error',
                        userId: account.user.id,
                        properties: {
                            ...baseAnalyticsProperties,
                            error: `${e}`,
                        },
                    });
                    throw e; // cascade error
                }
                break;
            }
            case SchedulerFormat.CSV:
                const user = await this.userService.getSessionByUserUuid(
                    userUuid,
                );
                const csvOptions = isSchedulerCsvOptions(options)
                    ? options
                    : undefined;

                // Extract parameters for CSV format same as XLSX
                let csvSchedulerParameters: ParametersValuesMap | undefined;
                if (dashboardUuid) {
                    const dashboard =
                        await this.schedulerService.dashboardModel.getByIdOrSlug(
                            dashboardUuid,
                        );
                    const dashboardParameters = dashboard.parameters || {};
                    const schedulerParameters = isDashboardScheduler(scheduler)
                        ? scheduler.parameters
                        : undefined;

                    // Convert dashboard parameters to ParametersValuesMap format
                    const convertedDashboardParameters: ParametersValuesMap =
                        Object.fromEntries(
                            Object.entries(dashboardParameters).map(
                                ([key, param]) => [
                                    key,
                                    (param as DashboardParameterValue).value,
                                ],
                            ),
                        );

                    // Merge scheduler parameters with dashboard parameters (scheduler parameters override)
                    csvSchedulerParameters = {
                        ...convertedDashboardParameters,
                        ...schedulerParameters,
                    };
                }

                const baseAnalyticsProperties: DownloadCsv['properties'] = {
                    jobId,
                    userId: userUuid,
                    organizationId: user.organizationUuid,
                    projectId: projectUuid,
                    fileType: SchedulerFormat.CSV,
                    values: csvOptions?.formatted ? 'formatted' : 'raw',
                    limit: parseAnalyticsLimit(csvOptions?.limit),
                    storage: this.s3Client.isEnabled() ? 's3' : 'local',
                };

                try {
                    if (savedChartUuid) {
                        csvUrl = await this.csvService.getCsvForChart({
                            user,
                            chartUuid: savedChartUuid,
                            options: csvOptions,
                            jobId,
                            invalidateCache: true,
                        });
                    } else if (dashboardUuid) {
                        this.analytics.track({
                            event: 'download_results.started',
                            userId: userUuid,
                            properties: {
                                ...baseAnalyticsProperties,
                                context,
                            },
                        });

                        csvUrls = await this.csvService.getCsvsForDashboard({
                            jobId,
                            user,
                            dashboardUuid,
                            options: csvOptions,
                            schedulerFilters: isDashboardScheduler(scheduler)
                                ? scheduler.filters
                                : undefined,
                            selectedTabs,
                            invalidateCache: true,
                            schedulerParameters: csvSchedulerParameters,
                            tabFilters,
                        });

                        this.analytics.track({
                            event: 'download_results.completed',
                            userId: userUuid,
                            properties: {
                                ...baseAnalyticsProperties,
                                context,
                                numCharts: csvUrls.length,
                            },
                        });
                    } else {
                        throw new Error('Not implemented');
                    }
                } catch (e) {
                    Logger.error(
                        `Unable to download CSV on scheduled task: ${e}`,
                    );

                    if (this.slackClient.isEnabled) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    e,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    this.analytics.track({
                        event: 'download_results.error',
                        userId: userUuid,
                        properties: {
                            ...baseAnalyticsProperties,
                            error: `${e}`,
                        },
                    });
                    throw e; // cascade error
                }
                break;
            default:
                return assertUnreachable(
                    format,
                    `Format ${format} is not supported for scheduled delivery`,
                );
        }

        return {
            url,
            pageType,
            details,
            organizationUuid,
            imageUrl,
            csvUrl,
            csvUrls,
            pdfFile,
            failedExports,
        };
    }

    protected async sendSlackNotification(
        jobId: string,
        notification: SlackNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerSlackTargetUuid,
            channel,
            scheduledTime,
            scheduler,
        } = notification;
        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerSlackTargetUuid,
                type: 'slack',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            if (!this.slackClient.isEnabled) {
                throw new Error('Slack app is not configured');
            }

            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                cron,
                timezone,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: channel,
                targetType: 'slack',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            // Backwards compatibility for old scheduled deliveries
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(scheduler, jobId));

            const {
                url,
                details,
                pageType,
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
                failedExports,
            } = notificationPageData;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const showExpirationWarning = format !== SchedulerFormat.IMAGE;
            const schedulerFooter = includeLinks
                ? `<${url}?${setUuidParam(
                      'scheduler_uuid',
                      schedulerUuid,
                  )}|scheduled delivery>`
                : 'scheduled delivery';
            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message:
                    scheduler.message && slackifyMarkdown(scheduler.message),
                ctaUrl: url,
                footerMarkdown: `This is a ${schedulerFooter} ${getHumanReadableCronExpression(
                    cron,
                    timezone || defaultSchedulerTimezone,
                )} from Lightdash.\n${
                    showExpirationWarning
                        ? this.s3Client.getExpirationWarning()?.slack || ''
                        : ''
                }`,
                includeLinks,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    const slackImageUrl =
                        await this.slackClient.tryUploadingImageToSlack(
                            organizationUuid,
                            imageUrl,
                            name,
                        );
                    const thresholdFooter = includeLinks
                        ? `<${url}?${setUuidParam(
                              'threshold_uuid',
                              schedulerUuid,
                          )}|data alert>`
                        : 'data alert';

                    const expiration = slackImageUrl.expiring
                        ? `For security reasons, delivered files expire after ${
                              this.s3Client.getExpirationWarning()?.days || 3
                          } days.`
                        : '';

                    const blocks = getChartThresholdAlertBlocks({
                        ...getBlocksArgs,
                        footerMarkdown: `This is a ${thresholdFooter} sent by Lightdash. ${expiration}`,
                        imageUrl: slackImageUrl.url,
                        thresholds,
                        includeLinks,
                    });
                    await this.slackClient.postMessage({
                        organizationUuid,
                        text: name,
                        channel,
                        blocks,
                    });
                } else {
                    throw new Error('Not implemented');
                }
            } else if (format === SchedulerFormat.IMAGE) {
                const slackImageUrl =
                    await this.slackClient.tryUploadingImageToSlack(
                        organizationUuid,
                        imageUrl,
                        name,
                    );

                const expiration = slackImageUrl.expiring
                    ? `For security reasons, delivered files expire after ${
                          this.s3Client.getExpirationWarning()?.days || 3
                      } days.`
                    : '';
                const blocks = getChartAndDashboardBlocks({
                    ...getBlocksArgs,
                    footerMarkdown: `${getBlocksArgs.footerMarkdown} ${expiration}`,
                    imageUrl: slackImageUrl.url,
                });

                const message = await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });

                if (pdfFile && message.ts) {
                    try {
                        // Add the pdf to the thread
                        const pdfBuffer = this.s3Client.isEnabled()
                            ? await this.s3Client.getS3FileStream(
                                  pdfFile.fileName,
                              )
                            : await fs.readFile(pdfFile.source);

                        await this.slackClient.postFileToThread({
                            organizationUuid,
                            file: pdfBuffer,
                            title: name,
                            channelId: channel,
                            threadTs: message.ts,
                            filename: `${name}.pdf`,
                            fileType: 'pdf',
                        });
                    } catch (err) {
                        if (
                            err instanceof Error &&
                            'code' in err &&
                            err.code === 'ENOENT'
                        ) {
                            throw new ReadFileError(
                                `PDF file not found for ${name}`,
                                {
                                    filePath: pdfFile,
                                },
                            );
                        }
                        throw err;
                    }
                }
            } else {
                let blocks;
                if (savedChartUuid) {
                    if (csvUrl === undefined) {
                        throw new Error('Missing CSV URL');
                    }

                    blocks = getChartCsvResultsBlocks({
                        ...getBlocksArgs,
                        csvUrl:
                            csvUrl.path !== '#no-results'
                                ? csvUrl.path
                                : undefined,
                    });
                } else if (dashboardUuid) {
                    if (csvUrls === undefined) {
                        throw new Error('Missing CSV URLS');
                    }
                    blocks = getDashboardCsvResultsBlocks({
                        ...getBlocksArgs,
                        csvUrls,
                        failedExportsText:
                            SchedulerTask.formatFailedExports(failedExports),
                    });
                } else {
                    throw new Error('Not implemented');
                }
                await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });
            }
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerSlackTargetUuid,
                    type: 'slack',
                    format,
                    resourceType:
                        pageType === LightdashPage.CHART
                            ? 'chart'
                            : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: channel,
                targetType: 'slack',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerSlackTargetUuid,
                    type: 'slack',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'slack',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            if (e instanceof SlackInstallationNotFoundError) {
                console.warn(
                    `Disabling scheduler with non-retryable error: ${e}`,
                );
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    schedulerUuid!,
                    false,
                );
                return; // Do not cascade error
            }

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async sendMsTeamsNotification(
        jobId: string,
        notification: MsTeamsNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerMsTeamsTargetUuid,
            webhook,
            scheduledTime,
            scheduler,
        } = notification;
        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerMsTeamsTargetUuid,
                type: 'msteams',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            if (!this.lightdashConfig.microsoftTeams.enabled) {
                throw new MissingConfigError(
                    'Microsoft teams is not configured',
                );
            }

            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                cron,
                timezone,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: webhook,
                targetType: 'msteams',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            // Backwards compatibility for old scheduled deliveries
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(scheduler, jobId));

            const {
                url,
                details,
                pageType,
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
                failedExports,
            } = notificationPageData;

            const schedulerType =
                thresholds !== undefined && thresholds.length > 0
                    ? 'data alert'
                    : 'scheduled delivery';
            const schedulerFooter = includeLinks
                ? `[${schedulerType}](${url})`
                : schedulerType;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const footer = `This is a ${schedulerFooter} ${getHumanReadableCronExpression(
                cron,
                timezone || defaultSchedulerTimezone,
            )} from Lightdash.`;
            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message: scheduler.message,
                ctaUrl: url,
                footer,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    if (imageUrl)
                        await this.msTeamsClient.postImageWithWebhook({
                            webhookUrl: webhook,
                            ...getBlocksArgs,
                            image: imageUrl,
                            thresholds,
                        });
                } else {
                    throw new Error('No chart found');
                }
            } else if (format === SchedulerFormat.IMAGE) {
                if (imageUrl)
                    await this.msTeamsClient.postImageWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        image: imageUrl,
                        pdfUrl: pdfFile?.source,
                    });
            } else if (format === SchedulerFormat.CSV) {
                if (savedChartUuid) {
                    if (csvUrl === undefined) {
                        throw new UnexpectedServerError('Missing CSV URL');
                    }
                    await this.msTeamsClient.postCsvWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        csvUrl,
                    });
                } else if (dashboardUuid) {
                    if (csvUrls === undefined) {
                        throw new UnexpectedServerError('Missing CSV URLS');
                    }
                    await this.msTeamsClient.postCsvsWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        csvUrls,
                        failedExportsText:
                            SchedulerTask.formatFailedExports(failedExports),
                    });
                } else {
                    throw new UnexpectedServerError('Not implemented');
                }
            }
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerMsTeamsTargetUuid,
                    type: 'msteams',
                    format,
                    resourceType:
                        pageType === LightdashPage.CHART
                            ? 'chart'
                            : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: webhook,
                targetType: 'msteams',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerMsTeamsTargetUuid,
                    type: 'msteams',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'msteams',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async testAndCompileProject(
        jobId: string,
        scheduledTime: Date,
        payload: CompileProjectPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.COMPILE_PROJECT,
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            await this.projectService.testAndCompileProject(
                user,
                payload.projectUuid,
                getRequestMethod(payload.requestMethod),
                payload.jobUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
            if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
                void this.schedulerClient.generateValidation({
                    userUuid: payload.createdByUserUuid,
                    projectUuid: payload.projectUuid,
                    context: 'test_and_compile',
                    organizationUuid: payload.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });
            throw e;
        }
    }

    protected async createProjectWithCompile(
        jobId: string,
        scheduledTime: Date,
        payload: SchedulerCreateProjectWithCompilePayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE,
                jobId,
                scheduledTime,
            };

        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: undefined,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            let projectData: CreateProject;
            try {
                projectData = JSON.parse(
                    this.encryptionUtil.decrypt(
                        Buffer.from(payload.data, 'base64'),
                    ),
                ) as CreateProject;
            } catch {
                throw new UnexpectedServerError('Failed to load project data');
            }

            const projectCreationResult = await this.projectService._create(
                user,
                projectData,
                payload.jobUuid,
                getRequestMethod(payload.requestMethod),
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: projectCreationResult.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: undefined,
                    organizationUuid: payload.organizationUuid,
                    error: e,
                },
            });
            // Update legacy job
            await this.projectService._markJobAsFailed(payload.jobUuid);
            throw e;
        }
    }

    protected async compileProject(
        jobId: string,
        scheduledTime: Date,
        payload: CompileProjectPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.COMPILE_PROJECT,
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            await this.projectService.compileProject(
                user,
                payload.projectUuid,
                getRequestMethod(payload.requestMethod),
                payload.jobUuid,
            );
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
            if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
                void this.schedulerClient.generateValidation({
                    projectUuid: payload.projectUuid,
                    context: 'dbt_refresh',
                    userUuid: payload.createdByUserUuid,
                    organizationUuid: payload.organizationUuid,
                });
            }
            const canReplaceCustomMetrics = await isFeatureFlagEnabled(
                FeatureFlags.ReplaceCustomMetricsOnCompile,
                {
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                },
                {
                    throwOnTimeout: false,
                },
            );
            if (canReplaceCustomMetrics) {
                // Don't wait for replaceCustomFields response
                void this.schedulerClient.replaceCustomFields({
                    userUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    userUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
            });
            throw e;
        }
    }

    protected async validateProject(
        jobId: string,
        scheduledTime: Date,
        payload: ValidateProjectPayload,
    ) {
        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.VALIDATE_PROJECT,
            jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
                createdByUserUuid: payload.userUuid,
                onlyValidateExploresInArgs: payload.onlyValidateExploresInArgs,
            },
        });

        this.analytics.track({
            event: 'validation.run',
            userId: payload.userUuid,
            properties: {
                context: payload.context,
                organizationId: payload.organizationUuid,
                projectId: payload.projectUuid,
            },
        });
        try {
            const validationTargetsSet = new Set(payload.validationTargets);
            const errors = await this.validationService.generateValidation(
                payload.projectUuid,
                payload.explores,
                validationTargetsSet,
                payload.onlyValidateExploresInArgs,
            );

            const contentIds = errors.map((validation) => {
                if (isChartValidationError(validation))
                    return validation.chartUuid;
                if (isDashboardValidationError(validation))
                    return validation.dashboardUuid;

                return validation.name;
            });

            await this.validationService.storeValidation(
                payload.projectUuid,
                errors,
                payload.explores ? jobId : undefined,
            );

            this.analytics.track({
                event: 'validation.completed',
                userId: payload.userUuid,
                properties: {
                    context: payload.context,
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                    numContentAffected: new Set(contentIds).size,
                    numErrorsDetected: errors.length,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.VALIDATE_PROJECT,
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'validation.error',
                userId: payload.userUuid,
                properties: {
                    context: payload.context,
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                    error: getErrorMessage(e),
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.VALIDATE_PROJECT,
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            });
            throw e;
        }
    }

    /**
     * 每个 Tab 一个多 sheet 工作簿，再打成 zip。
     *
     * 输入是 getNotificationPageData 产出的每张图一个 xlsx（带 tabUuid/tabName）；
     * 按 Tab 分组后逐个合并，zip 里每个条目对应一个 Tab。
     */
    private async buildPerTabWorkbookZipUrl({
        files,
        dashboardName,
        locale,
        onFileError,
        onTabSkipped,
    }: {
        files: NonNullable<NotificationPayloadBase['page']['csvUrls']>;
        dashboardName: string;
        /** UI 语言（csvOptions.locale）；缺省按中文处理，与邮件模板一致 */
        locale?: string;
        /** 合并期单文件失败回调：内部已 Logger.warn，这里向上透传收集 */
        onFileError?: (filename: string, reason: string) => void;
        /** 整 Tab 合并后无有效 sheet 被跳过时回调（带该 Tab 的全部文件名） */
        onTabSkipped?: (tabName: string, filenames: string[]) => void;
    }): Promise<string> {
        if (files.length === 0) {
            // 有筛选器但一条数据都没有时走这里；用可本地化的统一文案
            throw new UnexpectedServerError(NO_CHARTS_TO_EXPORT_MESSAGE);
        }

        // 文件名不能后端硬编码中文：英文界面应得到 "Ungrouped"
        // （locale 缺省视为 zh，与邮件模板的默认语言一致）
        const ungroupedTabName = (locale ?? 'zh').startsWith('zh')
            ? '未分组'
            : 'Ungrouped';
        const NO_TAB_KEY = '__no_tab__';
        const groups = new Map<
            string,
            { tabName: string; files: typeof files }
        >();
        files.forEach((file) => {
            const key = file.tabUuid ?? NO_TAB_KEY;
            const existing = groups.get(key);
            const tabName = file.tabName ?? ungroupedTabName;
            if (existing) {
                existing.files.push(file);
            } else {
                groups.set(key, { tabName, files: [file] });
            }
        });
        // 看板没有 Tab（全部图都在 __no_tab__）时，产物就是看板这一页，
        // 文件名用看板名，而不是「未分组」；混合场景仍保留「未分组」以便区分
        const isSingleNoTabGroup =
            groups.size === 1 && groups.has(NO_TAB_KEY);

        const workbooks: Array<{ entryNameBase: string; localPath: string }> =
            [];
        try {
            // 顺序写出，避免同时把多个工作簿读进内存（合并是非流式的）
            // 生成阶段也纳入清理保护：中途抛错时已产出的 /tmp 文件不会泄漏
            // eslint-disable-next-line no-restricted-syntax
            for (const { tabName, files: tabFiles } of groups.values()) {
                const workbookPath = `/tmp/${nanoid()}.xlsx`;
                // 分组按 tabUuid 桶装，文件互不共享：某个 Tab 处理完后，
                // 它的本地输入不会再被后面的 Tab 用到，可立即删除（http 不动）
                const tabLocalInputPaths = tabFiles
                    .map((file) => file.localPath)
                    .filter((localPath) => !/^https?:\/\//.test(localPath));
                const deleteTabLocalInputs = () =>
                    Promise.all(
                        tabLocalInputPaths.map((localPath) =>
                            fs.unlink(localPath).catch(() => undefined),
                        ),
                    );
                let result;
                try {
                    // eslint-disable-next-line no-await-in-loop
                    result = await WorkbookExportHelper.createWorkbookFile({
                        files: tabFiles.map((file) => ({
                            filename: file.filename,
                            sheetName: file.filename,
                            localPath: file.localPath,
                        })),
                        outputPath: workbookPath,
                        onFileError: (filename, error) => {
                            Logger.warn(
                                `Failed to add XLSX file "${filename}" to workbook: ${error}`,
                            );
                            onFileError?.(filename, error);
                        },
                    });
                } catch (e) {
                    // 当前 Tab 的半成品也可能已落盘，一并清理后向上抛出
                    // eslint-disable-next-line no-await-in-loop
                    await fs.unlink(workbookPath).catch(() => undefined);
                    throw e;
                }
                if (result.worksheetCount === 0) {
                    Logger.warn(
                        `Skipping workbook for tab "${tabName}": no sheets could be generated`,
                    );
                    // 环节 ③：整 Tab 被跳过不再静默，把该 Tab 的文件名上报
                    onTabSkipped?.(
                        tabName,
                        tabFiles.map((file) => file.filename),
                    );
                    // 该 Tab 的输入已确认全部无效，也立即清理，降低 /tmp 峰值
                    // eslint-disable-next-line no-await-in-loop
                    await deleteTabLocalInputs();
                    // eslint-disable-next-line no-await-in-loop
                    await fs.unlink(workbookPath).catch(() => undefined);
                    continue;
                }
                workbooks.push({
                    entryNameBase: tabName,
                    localPath: workbookPath,
                });
                // 该 Tab 的工作簿已落盘：立即删掉它的本地输入，避免后面 Tab
                // 陆续合并时中间文件叠加推高 /tmp 峰值（原来要等全部合并完才删）；
                // 调用方 finally 的统一清理保留兜底，重复 unlink 为 no-op
                // eslint-disable-next-line no-await-in-loop
                await deleteTabLocalInputs();
            }

            if (workbooks.length === 0) {
                throw new UnexpectedServerError(NO_CHARTS_TO_EXPORT_MESSAGE);
            }

            // 只有一份工作簿（看板没有 Tab，或只选了 1 个 Tab）时，直接给 xlsx，
            // 不再套一层 zip：客户要的就是「导出这一页」
            if (workbooks.length === 1) {
                const [{ entryNameBase, localPath }] = workbooks;
                const singleFileName = `${sanitizeGenericFileName(
                    isSingleNoTabGroup ? dashboardName : entryNameBase,
                )}-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
                return await this.s3Client.uploadExcel(
                    fsSync.createReadStream(localPath),
                    singleFileName,
                );
            }

            return await this.createExportZipDownloadUrl({
                files: workbooks,
                fileExtension: 'xlsx',
                zipNameBase: dashboardName,
            });
        } finally {
            await Promise.all(
                workbooks.map((workbook) =>
                    fs.unlink(workbook.localPath).catch(() => undefined),
                ),
            );
        }
    }

    /**
     * Collapses per-tile XLSX files into one "zip of per-tab workbooks" csvUrl
     * for scheduled delivery (single-entry shape: page.csvUrls[0] is the zip).
     */
    private async buildPerTabWorkbookCsvUrls({
        files,
        dashboardName,
        locale,
        onFileError,
        onTabSkipped,
    }: {
        files: NonNullable<NotificationPayloadBase['page']['csvUrls']>;
        dashboardName: string;
        locale?: string;
        /** 合并期单文件失败回调：透传给 WorkbookExportHelper 后向上收集 */
        onFileError?: (filename: string, reason: string) => void;
        /** 整 Tab 被跳过时回调：透传给 buildPerTabWorkbookZipUrl */
        onTabSkipped?: (tabName: string, filenames: string[]) => void;
    }): Promise<NonNullable<NotificationPayloadBase['page']['csvUrls']>> {
        // 成功后返回值会被替换成单条 S3 URL，调用方的
        // cleanupLocalExportFiles 会因 http 前缀跳过，
        // 因此传入 files 里的本地中间文件（keepTempFile 生成）由这里统一清理。
        // 注：buildPerTabWorkbookZipUrl 已在每个 Tab 处理完后即时删除该 Tab 的
        // 本地输入（降低 /tmp 峰值），这里的统一清理仅作中途抛错时的兑底
        const localInputPaths = files
            .map((file) => file.localPath)
            .filter((localPath) => !/^https?:\/\//.test(localPath));
        try {
            const zipUrl = await this.buildPerTabWorkbookZipUrl({
                files,
                dashboardName,
                locale,
                onFileError,
                onTabSkipped,
            });
            return [
                {
                    filename: dashboardName,
                    path: zipUrl,
                    localPath: zipUrl,
                    truncated: files.some((file) => file.truncated),
                },
            ];
        } finally {
            await Promise.all(
                localInputPaths.map((localPath) =>
                    fs.unlink(localPath).catch(() => undefined),
                ),
            );
        }
    }

    protected async downloadCsv(
        jobId: string,
        scheduledTime: Date,
        payload: DownloadCsvPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.DOWNLOAD_CSV,
                jobId,
                scheduledTime,
            };
        try {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            const { fileUrl, truncated } = await this.csvService.downloadCsv(
                jobId,
                payload,
            );
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    fileUrl,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                    truncated,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });
            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async logWrapper<TRecordValues = string>(
        baseLog: Pick<
            SchedulerLog,
            'task' | 'jobId' | 'scheduledTime' | 'details'
        >,
        func: () => Promise<Record<string, TRecordValues> | undefined>, // Returns extra details for the log
    ) {
        try {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.STARTED,
            });

            const details = await func();

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: { ...baseLog.details, ...details },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    ...baseLog.details,
                    error: getErrorMessage(e),
                    ...(e instanceof Error && 'data' in e && e?.data
                        ? e.data
                        : {}),
                },
            });
            Logger.error(`Error in scheduler task: ${e}`);
            throw e;
        }
    }

    protected async sqlRunner(
        jobId: string,
        scheduledTime: Date,
        payload: SqlRunnerPayload,
    ) {
        await this.logWrapper<string | VizColumn[]>(
            {
                task: SCHEDULER_TASKS.SQL_RUNNER,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const { fileUrl, columns } =
                    await this.projectService.streamSqlQueryIntoFile(payload);
                return { fileUrl, columns };
            },
        );
    }

    protected async sqlRunnerPivotQuery(
        jobId: string,
        scheduledTime: Date,
        payload: SqlRunnerPivotQueryPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => this.projectService.pivotQueryWorkerTask(payload),
        );
    }

    protected async uploadGsheetFromQuery(
        jobId: string,
        scheduledTime: Date,
        payload: UploadMetricGsheetPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
                jobId,
                scheduledTime,
            };

        const analyticsProperties: DownloadCsv['properties'] = {
            jobId,
            userId: payload.userUuid,
            organizationId: payload.organizationUuid,
            projectId: payload.projectUuid,
            fileType: SchedulerFormat.GSHEETS,
        };

        try {
            if (!this.googleDriveClient.isEnabled) {
                throw new Error(
                    'Unable to upload Google Sheet from query, Google Drive is not enabled',
                );
            }
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            const sessionUser = await this.userService.getSessionByUserUuid(
                payload.userUuid,
            );
            const account = Account.fromSession(sessionUser);
            this.analytics.trackAccount(account, {
                event: 'download_results.started',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });
            const queryTags: RunQueryTags = {
                project_uuid: payload.projectUuid,
                user_uuid: payload.userUuid,
                organization_uuid: payload.organizationUuid,
                explore_name: payload.exploreId,
                query_context: QueryExecutionContext.GSHEETS,
            };

            const { rows } = await this.projectService.runMetricQuery({
                account,
                metricQuery: payload.metricQuery,
                projectUuid: payload.projectUuid,
                exploreName: payload.exploreId,
                csvLimit: undefined,
                context: QueryExecutionContext.GSHEETS,
                chartUuid: undefined,
                queryTags,
            });

            const refreshToken = await this.userService.getRefreshToken(
                payload.userUuid,
            );
            const { spreadsheetId, spreadsheetUrl } =
                await this.googleDriveClient.createNewSheet(
                    refreshToken,
                    payload.exploreId,
                );

            if (!spreadsheetId) {
                throw new Error('Unable to create new sheet');
            }

            const explore = await this.projectService.getExplore(
                account,
                payload.projectUuid,
                payload.exploreId,
            );
            const itemMap = getItemMap(
                explore,
                payload.metricQuery.additionalMetrics,
                payload.metricQuery.tableCalculations,
            );
            if (payload.pivotConfig) {
                // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
                // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
                const formattedRows = formatRows(rows, itemMap, undefined, {
                    displayTimezone: this.lightdashConfig.query.timezone,
                });

                const pivotedResults = pivotResultsAsCsv({
                    pivotConfig: payload.pivotConfig,
                    rows: formattedRows,
                    itemMap,
                    metricQuery: payload.metricQuery,
                    customLabels: payload.customLabels,
                    onlyRaw: true,
                    maxColumnLimit:
                        this.lightdashConfig.pivotTable.maxColumnLimit,
                    pivotDetails: null, // TODO: this is using old way of running queries + pivoting, therefore pivotDetails is not available
                });

                await this.googleDriveClient.appendCsvToSheet(
                    refreshToken,
                    spreadsheetId,
                    pivotedResults,
                );
            } else {
                await this.googleDriveClient.appendToSheet(
                    refreshToken,
                    spreadsheetId,
                    rows,
                    itemMap,
                    payload.showTableNames,
                    undefined, // tabName
                    payload.columnOrder,
                    payload.customLabels,
                    payload.hiddenFields,
                );
            }

            const truncated = this.csvService.couldBeTruncated(rows);

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    fileUrl: spreadsheetUrl,
                    createdByUserUuid: payload.userUuid,
                    truncated,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });

            this.analytics.trackAccount(account, {
                event: 'download_results.completed',
                userId: account.user.id,
                properties: analyticsProperties,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });

            this.analytics.track({
                event: 'download_results.error',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });

            throw e;
        }
    }

    protected async sendEmailNotification(
        jobId: string,
        notification: EmailNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerEmailTargetUuid,
            recipient,
            scheduledTime,
            scheduler,
        } = notification;

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerEmailTargetUuid,
                type: 'email',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
                scheduledTime,
                target: recipient,
                targetType: 'email',
                status: SchedulerJobStatus.STARTED,
            });

            // Backwards compatibility for old scheduled deliveries
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(scheduler, jobId));

            const {
                url,
                details,
                pageType,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
                failedExports,
            } = notificationPageData;

            const schedulerUrl = `${url}?${setUuidParam(
                'scheduler_uuid',
                schedulerUuid,
            )}`;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const emailLocale =
                (scheduler.options as { locale?: string } | undefined)
                    ?.locale ?? 'zh';
            const humanCron = getHumanReadableCronExpression(
                scheduler.cron,
                scheduler.timezone || defaultSchedulerTimezone,
                emailLocale,
            );

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (imageUrl === undefined) {
                    throw new Error('Missing image URL');
                }
                if (scheduler.message) {
                    throw new Error(
                        'Message not supported on threshold alerts',
                    );
                }
                // Reuse message from imageNotification for threshold information
                const thresholdMessageList = thresholds.map(
                    (threshold) =>
                        `- **${friendlyName(
                            threshold.fieldId,
                        )}** ${operatorActionValue(
                            threshold.operator,
                            threshold.value,
                            '**',
                        )}`,
                );
                const thresholdMessage = `Your results for the chart **${
                    details.name
                }** triggered the following alerts:\n${thresholdMessageList.join(
                    '\n',
                )}`;
                const alertCopy = (
                    await import('../clients/EmailClient/emailCopy')
                ).getEmailCopy(emailLocale);
                await this.emailClient.sendImageNotificationEmail(
                    recipient,
                    alertCopy.dataAlertSubject,
                    name,
                    details.description || '',
                    thresholdMessage,
                    new Date().toLocaleDateString(
                        emailLocale === 'en' ? 'en-GB' : 'zh-CN',
                    ),
                    humanCron,
                    imageUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    pdfFile?.source,
                    undefined, // expiration days
                    alertCopy.dataAlertDeliveryType,
                    emailLocale,
                );
            } else if (format === SchedulerFormat.IMAGE) {
                if (imageUrl === undefined) {
                    throw new Error('Missing image URL');
                }
                await this.emailClient.sendImageNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString(
                        emailLocale === 'en' ? 'en-GB' : 'zh-CN',
                    ),
                    humanCron,
                    imageUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    pdfFile?.source,
                    this.s3Client.getExpirationWarning()?.days,
                    undefined,
                    emailLocale,
                );
            } else if (savedChartUuid) {
                if (csvUrl === undefined) {
                    throw new Error('Missing CSV URL');
                }
                const csvOptions = SchedulerTask.getCsvOptions(scheduler);
                await this.emailClient.sendChartCsvNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString(
                        emailLocale === 'en' ? 'en-GB' : 'zh-CN',
                    ),
                    humanCron,
                    csvUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    this.s3Client.getExpirationWarning()?.days,
                    csvOptions?.asAttachment,
                    format,
                    emailLocale,
                );
            } else if (dashboardUuid) {
                if (csvUrls === undefined) {
                    throw new Error('Missing CSV URLS');
                }
                const csvOptions = SchedulerTask.getCsvOptions(scheduler);

                await this.emailClient.sendDashboardCsvNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString(
                        emailLocale === 'en' ? 'en-GB' : 'zh-CN',
                    ),
                    humanCron,
                    csvUrls,
                    url,
                    schedulerUrl,
                    includeLinks,
                    this.s3Client.getExpirationWarning()?.days,
                    csvOptions?.asAttachment,
                    format,
                    emailLocale,
                    failedExports,
                );
            } else {
                throw new Error('Not implemented');
            }

            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerEmailTargetUuid,
                    type: 'email',
                    format,
                    withPdf: pdfFile !== undefined,
                    resourceType:
                        pageType === LightdashPage.CHART
                            ? 'chart'
                            : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
                scheduledTime,
                target: recipient,
                targetType: 'email',
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerEmailTargetUuid,
                    type: 'email',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'email',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    // eslint-disable-next-line consistent-return -- we throw in the default case. tsc doesn't like it.
    static isPositiveThresholdAlert(
        thresholds: ThresholdOptions[],
        results: Record<string, AnyType>[],
    ): boolean {
        if (thresholds.length < 1 || results.length < 1) {
            return false;
        }

        const { fieldId, operator, value: thresholdValue } = thresholds[0];

        const getValue = (resultIdx: number) => {
            if (results.length === 0) {
                throw new NotEnoughResults(
                    `Threshold alert error: Query returned no rows.`,
                );
            }

            // If we are trying to access beyond available rows, throw a general error
            if (resultIdx >= results.length) {
                throw new NotEnoughResults(
                    `Threshold alert error: Expected at least ${resultIdx} rows, but only ${results.length} row(s) were returned.`,
                );
            }

            const result = results[resultIdx];

            if (!(fieldId in result)) {
                // This error will disable the scheduler
                throw new FieldReferenceError(
                    `Threshold alert error: Tried to reference field with unknown id: ${fieldId}`,
                );
            }
            return parseFloat(result[fieldId]);
        };

        const latestValue = getValue(0);
        switch (operator) {
            case ThresholdOperator.GREATER_THAN:
                return latestValue > thresholdValue;

            case ThresholdOperator.LESS_THAN:
                return latestValue < thresholdValue;

            case ThresholdOperator.INCREASED_BY:
            case ThresholdOperator.DECREASED_BY:
                // Ensure at least two rows exist for these operations
                if (results.length < 2) {
                    throw new NotEnoughResults(
                        `Threshold alert error: Increase/decrease comparison requires at least two rows, but only ${results.length} row(s) were returned.`,
                    );
                }
                const previousValue = getValue(1);
                if (operator === ThresholdOperator.INCREASED_BY) {
                    const percentageIncrease =
                        ((latestValue - previousValue) / previousValue) * 100;
                    return percentageIncrease > thresholdValue;
                }
                const percentageDecrease =
                    ((previousValue - latestValue) / previousValue) * 100;
                return percentageDecrease > thresholdValue;

            default:
                assertUnreachable(
                    operator,
                    `Unknown threshold alert operator: ${operator}`,
                );
        }
    }

    protected async uploadGsheets(
        jobId: string,
        notification: GsheetsNotificationPayload,
    ) {
        const { schedulerUuid, scheduledTime } = notification;

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: undefined,
                type: 'gsheets',
                sendNow: schedulerUuid === undefined,
            },
        });
        let sessionUser: SessionUser | undefined;
        let account: AccountType | undefined;
        let scheduler: SchedulerAndTargets | undefined;

        let deliveryUrl = this.lightdashConfig.siteUrl;
        try {
            if (!this.googleDriveClient.isEnabled) {
                throw new MissingConfigError(
                    'Unable to upload Google Sheet from scheduler, Google Drive is not enabled',
                );
            }
            scheduler =
                await this.schedulerService.schedulerModel.getSchedulerAndTargets(
                    schedulerUuid,
                );

            const { format, savedChartUuid, dashboardUuid, thresholds } =
                scheduler;

            const gdriveId = isSchedulerGsheetsOptions(scheduler.options)
                ? scheduler.options.gdriveId
                : undefined;
            if (gdriveId === undefined) {
                throw new Error('Missing gdriveId');
            }

            const tabName = isSchedulerGsheetsOptions(scheduler.options)
                ? scheduler.options.tabName
                : undefined;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
            sessionUser = await this.userService.getSessionByUserUuid(
                scheduler.createdBy,
            );
            account = Account.fromSession(sessionUser);

            const schedulerUuidParam = setUuidParam(
                'scheduler_uuid',
                schedulerUuid,
            );

            if (format !== SchedulerFormat.GSHEETS) {
                throw new UnexpectedServerError(
                    `Unable to process format ${format} on sendGdriveNotification`,
                );
            } else if (savedChartUuid) {
                const chart = await this.schedulerService.savedChartModel.get(
                    savedChartUuid,
                );
                deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${savedChartUuid}/view?${schedulerUuidParam}&isSync=true`;

                const defaultSchedulerTimezone =
                    await this.schedulerService.getSchedulerDefaultTimezone(
                        schedulerUuid,
                    );

                const { rows } = await this.projectService.getResultsForChart(
                    account,
                    savedChartUuid,
                    QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                );

                if (thresholds !== undefined && thresholds.length > 0) {
                    throw new UnexpectedServerError(
                        'Thresholds not implemented for google sheets',
                    );
                }

                const explore = await this.projectService.getExplore(
                    account,
                    chart.projectUuid,
                    chart.tableName,
                );
                const itemMap = getItemMap(
                    explore,
                    chart.metricQuery.additionalMetrics,
                    chart.metricQuery.tableCalculations,
                );
                const showTableNames = isTableChartConfig(
                    chart.chartConfig.config,
                )
                    ? chart.chartConfig.config.showTableNames ?? false
                    : true;
                const customLabels = getCustomLabelsFromTableConfig(
                    chart.chartConfig.config,
                );

                const refreshToken = await this.userService.getRefreshToken(
                    scheduler.createdBy,
                );

                const reportUrl = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view?${schedulerUuidParam}&isSync=true`;
                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    undefined,
                    reportUrl,
                );
                const pivotConfig = getPivotConfig(chart);
                if (
                    pivotConfig &&
                    isTableChartConfig(chart.chartConfig.config)
                ) {
                    // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
                    // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
                    const formattedRows = formatRows(rows, itemMap, undefined, {
                        displayTimezone: this.lightdashConfig.query.timezone,
                    });

                    const pivotedResults = pivotResultsAsCsv({
                        pivotConfig,
                        rows: formattedRows,
                        itemMap,
                        metricQuery: chart.metricQuery,
                        customLabels,
                        onlyRaw: true,
                        maxColumnLimit:
                            this.lightdashConfig.pivotTable.maxColumnLimit,
                        pivotDetails: null, // TODO: this is using old way of running queries + pivoting, therefore pivotDetails is not available
                    });
                    await this.googleDriveClient.appendCsvToSheet(
                        refreshToken,
                        gdriveId,
                        pivotedResults,
                        tabName,
                    );
                } else {
                    await this.googleDriveClient.appendToSheet(
                        refreshToken,
                        gdriveId,
                        rows,
                        itemMap,
                        showTableNames,
                        tabName,
                        chart.tableConfig.columnOrder,
                        customLabels,
                        getHiddenTableFields(chart.chartConfig),
                    );
                }
            } else if (dashboardUuid) {
                const dashboard = await this.dashboardService.getByIdOrSlug(
                    sessionUser,
                    dashboardUuid,
                );
                deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view?${schedulerUuidParam}&isSync=true`;

                const defaultSchedulerTimezone =
                    await this.schedulerService.getSchedulerDefaultTimezone(
                        schedulerUuid,
                    );

                const chartUuids = dashboard.tiles.reduce<string[]>(
                    (acc, tile) => {
                        if (
                            isDashboardChartTileType(tile) &&
                            tile.properties.savedChartUuid
                        ) {
                            return [...acc, tile.properties.savedChartUuid];
                        }
                        return acc;
                    },
                    [],
                );

                const refreshToken = await this.userService.getRefreshToken(
                    scheduler.createdBy,
                );

                const chartNames = chartUuids.reduce<Record<string, string>>(
                    (acc, chartUuid) => {
                        const tile = dashboard.tiles.find(
                            (t) =>
                                isDashboardChartTileType(t) &&
                                t.properties.savedChartUuid === chartUuid,
                        );
                        const chartName =
                            tile && isDashboardChartTileType(tile)
                                ? tile.properties.chartName
                                : undefined;
                        return {
                            ...acc,
                            [chartUuid]:
                                tile?.properties.title ||
                                chartName ||
                                chartUuid,
                        };
                    },
                    {},
                );

                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone ?? defaultSchedulerTimezone,
                    ),
                    Object.values(chartNames),
                );

                Logger.debug(
                    `Uploading dashboard with ${chartUuids.length} charts to Google Sheets`,
                );
                // We want to process all charts in sequence, so we don't load all chart results in memory
                chartUuids
                    .reduce(async (promise, chartUuid) => {
                        await promise;
                        const chart =
                            await this.schedulerService.savedChartModel.get(
                                chartUuid,
                            );
                        const { rows } =
                            await this.projectService.getResultsForChart(
                                account!,
                                chartUuid,
                                QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                            );
                        const explore = await this.projectService.getExplore(
                            account!,
                            chart.projectUuid,
                            chart.tableName,
                        );
                        const itemMap = getItemMap(
                            explore,
                            chart.metricQuery.additionalMetrics,
                            chart.metricQuery.tableCalculations,
                        );
                        const showTableNames = isTableChartConfig(
                            chart.chartConfig.config,
                        )
                            ? chart.chartConfig.config.showTableNames ?? false
                            : true;
                        const customLabels = getCustomLabelsFromTableConfig(
                            chart.chartConfig.config,
                        );

                        const chartTabName =
                            await this.googleDriveClient.createNewTab(
                                refreshToken,
                                gdriveId,
                                chartNames[chartUuid] || chartUuid,
                            );
                        const pivotConfig = getPivotConfig(chart);
                        if (
                            pivotConfig &&
                            isTableChartConfig(chart.chartConfig.config)
                        ) {
                            // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
                            // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
                            const formattedRows = formatRows(
                                rows,
                                itemMap,
                                undefined,
                                {
                                    displayTimezone:
                                        this.lightdashConfig.query.timezone,
                                },
                            );

                            const pivotedResults = pivotResultsAsCsv({
                                pivotConfig,
                                rows: formattedRows,
                                itemMap,
                                metricQuery: chart.metricQuery,
                                customLabels,
                                onlyRaw: true,
                                maxColumnLimit:
                                    this.lightdashConfig.pivotTable
                                        .maxColumnLimit,
                                pivotDetails: null, // TODO: this is using old way of running queries + pivoting, therefore pivotDetails is not available
                            });

                            await this.googleDriveClient.appendCsvToSheet(
                                refreshToken,
                                gdriveId,
                                pivotedResults,
                                chartTabName,
                            );
                        } else {
                            await this.googleDriveClient.appendToSheet(
                                refreshToken,
                                gdriveId,
                                rows,
                                itemMap,
                                showTableNames,
                                chartTabName,
                                chart.tableConfig.columnOrder,
                                customLabels,
                                getHiddenTableFields(chart.chartConfig),
                            );
                        }
                    }, Promise.resolve())
                    .catch((error) => {
                        Logger.debug('Error processing charts:', error);
                        throw error;
                    });
            } else {
                throw new UnexpectedServerError('Not implemented');
            }

            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: undefined,
                    type: 'gsheets',
                    format,
                    resourceType: savedChartUuid ? 'chart' : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: undefined,
                    type: 'gsheets',
                    sendNow: schedulerUuid === undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'gsheets',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
            const shouldDisableSync =
                e instanceof ForbiddenError ||
                e instanceof MissingConfigError ||
                e instanceof UnexpectedGoogleSheetsError;

            if (
                this.slackClient.isEnabled &&
                account?.organization?.organizationUuid &&
                scheduler
            ) {
                await this.slackClient.postMessageToNotificationChannel({
                    organizationUuid: account.organization.organizationUuid,
                    text: `Error uploading Google Sheets: ${scheduler.name}`,
                    blocks: getNotificationChannelErrorBlocks(
                        scheduler.name,
                        e,
                        deliveryUrl,
                        'Google Sync',
                        shouldDisableSync,
                    ),
                });
            }

            if (shouldDisableSync) {
                console.warn(
                    `Disabling Google sheets scheduler with non-retryable error: ${e}`,
                );

                await this.schedulerService.setSchedulerEnabled(
                    sessionUser!, // This error from gdriveClient happens after user initialized
                    schedulerUuid,
                    false,
                );

                if (account?.user.email) {
                    await this.emailClient.sendGoogleSheetsErrorNotificationEmail(
                        account.user.email,
                        scheduler?.name || 'Unknown',
                        deliveryUrl,
                    );
                }
                return; // Do not cascade error
            }
            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async logScheduledTarget(
        format: SchedulerFormat,
        target: CreateSchedulerTarget | undefined,
        targetJobId: string,
        schedulerUuid: string | undefined,
        jobId: string,
        scheduledTime: Date,
        details: {
            projectUuid: string;
            organizationUuid: string;
            createdByUserUuid: string;
        },
    ) {
        if (format === SchedulerFormat.GSHEETS) {
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                target: undefined,
                targetType: 'gsheets',
                jobId: targetJobId,
                schedulerUuid,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.SCHEDULED,
                details,
            });
            return;
        }
        if (target === undefined) {
            Logger.error(`Missing target for scheduler format ${format}`);
            return;
        }
        const getTargetDetails = (): Pick<
            CreateSchedulerLog,
            'task' | 'target' | 'targetType'
        > => {
            if (isCreateSchedulerSlackTarget(target)) {
                return {
                    task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                    target: target.channel,
                    targetType: 'slack',
                };
            }

            if (isCreateSchedulerMsTeamsTarget(target)) {
                return {
                    task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                    target: target.webhook,
                    targetType: 'msteams',
                };
            }
            return {
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                target: target.recipient,
                targetType: 'email',
            };
        };
        const { task, target: jobTarget, targetType } = getTargetDetails();

        await this.schedulerService.logSchedulerJob({
            task,
            target: jobTarget,
            targetType,
            jobId: targetJobId,
            schedulerUuid,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.SCHEDULED,
            details,
        });
    }

    protected async handleScheduledDelivery(
        jobId: string,
        scheduledTime: Date,
        schedulerPayload: ScheduledDeliveryPayload,
    ) {
        const schedulerUuid = getSchedulerUuid(schedulerPayload);

        const scheduler: SchedulerAndTargets | CreateSchedulerAndTargets =
            isCreateScheduler(schedulerPayload)
                ? schedulerPayload
                : await this.schedulerService.schedulerModel.getSchedulerAndTargets(
                      schedulerPayload.schedulerUuid,
                  );

        if (!scheduler.enabled) {
            // This should not happen, if schedulers are not enabled, we should remove the scheduled jobs from the queue
            throw new Error('Scheduler is disabled');
        }

        this.analytics.track({
            event: 'scheduler_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });
        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: schedulerPayload.projectUuid,
                organizationUuid: schedulerPayload.organizationUuid,
                createdByUserUuid: schedulerPayload.userUuid,
            },
        });

        const traceProperties = {
            organizationUuid: schedulerPayload.organizationUuid,
            projectUuid: schedulerPayload.projectUuid,
            userUuid: schedulerPayload.userUuid,
        };

        const {
            createdBy: userUuid,
            savedChartUuid,
            dashboardUuid,
            thresholds,
            notificationFrequency,
        } = scheduler;
        try {
            if (thresholds !== undefined && thresholds.length > 0) {
                // TODO add multiple AND conditions
                if (savedChartUuid) {
                    // We are fetching here the results before getting image or CSV
                    const sessionUser =
                        await this.userService.getSessionByUserUuid(userUuid);
                    const account = Account.fromSession(sessionUser);
                    const { rows } =
                        await this.projectService.getResultsForChart(
                            account,
                            savedChartUuid,
                            QueryExecutionContext.SCHEDULED_CHART,
                        );

                    if (
                        SchedulerTask.isPositiveThresholdAlert(thresholds, rows)
                    ) {
                        // If the delivery frequency is once, we disable the scheduler.
                        // It will get sent once this time.
                        if (
                            notificationFrequency ===
                                NotificationFrequency.ONCE &&
                            schedulerUuid
                        ) {
                            console.debug(
                                'Alert is set to ONCE, disabling scheduler after delivery',
                            );
                            await this.schedulerService.setSchedulerEnabled(
                                sessionUser,
                                schedulerUuid,
                                false,
                            );
                        }
                        console.debug(
                            'Positive threshold alert, continue with notification',
                        );
                    } else {
                        console.debug(
                            'Negative threshold alert, skipping notification',
                        );
                        return;
                    }
                } else if (dashboardUuid) {
                    throw new Error(
                        'Threshold alert not implemented for dashboards',
                    );
                }
            }

            const page =
                scheduler.format === SchedulerFormat.GSHEETS
                    ? undefined
                    : await this.getNotificationPageData(scheduler, jobId);
            const scheduledJobs =
                await this.schedulerClient.generateJobsForSchedulerTargets(
                    scheduledTime,
                    scheduler,
                    page,
                    jobId,
                    traceProperties,
                );

            // Create scheduled jobs for targets
            await Promise.all(
                scheduledJobs.map(({ target, jobId: targetJobId }) =>
                    this.logScheduledTarget(
                        scheduler.format,
                        target,
                        targetJobId,
                        schedulerUuid,
                        jobId,
                        scheduledTime,
                        {
                            projectUuid: schedulerPayload.projectUuid,
                            organizationUuid: schedulerPayload.organizationUuid,
                            createdByUserUuid: schedulerPayload.userUuid,
                        },
                    ),
                ),
            );

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                },
            });

            this.analytics.track({
                event: 'scheduler_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                },
            });

            // Send failure notification email to scheduler creator
            try {
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                if (user.email) {
                    const schedulerUrlParam = setUuidParam(
                        'scheduler_uuid',
                        schedulerUuid,
                    );
                    const schedulerUrl =
                        scheduler.savedChartUuid || scheduler.dashboardUuid
                            ? `${this.lightdashConfig.siteUrl}/projects/${
                                  schedulerPayload.projectUuid
                              }/${
                                  scheduler.savedChartUuid
                                      ? 'saved'
                                      : 'dashboards'
                              }/${
                                  scheduler.savedChartUuid ||
                                  scheduler.dashboardUuid
                              }/view?${schedulerUrlParam}`
                            : this.lightdashConfig.siteUrl;

                    await this.emailClient.sendScheduledDeliveryFailureEmail(
                        user.email,
                        scheduler.name,
                        schedulerUrl,
                        getErrorMessage(e),
                    );
                }
            } catch (emailError) {
                Logger.error(
                    `Failed to send scheduled delivery failure email: ${emailError}`,
                );
                // Don't throw - we still want to handle the original error
            }
            if (e instanceof NotEnoughResults) {
                Logger.warn(
                    `Scheduler ${schedulerUuid} did not return enough results for threshold alert`,
                );
                // We don't want to retry the error now, but we are not going to disable the scheduler.
                return; // Do not cascade error
            }

            if (e instanceof FieldReferenceError) {
                // This captures both the error from thresholdAlert and metricQuery
                Logger.warn(
                    `Disabling scheduler with non-retryable error: ${e}`,
                );
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    schedulerUuid!,
                    false,
                );
                return; // Do not cascade error
            }
            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async indexCatalog(
        jobId: string,
        scheduledTime: Date,
        payload: SchedulerIndexCatalogJobPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.INDEX_CATALOG,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const { catalogFieldMap } =
                    await this.catalogService.indexCatalog(
                        payload.projectUuid,
                        payload.userUuid,
                    );

                await this.catalogService.migrateCatalogItemTags(
                    payload.projectUuid,
                    payload.prevCatalogItemsWithTags,
                );

                await this.catalogService.migrateCatalogItemIcons(
                    payload.projectUuid,
                    payload.prevCatalogItemsWithIcons,
                );

                await this.catalogService.migrateMetricsTreeEdges(
                    payload.projectUuid,
                    payload.prevMetricTreeEdges,
                );

                await this.catalogService.setChartUsages(
                    payload.projectUuid,
                    catalogFieldMap,
                );

                return {}; // Don't pollute with more details
            },
        );
    }

    protected async exportCsvDashboard(
        jobId: string,
        scheduledTime: Date,
        payload: ExportCsvDashboardPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const url =
                    await this.csvService.runScheduledExportCsvDashboard(
                        payload,
                    );
                return { url };
            },
        );
    }

    /**
     * One-click dashboard CSV/XLSX export. Reuses scheduled-delivery generation
     * for XLSX (including workbook collapse) and CsvService for CSV zip.
     */
    protected async exportContent(
        jobId: string,
        scheduledTime: Date,
        payload: ExportContentPayload,
    ) {
        await this.logWrapper<
            | string
            | boolean
            | NonNullable<NotificationPayloadBase['page']['failedExports']>
        >(
            {
                task: SCHEDULER_TASKS.EXPORT_CONTENT,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                if (payload.resourceType !== 'dashboard') {
                    throw new ParameterError(
                        'Only dashboard export is supported',
                    );
                }
                if (!this.s3Client.isEnabled()) {
                    throw new MissingConfigError('Cloud storage is not enabled');
                }

                if (payload.format === SchedulerFormat.CSV) {
                    const user = await this.userService.getSessionByUserUuid(
                        payload.userUuid,
                    );
                    const options = isSchedulerCsvOptions(payload.options)
                        ? payload.options
                        : { formatted: true, limit: 'table' as const };

                    const csvFiles = await this.csvService
                        .getCsvsForDashboard({
                            jobId,
                            user,
                            dashboardUuid: payload.resourceUuid,
                            options,
                            overrideDashboardFilters: payload.dashboardFilters,
                            dateZoomGranularity:
                                payload.dateZoomGranularity as
                                    | DateGranularity
                                    | undefined,
                            selectedTabs: payload.selectedTabs ?? null,
                            invalidateCache: true,
                            schedulerParameters: payload.parameters,
                            tabFilters: payload.tabFilters,
                        })
                        .then((urls) =>
                            urls.filter((url) => url.path !== '#no-results'),
                        );

                    const dashboard =
                        await this.schedulerService.dashboardModel.getByIdOrSlug(
                            payload.resourceUuid,
                        );

                    if (csvFiles.length === 0) {
                        throw new UnexpectedServerError(
                            NO_CHARTS_TO_EXPORT_MESSAGE,
                        );
                    }

                    // 只有一张图有数据时直接给 csv，不套 zip（「导出这一页」）
                    if (csvFiles.length === 1) {
                        const [singleFile] = csvFiles;
                        return {
                            url: singleFile.path,
                            fileType: DownloadFileType.CSV,
                        };
                    }

                    const url = await this.createExportZipDownloadUrl({
                        files: csvFiles.map((file) => ({
                            entryNameBase: file.filename,
                            localPath: file.localPath,
                        })),
                        fileExtension: 'csv',
                        zipNameBase: dashboard.name,
                    });
                    return { url, fileType: 'zip' };
                }

                if (payload.format === SchedulerFormat.XLSX) {
                    const scheduler = {
                        name: 'Content export',
                        createdBy: payload.userUuid,
                        format: SchedulerFormat.XLSX,
                        options: payload.options,
                        cron: '* * * * *',
                        timezone: 'UTC',
                        savedChartUuid: null,
                        dashboardUuid: payload.resourceUuid,
                        enabled: true,
                        includeLinks: false,
                        targets: [],
                        customViewportWidth: payload.customViewportWidth,
                        selectedTabs: payload.selectedTabs ?? null,
                        filters: payload.dashboardFilters?.dimensions,
                        parameters: payload.parameters,
                    } satisfies CreateSchedulerAndTargets & {
                        dashboardUuid: string;
                        selectedTabs: string[] | null;
                        filters?: DashboardFilterRule[];
                        parameters?: ParametersValuesMap;
                        customViewportWidth?: number;
                    };

                    const page = await this.getNotificationPageData(
                        scheduler,
                        jobId,
                        payload.tabFilters,
                    );

                    if (!page.csvUrls || page.csvUrls.length === 0) {
                        throw new UnexpectedServerError(
                            'Dashboard data export failed',
                        );
                    }

                    // getNotificationPageData 已收口成单条产物 URL：
                    // 只有一份工作簿时是 .xlsx，多 Tab 时是 zip（每图 /tmp
                    // 中间文件也已清理），直接透传
                    try {
                        const exportUrl = page.csvUrls[0]?.path;
                        if (!exportUrl) {
                            throw new UnexpectedServerError(
                                'Dashboard per-tab workbook export failed',
                            );
                        }
                        return SchedulerTask.withFailedExports(
                            {
                                url: exportUrl,
                                fileType: SchedulerTask.getExportFileType(
                                    exportUrl,
                                    DownloadFileType.XLSX,
                                ),
                                // 任一图触顶时产物是不完整的，前端要提示
                                truncated:
                                    page.csvUrls[0]?.truncated === true,
                            },
                            page.failedExports,
                        );
                    } finally {
                        await this.cleanupLocalExportFiles(page.csvUrls);
                    }
                }

                return assertUnreachable(
                    payload.format,
                    `Format ${payload.format} is not supported for export`,
                );
            },
        );
    }

    /** 导出过程中上报进度（节流：最多每 1.5s 写一次库，最后一并写） */
    private lastProgressReportAt = 0;

    private async reportExportProgress(
        jobId: string | undefined,
        details: Record<string, unknown>,
    ): Promise<void> {
        if (!jobId) return;
        const now = Date.now();
        if (now - this.lastProgressReportAt < 1500) return;
        this.lastProgressReportAt = now;
        try {
            await this.schedulerService.updateJobDetails(jobId, details);
        } catch (error) {
            Logger.debug(
                `Failed to report export progress for job ${jobId}: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }

    /**
     * 导出产物的真实文件类型：单份产物可能是 xlsx/csv，多份是 zip。
     * 以 URL 里的对象键后缀为准（与邮件附件同一判据）。
     */
    private static getExportFileType(
        url: string,
        singleFileType: DownloadFileType,
    ): DownloadFileType | 'zip' {
        return /\.zip(\?|$)/i.test(url) ? 'zip' : singleFileType;
    }

    /**
     * 看板导出每张图前置的「筛选器常量列」。
     *
     * 列名优先用筛选器自定义名，缺失时用 explore 里的字段 label；
     * 所以需要 chart 的 explore。同一张表的多张图只拉一次。
     * 列的范围与该图查询侧一致（只保留落在 explore 表里的筛选器），
     * explore 不可用时退回字段 id，不阻断导出。
     */
    private async getExportFilterColumnsForTile({
        filters,
        exploreCache,
        timezone,
        locale,
        account,
        projectUuid,
        tableName,
        metricQuery,
        exportedFieldIds,
    }: {
        filters: DashboardFilters;
        exploreCache: Map<string, ExportExploreInfo>;
        /** 项目时区：相对时间/动态日期按查询侧同一时区解析 */
        timezone?: string;
        /** UI 语言：筛选器列名与取值用词（缺省中文） */
        locale?: string;
        account: QueryAccount;
        projectUuid: string;
        tableName: string;
        metricQuery: MetricQuery;
        exportedFieldIds: string[];
    }): Promise<ExportFilterColumn[]> {
        if (
            getExportFilterColumns({
                filters,
                timezone,
                locale,
                exportedFieldIds,
            }).length === 0
        )
            return [];

        let exploreInfo = exploreCache.get(tableName);
        if (!exploreInfo) {
            try {
                const explore = await this.projectService.getExplore(
                    account,
                    projectUuid,
                    tableName,
                );
                exploreInfo = {
                    itemMap: getItemMap(
                        explore,
                        metricQuery.additionalMetrics,
                        metricQuery.tableCalculations,
                        metricQuery.customDimensions,
                    ),
                    tables: Object.keys(explore.tables),
                };
            } catch (e) {
                Logger.warn(
                    `Failed to resolve explore "${tableName}" for export filter columns: ${getErrorMessage(
                        e,
                    )}`,
                );
                exploreInfo = { itemMap: {}, tables: [] };
            }
            exploreCache.set(tableName, exploreInfo);
        }

        const { itemMap, tables } = exploreInfo;
        // explore 拿不到时（tables 为空）不收敛，仍然输出列，避免静默丢信息
        const filtersForChart: DashboardFilters =
            tables.length === 0
                ? filters
                : {
                      dimensions: filters.dimensions.filter((rule) =>
                          tables.includes(rule.target.tableName),
                      ),
                      metrics: filters.metrics.filter((rule) =>
                          tables.includes(rule.target.tableName),
                      ),
                      tableCalculations: filters.tableCalculations.filter(
                          (rule) => tables.includes(rule.target.tableName),
                      ),
                  };

        return getExportFilterColumns({
            filters: filtersForChart,
            itemMap,
            timezone,
            locale,
            exportedFieldIds,
        });
    }

    /**
     * 失败 tile 的展示名：尽量取图表/ SQL 图名称，查不到则退化为 uuid 前缀，
     * 避免交付提示里只出现一串 id。失败路径才会调用（数量有限）。
     */
    private async getFailedTileName(
        kind: 'chart' | 'sqlChart',
        chartUuid: string,
        projectUuid: string,
    ): Promise<string> {
        try {
            const name =
                kind === 'chart'
                    ? (
                          await this.schedulerService.savedChartModel.get(
                              chartUuid,
                          )
                      ).name
                    : (
                          await this.asyncQueryService.savedSqlModel.getByUuid(
                              chartUuid,
                              { projectUuid },
                          )
                      ).name;
            return name || chartUuid.slice(0, 8);
        } catch {
            return chartUuid.slice(0, 8);
        }
    }

    /**
     * 把失败清单并进 job 的完成行 details：logSchedulerJob 是 insert，
     * 中途 updateJobDetails 只改旧行，完成行会看不到，所以随返回值写进去。
     */
    private static withFailedExports<T extends Record<string, unknown>>(
        details: T,
        failedExports: NotificationPayloadBase['page']['failedExports'],
    ): T & {
        failedExports?: NonNullable<
            NotificationPayloadBase['page']['failedExports']
        >;
    } {
        return failedExports && failedExports.length > 0
            ? { ...details, failedExports }
            : details;
    }

    /**
     * 把 page.failedExports 压成一行提示（Slack / Teams 用，与这两个渠道既有英文文案一致）。
     * 最多列 10 个文件，其余用「+N more」汇总；无失败时返回 undefined，调用方据此不渲染。
     */
    private static formatFailedExports(
        failedExports: NotificationPayloadBase['page']['failedExports'],
    ): string | undefined {
        if (!failedExports || failedExports.length === 0) {
            return undefined;
        }

        const maxNames = 10;
        const names = failedExports
            .slice(0, maxNames)
            .map((failedExport) => failedExport.filename);
        const remaining = failedExports.length - names.length;
        const nameList =
            remaining > 0
                ? `${names.join(', ')} (+${remaining} more)`
                : names.join(', ');

        return `${failedExports.length} chart(s) failed to export: ${nameList}`;
    }

    /** 清理 keepTempFile 留下的本地中间文件（只处理本地路径，S3 URL 跳过） */
    private async cleanupLocalExportFiles(
        files: NonNullable<NotificationPayloadBase['page']['csvUrls']>,
    ): Promise<void> {
        await Promise.all(
            files.map(async (file) => {
                const localPath =
                    'localPath' in file ? file.localPath : undefined;
                if (!localPath || /^https?:\/\//.test(localPath)) return;
                await fs.unlink(localPath).catch(() => undefined);
            }),
        );
    }

    private async createExportZipDownloadUrl({
        files,
        fileExtension,
        zipNameBase,
    }: {
        files: Array<{ entryNameBase: string; localPath: string }>;
        fileExtension: 'csv' | 'xlsx';
        zipNameBase: string;
    }): Promise<string> {
        if (files.length === 0) {
            throw new UnexpectedServerError('No files to include in zip');
        }

        const zipPath = `/tmp/${nanoid()}.zip`;
        const output = fsSync.createWriteStream(zipPath);
        // xlsx 本身是 zip 容器，再按 level 9 压几乎不减小体积，只烧 CPU；
        // csv 文本用 6（9 与 6 的体积差很小，但耗时差一倍以上）
        const archive = archiver('zip', {
            zlib: { level: fileExtension === 'xlsx' ? 0 : 6 },
        });
        const zipDone = new Promise<void>((resolve, reject) => {
            output.on('close', () => resolve());
            output.on('error', reject);
            archive.on('error', reject);
        });
        // 先挂一个空 catch：zipDone 可能在 await 之前就因输出流错误而 reject，
        // 那样会变成 unhandled rejection（Node 默认直接崩进程）；
        // 真正需要感知错误的 await 处仍会正常抛出
        void zipDone.catch(() => undefined);
        archive.pipe(output);

        // 等待 archiver 把某个条目完整写入 zip（按 name 匹配；entry 名已去重、必唯一）。
        // http 条目 append 之后必须等本条目消费完才能放行，限流器才能约束
        // 「已打开但尚未被泵走」的下载流数量。
        const entryWaiters: Array<{
            name: string;
            resolve: () => void;
            reject: (error: Error) => void;
        }> = [];
        const entryDone = (name: string): Promise<void> =>
            new Promise<void>((resolve, reject) => {
                entryWaiters.push({ name, resolve, reject });
            });
        archive.on('entry', (entry) => {
            const index = entryWaiters.findIndex(
                (waiter) => waiter.name === entry.name,
            );
            if (index >= 0) {
                entryWaiters.splice(index, 1)[0].resolve();
            }
        });
        archive.on('error', (error) => {
            // 归档出错时唤醒所有等待中的条目，避免限流 worker 卡死
            for (const waiter of entryWaiters.splice(0)) {
                waiter.reject(error);
            }
        });

        // 同时打开的 http 下载流上限：archiver 串行消费已 append 的流，
        // 同时打开太多只会把所有响应一起拉进内存
        const maxOpenDownloadStreams = 3;

        try {
            // entryName 分配必须同步、按输入顺序完成：并发下载的响应到达
            // 顺序不确定，若在 mapper 里分配，同名文件的 _2 后缀会随竞态漂移
            const entryNames = dedupeZipEntryNames(
                files.map((file) => file.entryNameBase),
                fileExtension,
            );

            // http 分支流式 append（Readable.fromWeb），不再 arrayBuffer() 全量
            // 进内存，内存峰值从「所有产物之和」降到「少数在途分块」。
            // 取舍：条目在 zip 内的顺序 = append 顺序 = 各下载响应的到达顺序，
            // 不保证与输入顺序一致（条目命名是确定的）；要顺序完全确定只能
            // 全量缓冲后再按序 append，与流式目标冲突，故放弃顺序保证。
            const appendResults = await mapWithConcurrencyLimit(
                files,
                maxOpenDownloadStreams,
                async (file, index) => {
                    const entryName = entryNames[index];
                    if (
                        file.localPath.startsWith('http://') ||
                        file.localPath.startsWith('https://')
                    ) {
                        const response = await fetch(file.localPath);
                        if (!response.ok || !response.body) {
                            throw new UnexpectedServerError(
                                `Failed to download export file "${file.entryNameBase}"`,
                            );
                        }
                        // undici 的 Response.body 与 node:stream/web 的
                        // ReadableStream 类型声明不同源，结构等价，这里断言桥接
                        archive.append(
                            Readable.fromWeb(
                                response.body as import('stream/web').ReadableStream,
                            ),
                            {
                                name: entryName,
                            },
                        );
                        await entryDone(entryName);
                    } else {
                        archive.file(file.localPath, { name: entryName });
                    }
                },
            );

            const failure = appendResults.find(
                (result) => result.status === 'rejected',
            );
            if (failure?.status === 'rejected') {
                throw failure.reason;
            }

            await archive.finalize();
            await zipDone;

            const zipFileName = `${sanitizeGenericFileName(
                zipNameBase,
            )}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
            // 必须 await：否则 uploadZip 的读取流还没被消费，finally 里的
            // unlink 就先跑，出现在 createReadStream 打开前文件已被删除的
            // ENOENT（open '/tmp/<id>.zip'）
            return await this.s3Client.uploadZip(
                fsSync.createReadStream(zipPath),
                zipFileName,
            );
        } catch (e) {
            // 收口：中止归档并销毁输出流，否则 finally 的 unlink 会删一个
            // 仍被写流占用的路径；zipDone 可能以 error 收场，吞掉避免
            // unhandled rejection
            archive.abort();
            output.destroy();
            void zipDone.catch(() => undefined);
            throw e;
        } finally {
            await fs.unlink(zipPath).catch(() => undefined);
        }
    }

    protected async replaceCustomFields(
        jobId: string,
        scheduledTime: Date,
        payload: ReplaceCustomFieldsPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS,
                jobId,
                scheduledTime,
                details: {
                    userUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            },
            async (): Promise<{
                replaceableCustomFields: ReplaceableCustomFields;
                replaceFields: ReplaceCustomFields;
                updatedCharts: Array<Pick<SavedChartDAO, 'uuid' | 'name'>>;
            }> => {
                const replaceableCustomFields =
                    await this.projectService.findReplaceableCustomFields(
                        payload,
                    );
                const replaceFields =
                    convertReplaceableFieldMatchMapToReplaceCustomFields(
                        replaceableCustomFields,
                    );
                const updatedCharts =
                    await this.projectService.replaceCustomFields({
                        userUuid: payload.userUuid,
                        projectUuid: payload.projectUuid,
                        organizationUuid: payload.organizationUuid,
                        replaceFields,
                        skipChartsUpdatedAfter: scheduledTime,
                    });
                return {
                    replaceableCustomFields,
                    replaceFields,
                    updatedCharts,
                };
            },
        );
    }

    protected async renameResources(
        jobId: string,
        scheduledTime: Date,
        payload: RenameResourcesPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.RENAME_RESOURCES,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const results =
                    await this.renameService.runScheduledRenameResources(
                        payload,
                    );
                return { results };
            },
        );
    }

    protected async downloadAsyncQueryResults(
        jobId: string,
        scheduledTime: Date,
        payload: DownloadAsyncQueryResultsPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const sessionUser = await this.userService.getSessionByUserUuid(
                    payload.userUuid,
                );
                const account = Account.fromSession(sessionUser);
                return this.asyncQueryService.download({
                    account,
                    ...payload,
                });
            },
        );
    }
}
