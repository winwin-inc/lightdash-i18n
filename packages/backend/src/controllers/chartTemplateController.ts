import { ApiErrorPayload } from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/chart-templates')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Chart templates')
export class ChartTemplateController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getChartTemplates')
    async getChartTemplates(
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: Record<string, unknown>[] }> {
        this.setStatus(200);
        const results = await this.services
            .getChartTemplateService()
            .getChartTemplates(req.user!);

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{templateId}')
    @OperationId('getChartTemplateById')
    async getChartTemplateById(
        @Path() templateId: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: Record<string, unknown> }> {
        this.setStatus(200);
        const results = await this.services
            .getChartTemplateService()
            .getChartTemplateById(req.user!, templateId);

        return {
            status: 'ok',
            results,
        };
    }
}
