import {
    ApiErrorPayload,
    ApiProjectOperationLogListResponse,
    ApiProjectOperationLogPurgeResponse,
    ApiProjectOperationLogResponse,
    type ProjectOperationLogPurgeBody,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/operation-logs')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectOperationLogController extends BaseController {
    /**
     * List project operation logs (admin / project manage)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listProjectOperationLogs')
    async list(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() from?: string,
        @Query() to?: string,
        @Query() action?: string,
        @Query() actorUserUuid?: string,
        @Query() actorEmail?: string,
        @Query() resourceType?: string,
        @Query() resourceUuid?: string,
        @Query() q?: string,
    ): Promise<ApiProjectOperationLogListResponse> {
        this.setStatus(200);
        const results = await req.services
            .getProjectOperationLogService()
            .list(req.user!, projectUuid, {
                page,
                pageSize,
                from,
                to,
                action,
                actorUserUuid,
                actorEmail,
                resourceType,
                resourceUuid,
                q,
            });
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get a single operation log including summary
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{operationLogUuid}')
    @OperationId('getProjectOperationLog')
    async get(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() operationLogUuid: string,
    ): Promise<ApiProjectOperationLogResponse> {
        this.setStatus(200);
        const results = await req.services
            .getProjectOperationLogService()
            .get(req.user!, projectUuid, operationLogUuid);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Purge operation logs by retention days (min 30) or clear all (mode=all)
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('purgeProjectOperationLogs')
    async purge(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ProjectOperationLogPurgeBody,
    ): Promise<ApiProjectOperationLogPurgeResponse> {
        this.setStatus(200);
        const results = await req.services
            .getProjectOperationLogService()
            .purge(req.user!, projectUuid, body ?? {});
        return {
            status: 'ok',
            results,
        };
    }
}