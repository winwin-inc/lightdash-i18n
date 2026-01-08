import { ApiErrorPayload } from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from './authentication';
import { BaseController } from './baseController';
import { LogService, type FrontendLogData } from '../services/LogService/LogService';

@Route('/api/v1/logs')
@Response<ApiErrorPayload>('default', 'Error')
export class LogController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('LogFromFrontend')
    async logFromFrontend(
        @Request() req: express.Request,
        @Body()
        body: FrontendLogData,
    ): Promise<{ status: 'ok' }> {
        this.setStatus(200);

        // 添加用户上下文信息
        const logData: FrontendLogData = {
            ...body,
            context: {
                ...body.context,
                userId: req.user?.userUuid,
                organizationId: req.user?.organizationUuid,
                userAgent: req.headers['user-agent'],
                url: req.headers.referer,
            },
        };

        this.getLogService().logFromFrontend(logData);

        return {
            status: 'ok',
        };
    }

    /**
     * Convenience method to access the log service without having
     * to specify an interface type.
     */
    protected getLogService() {
        return this.services.getLogService();
    }
}

