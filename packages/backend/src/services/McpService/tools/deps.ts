import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
import { McpContextModel } from '../../../models/McpContextModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../../models/SearchModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { CatalogService } from '../../CatalogService/CatalogService';
import { ContentService } from '../../ContentService/ContentService';
import { DashboardService } from '../../DashboardService/DashboardService';
import { FeatureFlagService } from '../../FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../ProjectService/ProjectService';
import { SavedChartService } from '../../SavedChartsService/SavedChartService';
import { SearchService } from '../../SearchService/SearchService';
import { SpaceService } from '../../SpaceService/SpaceService';

/**
 * Services and models available to the MCP tools.
 *
 * Tools must call these services directly - they must never perform HTTP
 * requests against the Lightdash REST API from inside the main backend.
 */
export type McpToolDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    catalogService: CatalogService;
    projectService: ProjectService;
    projectModel: ProjectModel;
    userAttributesModel: UserAttributesModel;
    searchModel: SearchModel;
    searchService: SearchService;
    spaceModel: SpaceModel;
    spaceService: SpaceService;
    contentService: ContentService;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
    mcpContextModel: McpContextModel;
    featureFlagService: FeatureFlagService;
};
