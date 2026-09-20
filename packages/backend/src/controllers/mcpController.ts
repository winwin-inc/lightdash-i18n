import { ApiErrorPayload } from '@lightdash/common';
import {
    Body,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import type { McpTokenExchangeResult } from '../services/McpTokenExchangeService';
import { BaseController } from './baseController';

export type McpTokenExchangeRequest = {
    email: string;
};

export type ApiMcpTokenExchangeResponse = {
    status: 'ok';
    results: McpTokenExchangeResult;
};

/**
 * MCP service-to-service endpoints (shared secret, not end-user session).
 */
@Route('/api/v1/mcp')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('MCP')
export class McpController extends BaseController {
    /**
     * Exchange a verified user email for a short-lived Personal Access Token.
     * Authenticated via Authorization: Bearer &lt;LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET&gt;.
     * @summary MCP token exchange
     */
    @SuccessResponse('200', 'Success')
    @Post('/token-exchange')
    @OperationId('mcpTokenExchange')
    async tokenExchange(
        @Body() body: McpTokenExchangeRequest,
        @Request() req: express.Request,
    ): Promise<ApiMcpTokenExchangeResponse> {
        this.setStatus(200);
        const results = await this.services
            .getMcpTokenExchangeService()
            .exchangeEmailForPat({
                authorizationHeader: req.headers.authorization,
                email: body.email,
            });
        return {
            status: 'ok',
            results,
        };
    }
}
