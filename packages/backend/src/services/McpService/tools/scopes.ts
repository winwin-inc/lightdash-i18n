import { OAuthScope } from '../../OAuthService/OAuthService';
import { McpToolName } from '../McpToolName';

/**
 * Scope required to call a given tool.
 *
 * `mcp:read` covers tools that only explore/query data.
 * `mcp:write` is reserved for tools that mutate content in Lightdash.
 */
export enum McpToolScope {
    Read = OAuthScope.MCP_READ,
    Write = OAuthScope.MCP_WRITE,
}

export const MCP_TOOL_SCOPES: Record<McpToolName, McpToolScope> = {
    [McpToolName.GET_LIGHTDASH_VERSION]: McpToolScope.Read,
    [McpToolName.GET_SITE_INFO]: McpToolScope.Read,
    [McpToolName.GET_MY_ACCESS]: McpToolScope.Read,
    [McpToolName.FIND_EXPLORES]: McpToolScope.Read,
    [McpToolName.LIST_EXPLORES]: McpToolScope.Read,
    [McpToolName.FIND_FIELDS]: McpToolScope.Read,
    [McpToolName.FIND_DASHBOARDS]: McpToolScope.Read,
    [McpToolName.FIND_CHARTS]: McpToolScope.Read,
    [McpToolName.FIND_SPACES]: McpToolScope.Read,
    [McpToolName.FIND_CONTENT]: McpToolScope.Read,
    [McpToolName.LIST_PROJECTS]: McpToolScope.Read,
    [McpToolName.LIST_SPACES]: McpToolScope.Read,
    [McpToolName.LIST_CHARTS]: McpToolScope.Read,
    [McpToolName.LIST_DASHBOARDS]: McpToolScope.Read,
    [McpToolName.LIST_VERIFIED_CONTENT]: McpToolScope.Read,
    [McpToolName.SET_PROJECT]: McpToolScope.Read,
    [McpToolName.GET_CURRENT_PROJECT]: McpToolScope.Read,
    [McpToolName.GET_SAVED_CHART]: McpToolScope.Read,
    [McpToolName.RUN_SAVED_CHART]: McpToolScope.Read,
    [McpToolName.GET_DASHBOARD_TILES]: McpToolScope.Read,
    [McpToolName.RUN_DASHBOARD_TILES]: McpToolScope.Read,
    [McpToolName.GET_DASHBOARD_CODE]: McpToolScope.Read,
    [McpToolName.RUN_METRIC_QUERY]: McpToolScope.Read,
    [McpToolName.RUN_SEMANTIC_METRIC_QUERY]: McpToolScope.Read,
    [McpToolName.SEARCH_FIELD_VALUES]: McpToolScope.Read,
    [McpToolName.GET_MCP_DOCS]: McpToolScope.Read,
};
