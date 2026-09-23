import {
    type AnyType,
    type ApiChartAsCodeListResponse,
    type ApiChartAsCodeUpsertResponse,
    type ApiDashboardAsCodeListResponse,
    type ApiDashboardAsCodeUpsertResponse,
    type ApiErrorPayload,
    type ApiSpaceAsCodeListResponse,
    type ApiSpaceAsCodeUpsertResponse,
    type ApiSqlChartAsCodeListResponse,
    type ApiSqlChartAsCodeUpsertResponse,
    type ApiVirtualViewAsCodeListResponse,
    type ApiVirtualViewAsCodeUpsertResponse,
    type ChartAsCode,
    type DashboardAsCode,
    type DashboardTab,
    type SpaceAsCode,
    type SqlChartAsCode,
    type VirtualViewAsCode,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from './baseController';
import {
    CODE_READ_MIDDLEWARES,
    CODE_WRITE_MIDDLEWARES,
    codeSuccess,
    restoreDashboardTabFilters,
} from './CoderControllerUtils';

@Route('/api/v1/projects/{projectUuid}')
@Response<ApiErrorPayload>('default', 'Error')
export class ProjectCoderController extends BaseController {
    /**
     * Download charts as code
     * @summary Get charts as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/charts')
    @OperationId('getCodeCharts')
    async getCodeCharts(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
        @Query() languageMap?: boolean,
    ): Promise<ApiChartAsCodeListResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getCharts(req.user!, projectUuid, ids, offset, languageMap),
        );
    }

    /**
     * Download dashboards as code
     * @summary Get dashboards as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/dashboards')
    @OperationId('getCodeDashboards')
    async getCodeDashboards(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
        @Query() languageMap?: boolean,
    ): Promise<ApiDashboardAsCodeListResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getDashboards(
                    req.user!,
                    projectUuid,
                    ids,
                    offset,
                    languageMap,
                ),
        );
    }

    /**
     * Download SQL charts as code
     * @summary Get SQL charts as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/sqlCharts')
    @OperationId('getCodeSqlCharts')
    async getCodeSqlCharts(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() ids?: string[],
        @Query() offset?: number,
    ): Promise<ApiSqlChartAsCodeListResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getSqlCharts(req.user!, projectUuid, ids, offset),
        );
    }

    /**
     * Download spaces as code
     * @summary Get spaces as code
     */
    @Tags('Spaces')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/spaces')
    @OperationId('getCodeSpaces')
    async getCodeSpaces(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceAsCodeListResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getSpaces(req.user!, projectUuid),
        );
    }

    /**
     * Download virtual views as code
     * @summary Get virtual views as code
     */
    @Tags('Projects')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/virtualViews')
    @OperationId('getCodeVirtualViews')
    async getCodeVirtualViews(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() slugs?: string[],
    ): Promise<ApiVirtualViewAsCodeListResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .getVirtualViews(req.user!, projectUuid, slugs),
        );
    }

    /**
     * Upsert a chart from code
     * @summary Upsert chart as code
     */
    @Tags('Projects')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/code/charts/{slug}')
    @OperationId('upsertCodeChart')
    async upsertCodeChart(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        chart: Omit<
            ChartAsCode,
            'metricQuery' | 'chartConfig' | 'description'
        > & {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
            force?: boolean;
            spaceNames?: Record<string, string>;
            filePath?: string;
            chartConfig: AnyType;
            metricQuery: AnyType;
            description?: string | null;
        },
        @Request() req: express.Request,
    ): Promise<ApiChartAsCodeUpsertResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services.getCoderService().upsertChart(
                req.user!,
                projectUuid,
                slug,
                {
                    ...chart,
                    description: chart.description ?? undefined,
                },
                chart.skipSpaceCreate,
                chart.publicSpaceCreate,
                chart.spaceNames,
            ),
        );
    }

    /**
     * Upsert an SQL chart from code
     * @summary Upsert SQL chart as code
     */
    @Tags('Projects')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/code/sqlCharts/{slug}')
    @OperationId('upsertCodeSqlChart')
    async upsertCodeSqlChart(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        sqlChart: Omit<SqlChartAsCode, 'config' | 'description'> & {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
            force?: boolean;
            spaceNames?: Record<string, string>;
            config: AnyType;
            description?: string | null;
        },
        @Request() req: express.Request,
    ): Promise<ApiSqlChartAsCodeUpsertResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertSqlChart(
                    req.user!,
                    projectUuid,
                    slug,
                    { ...sqlChart, description: sqlChart.description ?? null },
                    sqlChart.skipSpaceCreate,
                    sqlChart.publicSpaceCreate,
                    sqlChart.force,
                    sqlChart.spaceNames,
                ),
        );
    }

    /**
     * Upsert a dashboard from code
     * @summary Upsert dashboard as code
     */
    @Tags('Projects')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/code/dashboards/{slug}')
    @OperationId('upsertCodeDashboard')
    async upsertCodeDashboard(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        dashboard: Omit<
            DashboardAsCode,
            'filters' | 'tiles' | 'description'
        > & {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
            force?: boolean;
            spaceNames?: Record<string, string>;
            filePath?: string;
            filters: AnyType;
            tiles: AnyType;
            description?: string | null;
        },
        @Request() req: express.Request,
    ): Promise<ApiDashboardAsCodeUpsertResponse> {
        const rawBody = req.body as Partial<DashboardAsCode> & {
            tabs?: Array<Partial<DashboardTab> & { slug?: string }>;
        };
        const dashboardWithFilters = restoreDashboardTabFilters(
            {
                ...dashboard,
                description: dashboard.description ?? undefined,
            },
            rawBody,
        );
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertDashboard(
                    req.user!,
                    projectUuid,
                    slug,
                    dashboardWithFilters,
                    dashboard.skipSpaceCreate,
                    dashboard.publicSpaceCreate,
                    dashboard.spaceNames,
                ),
        );
    }

    /**
     * Create or update a space from code
     * @summary Upsert space as code
     */
    @Tags('Spaces')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/code/spaces')
    @OperationId('upsertCodeSpace')
    async upsertCodeSpace(
        @Path() projectUuid: string,
        @Body() space: SpaceAsCode,
        @Request() req: express.Request,
        @Query() skipSpaceCreate: boolean = false,
        @Query() publicSpaceCreate: boolean = false,
    ): Promise<ApiSpaceAsCodeUpsertResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertSpace(req.user!, projectUuid, space, {
                    skipSpaceCreate,
                    publicSpaceCreate,
                }),
        );
    }

    /**
     * Upsert a virtual view from code
     * @summary Upsert virtual view as code
     */
    @Tags('Projects')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/code/virtualViews/{slug}')
    @OperationId('upsertCodeVirtualView')
    async upsertCodeVirtualView(
        @Path() projectUuid: string,
        @Path() slug: string,
        @Body()
        virtualView: Omit<VirtualViewAsCode, 'columns'> & {
            columns: AnyType;
        },
        @Request() req: express.Request,
    ): Promise<ApiVirtualViewAsCodeUpsertResponse> {
        this.setStatus(200);
        return codeSuccess(
            await this.services
                .getCoderService()
                .upsertVirtualView(req.user!, projectUuid, slug, virtualView),
        );
    }
}
