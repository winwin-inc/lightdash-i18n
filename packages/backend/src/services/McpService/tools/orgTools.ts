import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import { McpToolRegistry } from './registry';

/**
 * Registers the tools that describe the Lightdash instance itself.
 */
export const registerOrgTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.GET_SITE_INFO,
        {
            description:
                'Get the Lightdash site urls. `siteBaseUrl` is used to build links that can be opened in a browser, `apiBaseUrl` is the base url of the Lightdash API.',
            inputSchema: {},
        },
        async (_args, context) =>
            jsonToolResult({
                siteBaseUrl: deps.lightdashConfig.siteUrl,
                apiBaseUrl: `${deps.lightdashConfig.siteUrl}/api/v1`,
                organizationUuid: context.organizationUuid,
            }),
    );
};
