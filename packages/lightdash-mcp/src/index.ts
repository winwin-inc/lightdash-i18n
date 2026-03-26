import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfigFromEnv } from './config';
import { createLightdashMcpServer } from './createMcpServer';

async function main(): Promise<void> {
    const config = loadConfigFromEnv();
    const mcp = createLightdashMcpServer(config);
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
});
