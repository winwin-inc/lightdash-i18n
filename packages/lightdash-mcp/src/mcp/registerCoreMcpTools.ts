import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LightdashMcpEnvConfig } from '../config';
import type { LightdashRestClient } from '../rest/lightdashRest';
import { registerAgentTools } from './tools/registerAgentTools';
import { registerContentTools } from './tools/registerContentTools';
import { registerExploreCatalogTools } from './tools/registerExploreCatalogTools';
import type { CoreQueryToolsDeps } from './tools/registerQueryTools';
import { registerQueryTools } from './tools/registerQueryTools';
import { registerOrgAndHealthTools } from './tools/registerOrgAndHealthTools';
import { registerSessionProjectTools } from './tools/registerSessionProjectTools';

/** 通过 REST 暴露的 16 个标准 MCP 工具名（与 Lightdash 文档中的工具名一致）。 */
export function registerCoreMcpTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
    deps: CoreQueryToolsDeps,
): void {
    registerOrgAndHealthTools(server, config, api);
    registerSessionProjectTools(server, config, api);
    registerAgentTools(server, config, api);
    registerExploreCatalogTools(server, config, api);
    registerContentTools(server, config, api);
    registerQueryTools(server, config, api, deps);
}

export type { CoreQueryToolsDeps } from './tools/registerQueryTools';
