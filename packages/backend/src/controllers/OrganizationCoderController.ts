import {
    type ApiCustomRoleAsCodeListResponse,
    type ApiErrorPayload,
    type ApiGroupAsCodeListResponse,
    type ApiUserAsCodeListResponse,
} from '@lightdash/common';
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
import { BaseController } from './baseController';
import { CODE_READ_MIDDLEWARES, codeSuccess } from './CoderControllerUtils';

@Route('/api/v2/orgs/{orgUuid}')
@Response<ApiErrorPayload>('default', 'Error')
export class OrganizationCoderController extends BaseController {
    /**
     * Get custom roles in code representation
     * @summary List custom roles as code
     */
    @Tags('v2', 'Custom Roles')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/roles')
    @OperationId('GetCodeCustomRoles')
    async getCustomRolesAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiCustomRoleAsCodeListResponse> {
        const customRoles = await this.services
            .getRolesService()
            .getCustomRolesAsCode(req.user!, orgUuid);
        this.setStatus(200);
        return codeSuccess({ customRoles });
    }

    @Tags('v2', 'Organizations')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/users')
    @OperationId('GetCodeOrganizationUsers')
    async getUsersAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiUserAsCodeListResponse> {
        const users = await this.services
            .getRolesService()
            .getUsersAsCode(req.user!, orgUuid);
        this.setStatus(200);
        return codeSuccess({ users });
    }

    @Tags('v2', 'Organizations')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/code/groups')
    @OperationId('GetCodeOrganizationGroups')
    async getGroupsAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiGroupAsCodeListResponse> {
        const groups = await this.services
            .getGroupService()
            .getGroupsAsCode(req.user!, orgUuid);
        this.setStatus(200);
        return codeSuccess({ groups });
    }
}
