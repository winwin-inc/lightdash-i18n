import {
    CatalogType,
    ForbiddenError,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CatalogSearchContext } from '../../models/CatalogModel/CatalogModel';
import {
    projectSummary,
    user,
    validExplore,
} from '../ProjectService/ProjectService.mock';
import { CatalogService } from './CatalogService';

const getMockedCatalogService = () => {
    const dashboardService = {
        getAllowedExploreNamesForViewer: jest.fn(async () => undefined),
    };

    const catalogModel = {
        getMetadata: jest.fn(async () => validExplore),
        search: jest.fn(async () => ({
            data: [
                { type: CatalogType.Table, name: 'valid_explore' },
                { type: CatalogType.Table, name: 'other_explore' },
            ],
        })),
    };

    const service = new CatalogService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            getSummary: jest.fn(async () => projectSummary),
            findExploresFromCache: jest.fn(async () => ({
                valid_explore: validExplore,
            })),
            getTablesConfiguration: jest.fn(async () => ({
                tableSelection: { type: 'ALL', value: null },
            })),
        } as never,
        userAttributesModel: {
            getAttributeValuesForOrgMember: jest.fn(async () => ({})),
        } as never,
        catalogModel: catalogModel as never,
        savedChartModel: {} as never,
        spaceModel: {} as never,
        tagsModel: {} as never,
        changesetModel: {} as never,
        dashboardService,
    });

    return { service, dashboardService, catalogModel };
};

describe('CatalogService explore viewer allow-list', () => {
    const { projectUuid } = projectSummary;
    const catalogUser: SessionUser = {
        ...user,
        organizationUuid: projectSummary.organizationUuid,
        organizationName: 'organizationName',
        organizationCreatedAt: new Date(),
    };

    test('should skip metadata check when allow-list is undefined', async () => {
        const { service, catalogModel } = getMockedCatalogService();

        await service.getMetadata(catalogUser, projectUuid, 'valid_explore');

        expect(catalogModel.getMetadata).toHaveBeenCalledWith(
            projectUuid,
            'valid_explore',
        );
    });

    test('should reject metadata when table is not on allow-list', async () => {
        const { service, dashboardService, catalogModel } =
            getMockedCatalogService();
        dashboardService.getAllowedExploreNamesForViewer.mockResolvedValueOnce(
            new Set(['valid_explore']),
        );

        await expect(
            service.getMetadata(catalogUser, projectUuid, 'other_explore'),
        ).rejects.toThrow(ForbiddenError);
        expect(catalogModel.getMetadata).not.toHaveBeenCalled();
    });

    test('should filter catalog search by allow-list', async () => {
        const { service, dashboardService } = getMockedCatalogService();
        dashboardService.getAllowedExploreNamesForViewer.mockResolvedValue(
            new Set(['valid_explore']),
        );

        const result = await service.getCatalog(
            catalogUser,
            projectUuid,
            { searchQuery: 'explore' },
            CatalogSearchContext.CATALOG,
        );

        expect(result.data).toEqual([
            { type: CatalogType.Table, name: 'valid_explore' },
        ]);
    });
});
