import { ForbiddenError, SessionUser } from '@lightdash/common';
import {
    ChartTemplateClient,
    ChartTemplateDetail,
    ChartTemplateListItem,
} from '../../clients/ChartTemplateClient/ChartTemplateClient';
import { BaseService } from '../BaseService';

type ChartTemplateServiceArgs = {
    chartTemplateClient: ChartTemplateClient;
};

export class ChartTemplateService extends BaseService {
    private readonly chartTemplateClient: ChartTemplateClient;

    constructor({ chartTemplateClient }: ChartTemplateServiceArgs) {
        super();
        this.chartTemplateClient = chartTemplateClient;
    }

    // Global template API still requires authenticated organization members.
    private static assertCanReadTemplates(user: SessionUser) {
        if (!user.organizationUuid) {
            throw new ForbiddenError(
                'User must belong to an organization to access chart templates',
            );
        }
    }

    async getChartTemplates(
        user: SessionUser,
    ): Promise<ChartTemplateListItem[]> {
        ChartTemplateService.assertCanReadTemplates(user);
        return this.chartTemplateClient.getTemplates();
    }

    async getChartTemplateById(
        user: SessionUser,
        templateId: string,
    ): Promise<ChartTemplateDetail> {
        ChartTemplateService.assertCanReadTemplates(user);
        return this.chartTemplateClient.getTemplateById(templateId);
    }
}
