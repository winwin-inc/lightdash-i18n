import { AnyType } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { McpToolName } from './McpToolName';
import { McpService } from './McpService';

// The warehouses package pulls in native warehouse drivers, which are not
// needed to test the MCP tool inventory.
jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

/**
 * The full set of tools exposed by the unified MCP server.
 *
 * It matches the tool list of the standalone `packages/lightdash-mcp` package
 * (26 tools). When a tool is added or removed, this list must be updated in
 * the same change.
 */
const EXPECTED_TOOL_NAMES: string[] = [
    'find_charts',
    'find_content',
    'find_dashboards',
    'find_explores',
    'find_fields',
    'find_spaces',
    'get_current_project',
    'get_dashboard_code',
    'get_dashboard_tiles',
    'get_lightdash_version',
    'get_mcp_docs',
    'get_my_access',
    'get_saved_chart',
    'get_site_info',
    'list_charts',
    'list_dashboards',
    'list_explores',
    'list_projects',
    'list_spaces',
    'list_verified_content',
    'run_dashboard_tiles',
    'run_metric_query',
    'run_saved_chart',
    'run_semantic_metric_query',
    'search_field_values',
    'set_project',
];

const buildService = (): McpService => {
    const lightdashConfig = {
        mcp: {
            enabled: true,
            oauthRequiredScopes: ['mcp:read'],
        },
    } as AnyType as LightdashConfig;

    return new McpService({
        lightdashConfig,
        analytics: {} as AnyType,
        catalogService: {} as AnyType,
        projectModel: {} as AnyType,
        projectService: {} as AnyType,
        userAttributesModel: {} as AnyType,
        searchModel: {} as AnyType,
        spaceModel: {} as AnyType,
        spaceService: {} as AnyType,
        mcpContextModel: {} as AnyType,
        featureFlagService: {} as AnyType,
        contentService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        searchService: {} as AnyType,
    });
};

describe('McpService tool inventory', () => {
    it('registers every tool of the unified MCP server exactly once', () => {
        const mcpService = buildService();

        expect(mcpService.registeredToolNames).toEqual(
            EXPECTED_TOOL_NAMES,
        );
    });

    it('registers every name of the tool name enum', () => {
        const mcpService = buildService();
        const enumNames = Object.values(McpToolName).sort();

        expect(mcpService.registeredToolNames).toEqual(enumNames);
    });

    it('does not register a tool twice', () => {
        const mcpService = buildService();
        const names = mcpService.registeredToolNames;

        expect(new Set(names).size).toEqual(names.length);
    });
});
