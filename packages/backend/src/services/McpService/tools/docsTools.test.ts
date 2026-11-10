import { AnyType } from '@lightdash/common';
import { McpToolName } from '../McpToolName';
import { registerDocsTools } from './docsTools';
import { McpToolDeps } from './deps';
import { McpToolRegistry } from './registry';
import { McpToolContext } from './types';

type RegisteredTool = {
    name: string;
    config: { description?: string; inputSchema?: AnyType };
    handler: (args: AnyType, context: McpToolContext) => Promise<AnyType>;
};

const buildRegistry = () => {
    const registered: RegisteredTool[] = [];
    const registry = {
        register: jest.fn(
            (
                name: string,
                config: RegisteredTool['config'],
                handler: RegisteredTool['handler'],
            ) => {
                registered.push({ name, config, handler });
            },
        ),
    };
    return { registry: registry as unknown as McpToolRegistry, registered };
};

const buildDeps = () => ({}) as unknown as McpToolDeps;

const buildContext = (): McpToolContext =>
    ({
        user: {},
        account: {},
        ability: {},
        organizationUuid: 'org-uuid',
        authType: 'pat',
        scopes: [],
    }) as unknown as McpToolContext;

const getText = (result: AnyType): string => result.content[0].text as string;

describe('registerDocsTools', () => {
    it('registers the get_mcp_docs tool', () => {
        const { registry, registered } = buildRegistry();
        registerDocsTools(registry, buildDeps());

        expect(registered).toHaveLength(1);
        expect(registered[0].name).toEqual(McpToolName.GET_MCP_DOCS);
        expect(registered[0].name).toEqual('get_mcp_docs');
        expect(registered[0].config.description).toContain('documentation');
        expect(registered[0].config.description).toContain('tools');
    });

    it('returns the documentation with the main site tool names', async () => {
        const { registry, registered } = buildRegistry();
        registerDocsTools(registry, buildDeps());

        const result = await registered[0].handler({}, buildContext());
        const text = getText(result);

        expect(text).toContain('get_mcp_docs');
        expect(text).toContain('get_my_access');
        expect(text).toContain('run_metric_query');
        expect(text).toContain('run_semantic_metric_query');
        expect(text).toContain('find_content');
        expect(text).toContain('list_charts');
        expect(text).toContain('get_dashboard_tiles');
        expect(text).toContain('search_field_values');
    });

    it('returns the plain text documentation when format is text', async () => {
        const { registry, registered } = buildRegistry();
        registerDocsTools(registry, buildDeps());

        const result = await registered[0].handler(
            { format: 'text' },
            buildContext(),
        );
        const text = getText(result);

        expect(text).toContain('get_my_access');
        expect(text).not.toContain('```');
    });

    it('filters the documentation by topic and returns the full document', async () => {
        const { registry, registered } = buildRegistry();
        registerDocsTools(registry, buildDeps());

        const result = await registered[0].handler(
            { topic: 'content_fields' },
            buildContext(),
        );
        const parsed = JSON.parse(getText(result));

        expect(parsed.topic).toEqual('content_fields');
        expect(parsed.found).toEqual(true);
        expect(parsed.documentation).toContain('chartKind');
        // The full documentation is appended
        expect(parsed.documentation).toContain('Security rules');
        expect(parsed.documentation).toContain('get_mcp_docs');
    });

    it('matches topics case insensitively', async () => {
        const { registry, registered } = buildRegistry();
        registerDocsTools(registry, buildDeps());

        const result = await registered[0].handler(
            { topic: 'SECURITY' },
            buildContext(),
        );
        const parsed = JSON.parse(getText(result));

        expect(parsed.found).toEqual(true);
        expect(parsed.documentation).toContain('Authorization: ApiKey');
    });

    it('accepts the legacy session_lifecycle topic as an alias', async () => {
        const { registry, registered } = buildRegistry();
        registerDocsTools(registry, buildDeps());

        const result = await registered[0].handler(
            { topic: 'session_lifecycle' },
            buildContext(),
        );
        const parsed = JSON.parse(getText(result));

        expect(parsed.found).toEqual(true);
        expect(parsed.documentation).toContain('Request lifecycle');
    });

    it('says clearly when the topic was not found', async () => {
        const { registry, registered } = buildRegistry();
        registerDocsTools(registry, buildDeps());

        const result = await registered[0].handler(
            { topic: 'does-not-exist' },
            buildContext(),
        );
        const parsed = JSON.parse(getText(result));

        expect(parsed.topic).toEqual('does-not-exist');
        expect(parsed.found).toEqual(false);
        expect(parsed.documentation).toContain('not found');
        // The full documentation is still returned
        expect(parsed.documentation).toContain('get_my_access');
    });
});
