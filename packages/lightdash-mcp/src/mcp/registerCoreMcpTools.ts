import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LightdashMcpEnvConfig } from '../config';
import type { LightdashRestClient } from '../rest/lightdashRest';
import { registerContentTools } from './tools/registerContentTools';
import { registerExploreCatalogTools } from './tools/registerExploreCatalogTools';
import type { CoreQueryToolsDeps } from './tools/registerQueryTools';
import { registerQueryTools } from './tools/registerQueryTools';
import { registerOrgAndHealthTools } from './tools/registerOrgAndHealthTools';
import { registerSessionProjectTools } from './tools/registerSessionProjectTools';

/** 通过 REST 暴露的核心 MCP 工具（当前 15 个；含与 EE 对齐的 find_charts/find_dashboards 及自建 find_spaces/find_content 等）。 */
export function registerCoreMcpTools(
    server: McpServer,
    config: LightdashMcpEnvConfig,
    api: LightdashRestClient,
    deps: CoreQueryToolsDeps,
): void {
    registerOrgAndHealthTools(server, config, api);
    registerSessionProjectTools(server, config, api);
    registerExploreCatalogTools(server, config, api);
    registerContentTools(server, config, api);
    registerQueryTools(server, config, api, deps);
}

export type { CoreQueryToolsDeps } from './tools/registerQueryTools';
