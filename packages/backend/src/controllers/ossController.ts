import {
    ApiErrorPayload,
    ApiOssUploadUrlRequest,
    ApiOssUploadUrlResponse,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Post,
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
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/oss')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('OSS')
export class OssController extends BaseController {
    /**
     * Get presigned URL for file upload
     * @summary Get upload URL
     * @param req express request
     * @param body file upload request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/upload-url')
    @SuccessResponse('200', 'Success')
    @OperationId('GetOssUploadUrl')
    async getUploadUrl(
        @Request() req: express.Request,
        @Body() body: ApiOssUploadUrlRequest,
    ): Promise<ApiOssUploadUrlResponse> {
        const { fileName, contentType, fileSize } = body;
        const { userUuid } = req.user!;

        const { uploadUrl, fileId } = await this.services
            .getOssService()
            .getUploadUrl(userUuid, fileName, contentType, fileSize);

        return {
            status: 'ok',
            results: {
                uploadUrl,
                fileId,
            },
        };
    }
}
