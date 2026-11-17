import type { McpClient, ToolDescriptor } from '../types';
import { mapMcpError } from './errorMapping';

/**
 * 工具目录（`msy-x tools`）：description 缺省为 null，按 name 升序，
 * 便于稳定输出与快照对比；listTools 的异常统一走 mapMcpError。
 */
export const getToolCatalog = async (
    client: McpClient,
): Promise<ToolDescriptor[]> => {
    try {
        const tools = await client.listTools();
        return tools
            .map((tool) => ({
                name: tool.name,
                description: tool.description ?? null,
                inputSchema: tool.inputSchema,
            }))
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    } catch (error) {
        throw mapMcpError(error);
    }
};
