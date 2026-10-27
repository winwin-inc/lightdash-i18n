import {
    Account,
    AnyType,
    ApiKeyAccount,
    CatalogFilter,
    CatalogType,
    CommercialFeatureFlags,
    Explore,
    filterExploreByTags,
    ForbiddenError,
    isExploreError,
    MissingConfigError,
    NotFoundError,
    OauthAccount,
    ParameterError,
    QueryExecutionContext,
    SessionUser,
    toolFindExploresArgsSchemaV2,
    ToolFindExploresArgsV2,
    ToolFindFieldsArgs,
    toolFindFieldsArgsSchema,
    ToolRunMetricQueryArgs,
    toolRunMetricQueryArgsSchema,
    ToolSearchFieldValuesArgs,
    toolSearchFieldValuesArgsSchema,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
// eslint-disable-next-line import/extensions
import { subject } from '@casl/ability';
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/extensions
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, ZodRawShape } from 'zod';
import {
    LightdashAnalytics,
    McpToolCallEvent,
} from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { CatalogSearchContext } from '../../models/CatalogModel/CatalogModel';
import { McpContextModel } from '../../models/McpContextModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';
import { CatalogService } from '../CatalogService/CatalogService';
import { ContentService } from '../ContentService/ContentService';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SearchService } from '../SearchService/SearchService';
import { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { ProjectService } from '../ProjectService/ProjectService';
import { SpaceService } from '../SpaceService/SpaceService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
} from '../UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../utils';
import { VERSION } from '../../version';
import { runFindExplores } from '../ai/tools/findExplores';
import { runFindFields } from '../ai/tools/findFields';
import { runRunMetricQuery } from '../ai/tools/runMetricQuery';
import { runSearchFieldValues } from '../ai/tools/searchFieldValues';
import {
    FindExploresFn,
    FindFieldFn,
    GetExploreFn,
    RunMiniMetricQueryFn,
    SearchFieldValuesFn,
} from '../ai/types/aiAgentDependencies';
import { McpSchemaCompatLayer } from './McpSchemaCompatLayer';
import { McpAuthContext, McpAuthType } from './McpAuthContext';
import { McpToolName } from './McpToolName';
import { McpToolRegistry } from './tools/registry';
import { McpToolScope } from './tools/scopes';
import { McpToolContext } from './tools/types';
import { McpToolDeps } from './tools/deps';
import { registerOrgTools } from './tools/orgTools';
import { registerAccessTools } from './tools/accessTools';
import { registerDocsTools } from './tools/docsTools';
import { registerQueryTools } from './tools/queryTools';
import { registerContentSearchTools } from './tools/contentSearchTools';
import { registerContentListTools } from './tools/contentListTools';
import { registerSavedChartTools } from './tools/savedChartTools';
import { registerDashboardTools } from './tools/dashboardTools';
import { registerChartRunTools } from './tools/chartRunTools';
import { registerAnalystPrompt } from './tools/analystPromptTools';

type McpServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    catalogService: CatalogService;
    projectModel: ProjectModel;
    projectService: ProjectService;
    userAttributesModel: UserAttributesModel;
    searchModel: SearchModel;
    spaceModel: SpaceModel;
    spaceService: SpaceService;
    mcpContextModel: McpContextModel;
    featureFlagService: FeatureFlagService;
    contentService: ContentService;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
    searchService: SearchService;
};

/**
 * @deprecated use McpAuthContext instead
 */
export type ExtraContext = McpAuthContext;

/**
 * MCP tool arguments: the AI agent arguments plus the optional explicit
 * project override.
 */
type McpToolArgs<TArgs> = TArgs & { projectUuid?: string };

export class McpService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private analytics: LightdashAnalytics;

    private catalogService: CatalogService;

    private projectService: ProjectService;

    private projectModel: ProjectModel;

    private userAttributesModel: UserAttributesModel;

    private searchModel: SearchModel;

    private spaceModel: SpaceModel;

    private spaceService: SpaceService;

    private mcpContextModel: McpContextModel;

    private featureFlagService: FeatureFlagService;

    private contentService: ContentService;

    private savedChartService: SavedChartService;

    private dashboardService: DashboardService;

    private searchService: SearchService;

    private mcpServer: McpServer;

    private mcpCompatLayer: McpSchemaCompatLayer;

    private toolRegistry: McpToolRegistry;

    constructor({
        lightdashConfig,
        analytics,
        catalogService,
        projectService,
        userAttributesModel,
        searchModel,
        spaceModel,
        spaceService,
        projectModel,
        mcpContextModel,
        featureFlagService,
        contentService,
        savedChartService,
        dashboardService,
        searchService,
    }: McpServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.catalogService = catalogService;
        this.projectService = projectService;
        this.userAttributesModel = userAttributesModel;
        this.searchModel = searchModel;
        this.spaceModel = spaceModel;
        this.projectModel = projectModel;
        this.spaceService = spaceService;
        this.mcpContextModel = mcpContextModel;
        this.featureFlagService = featureFlagService;
        this.contentService = contentService;
        this.savedChartService = savedChartService;
        this.dashboardService = dashboardService;
        this.searchService = searchService;
        this.mcpCompatLayer = new McpSchemaCompatLayer();
        try {
            this.mcpServer = Sentry.wrapMcpServerWithSentry(
                new McpServer({
                    name: 'Lightdash MCP Server',
                    version: VERSION,
                }),
            );
            this.toolRegistry = new McpToolRegistry(
                this.mcpServer,
                this.lightdashConfig,
            );
            this.setupHandlers();
        } catch (error) {
            this.logger.error('Error initializing MCP server:', error);
            throw error;
        }
    }

    /**
     * The names of the tools exposed by the MCP server, sorted alphabetically.
     */
    public get registeredToolNames(): string[] {
        return this.toolRegistry.toolNames;
    }

    private getMcpCompatibleSchema(
        schema: z.ZodSchema<unknown>,
        options?: { projectUuid?: boolean },
    ): ZodRawShape {
        const shape = this.mcpCompatLayer.processZodType(schema).shape as
            | ZodRawShape
            | undefined;

        if (!shape) {
            return {};
        }

        // The AI agent schemas carry a `type` discriminator that only makes
        // sense for the agent, MCP clients should not have to send it.
        const rest = Object.fromEntries(
            Object.entries(shape).filter(([key]) => key !== 'type'),
        ) as ZodRawShape;

        if (options?.projectUuid) {
            return {
                ...rest,
                projectUuid: z
                    .string()
                    .optional()
                    .describe(
                        'Project to use for this call. Defaults to the project set with set_project.',
                    ),
            };
        }

        return rest;
    }

    /**
     * The services and models that are available to the MCP tools.
     */
    private getToolDeps(): McpToolDeps {
        return {
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            catalogService: this.catalogService,
            projectService: this.projectService,
            projectModel: this.projectModel,
            userAttributesModel: this.userAttributesModel,
            searchModel: this.searchModel,
            searchService: this.searchService,
            spaceModel: this.spaceModel,
            spaceService: this.spaceService,
            contentService: this.contentService,
            savedChartService: this.savedChartService,
            dashboardService: this.dashboardService,
            mcpContextModel: this.mcpContextModel,
            featureFlagService: this.featureFlagService,
        };
    }

    /**
     * Registers a MCP tool and enforces the authentication/scope requirements
     * before the tool handler is executed.
     */
    private registerMcpTool(
        name: McpToolName,
        config: {
            description?: string;
            inputSchema?: ZodRawShape;
        },
        handler: (
            args: AnyType,
            context: McpToolContext,
        ) => Promise<CallToolResult>,
    ): void {
        this.toolRegistry.register(name, config, handler);
    }

    setupHandlers(): void {
        // Tools that are implemented as standalone modules
        registerOrgTools(this.toolRegistry, this.getToolDeps());
        registerAccessTools(this.toolRegistry, this.getToolDeps());
        registerDocsTools(this.toolRegistry, this.getToolDeps());
        registerQueryTools(this.toolRegistry, this.getToolDeps());
        registerContentSearchTools(this.toolRegistry, this.getToolDeps());
        registerContentListTools(this.toolRegistry, this.getToolDeps());
        registerSavedChartTools(this.toolRegistry, this.getToolDeps());
        registerDashboardTools(this.toolRegistry, this.getToolDeps());
        registerChartRunTools(this.toolRegistry, this.getToolDeps());
        registerAnalystPrompt(this.toolRegistry);

        this.registerMcpTool(
            McpToolName.GET_LIGHTDASH_VERSION,
            {
                description: 'Get the current Lightdash version',
                inputSchema: {},
            },
            async (_args, context) => {
                this.trackToolCall(
                    context,
                    McpToolName.GET_LIGHTDASH_VERSION,
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: this.getLightdashVersion(
                                context,
                            ),
                        },
                    ],
                };
            },
        );

        this.registerMcpTool(
            McpToolName.FIND_EXPLORES,
            {
                description: toolFindExploresArgsSchemaV2.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindExploresArgsSchemaV2,
                    { projectUuid: true },
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as McpToolArgs<ToolFindExploresArgsV2>;

                const projectUuid = await this.resolveProjectUuid(
                    context,
                    args,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context,
                    McpToolName.FIND_EXPLORES,
                    projectUuid,
                );

                const findExplores: FindExploresFn =
                    await this.getFindExploresFunction(
                        argsWithProject,
                        context,
                    );

                const result = await runFindExplores(
                    { findExplores, fieldSearchSize: 200 },
                    { exploreName: args.exploreName },
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            },
        );

        this.registerMcpTool(
            McpToolName.FIND_FIELDS,
            {
                description: toolFindFieldsArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindFieldsArgsSchema,
                    { projectUuid: true },
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as McpToolArgs<ToolFindFieldsArgs>;

                const projectUuid = await this.resolveProjectUuid(
                    context,
                    args,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context,
                    McpToolName.FIND_FIELDS,
                    projectUuid,
                );

                const findFields: FindFieldFn =
                    await this.getFindFieldsFunction(
                        argsWithProject,
                        context,
                    );

                const result = await runFindFields(
                    { findFields, pageSize: 15 },
                    {
                        table: args.table,
                        fieldSearchQueries: args.fieldSearchQueries,
                        page: args.page,
                    },
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            },
        );

        this.registerMcpTool(
            McpToolName.LIST_PROJECTS,
            {
                description: 'List all accessible projects in the organization',
                inputSchema: {},
            },
            async (_args, context) => {
                const { user, organizationUuid, account } = this.getAccount(
                    context,
                );

                this.trackToolCall(
                    context,
                    McpToolName.LIST_PROJECTS,
                );

                const projects =
                    await this.projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );

                const projectList = projects.map((project) => ({
                    name: project.name,
                    projectUuid: project.projectUuid,
                }));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(projectList, null, 2),
                        },
                    ],
                };
            },
        );

        this.registerMcpTool(
            McpToolName.SET_PROJECT,
            {
                description:
                    'Set the active project for subsequent MCP operations',
                inputSchema: {
                    projectUuid: z.string() as AnyType,
                    tags: z.array(z.string()).optional() as AnyType,
                },
            },
            async (_args, context) => {
                const args = _args as { projectUuid: string; tags?: string[] };
                const { user, organizationUuid, account } = this.getAccount(
                    context,
                );

                this.trackToolCall(
                    context,
                    McpToolName.SET_PROJECT,
                    args.projectUuid,
                );

                if (!args.projectUuid) {
                    throw new ParameterError('Project UUID is required');
                }

                // Validate project access
                const project = await this.projectService.getProject(
                    args.projectUuid,
                    account,
                );

                if (
                    user.ability.cannot(
                        'view',
                        subject('Project', {
                            projectUuid: args.projectUuid,
                            organizationUuid: project.organizationUuid,
                        }),
                    )
                ) {
                    throw new ForbiddenError(
                        'You do not have access to this project',
                    );
                }

                // Determine tags: use provided tags, or preserve existing, or set to null
                let tagsToSet: string[] | null = null;
                if (args.tags !== undefined) {
                    tagsToSet = args.tags.length > 0 ? args.tags : null;
                }

                // Set context
                await this.mcpContextModel.setContext({
                    userUuid: user.userUuid,
                    organizationUuid,
                    context: {
                        projectUuid: args.projectUuid,
                        projectName: project.name,
                        tags: tagsToSet,
                    },
                });

                const result = {
                    projectUuid: args.projectUuid,
                    projectName: project.name,
                    selectedTags: tagsToSet,
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            },
        );

        this.registerMcpTool(
            McpToolName.GET_CURRENT_PROJECT,
            {
                description: 'Get the currently active project',
                inputSchema: {},
            },
            async (_args, context) => {
                const { user, organizationUuid } = this.getAccount(
                    context,
                );

                this.trackToolCall(
                    context,
                    McpToolName.GET_CURRENT_PROJECT,
                );

                const contextRow = await this.mcpContextModel.getContext(
                    user.userUuid,
                    organizationUuid,
                );

                if (!contextRow || !contextRow.context.projectUuid) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        error: 'No active project set. Use set_project to set one.',
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    };
                }

                const { projectUuid, projectName, tags } = contextRow.context;

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    projectUuid,
                                    projectName,
                                    selectedTags: tags,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            },
        );

        this.registerMcpTool(
            McpToolName.RUN_METRIC_QUERY,
            {
                description: toolRunMetricQueryArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolRunMetricQueryArgsSchema,
                    { projectUuid: true },
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as McpToolArgs<ToolRunMetricQueryArgs>;

                const projectUuid = await this.resolveProjectUuid(
                    context,
                    args,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context,
                    McpToolName.RUN_METRIC_QUERY,
                    projectUuid,
                );

                const { getExplore, runMiniMetricQuery } =
                    await this.getRunMetricQueryDependencies(
                        argsWithProject,
                        context,
                    );

                const result = await runRunMetricQuery(
                    {
                        getExplore,
                        runMiniMetricQuery,
                        maxLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
                    },
                    argsWithProject,
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            },
        );

        this.registerMcpTool(
            McpToolName.SEARCH_FIELD_VALUES,
            {
                description: toolSearchFieldValuesArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolSearchFieldValuesArgsSchema,
                    { projectUuid: true },
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as McpToolArgs<ToolSearchFieldValuesArgs>;

                const projectUuid = await this.resolveProjectUuid(
                    context,
                    args,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context,
                    McpToolName.SEARCH_FIELD_VALUES,
                    projectUuid,
                );

                const searchFieldValues: SearchFieldValuesFn =
                    await this.getSearchFieldValuesFunction(
                        argsWithProject,
                        context,
                    );

                const result = await runSearchFieldValues(
                    { searchFieldValues },
                    argsWithProject,
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            },
        );
    }

    async getProjectUuidFromContext(
        context: McpToolContext,
    ): Promise<string | undefined> {
        const { user } = context;
        const { organizationUuid } = user;

        if (!user || !organizationUuid) {
            return undefined;
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            organizationUuid,
        );

        return contextRow?.context.projectUuid;
    }

    async getTagsFromContext(
        context: McpToolContext,
    ): Promise<string[] | null> {
        const { user } = context;
        const { organizationUuid } = user;

        if (!user || !organizationUuid) {
            return null;
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            organizationUuid,
        );

        return contextRow?.context.tags || null;
    }

    async resolveProjectUuid(
        context: McpToolContext,
        args?: { projectUuid?: string },
    ): Promise<string> {
        // Use projectUuid from args or get from context
        if (args?.projectUuid) {
            return args.projectUuid;
        }
        const projectUuid = await this.getProjectUuidFromContext(context);
        if (!projectUuid) {
            throw new ForbiddenError(
                'No project context set. Use set_project or provide projectUuid parameter.',
            );
        }
        return projectUuid;
    }

    async getAvailableExplores(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
    ) {
        return wrapSentryTransaction(
            'AiAgent.getAvailableExplores',
            {
                projectUuid,
                availableTags,
            },
            async () => {
                const { organizationUuid } = user;
                if (!organizationUuid) {
                    throw new ForbiddenError('Organization not found');
                }

                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        { organizationUuid, userUuid: user.userUuid },
                    );

                const allExplores = Object.values(
                    await this.projectModel.findExploresFromCache(
                        projectUuid,
                        'name',
                    ),
                );

                return allExplores
                    .filter(
                        (explore): explore is Explore =>
                            !isExploreError(explore),
                    )
                    .filter((explore) =>
                        doesExploreMatchRequiredAttributes(
                            explore.tables[explore.baseTable]
                                .requiredAttributes,
                            userAttributes,
                        ),
                    )
                    .map((explore) =>
                        getFilteredExplore(explore, userAttributes),
                    )
                    .filter((explore) =>
                        filterExploreByTags({ explore, availableTags }),
                    )
                    .filter((explore): explore is Explore => !!explore);
            },
        );
    }

    private async getExplore(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        exploreName: string,
    ) {
        const explores = await this.getAvailableExplores(
            user,
            projectUuid,
            availableTags,
        );

        const explore = explores.find((e) => e.name === exploreName);

        if (!explore) {
            throw new NotFoundError('Explore not found');
        }

        return explore;
    }

    async getFindExploresFunction(
        toolArgs: ToolFindExploresArgsV2 & { projectUuid: string },
        context: McpToolContext,
    ): Promise<FindExploresFn> {
        const { user, account } = context;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Get tags from context for filtering
        const tagsFromContext = await this.getTagsFromContext(context);

        const findExplores: FindExploresFn = (args) =>
            wrapSentryTransaction('McpService.findExplores', args, async () => {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                const explore = await this.getExplore(
                    user,
                    projectUuid,
                    tagsFromContext,
                    args.exploreName,
                );

                const sharedArgs = {
                    projectUuid,
                    catalogSearch: {
                        type: CatalogType.Field,
                        yamlTags: tagsFromContext || undefined,
                        tables: [args.exploreName],
                    },
                    userAttributes,
                    context: CatalogSearchContext.MCP,
                    paginateArgs: {
                        page: 1,
                        pageSize: args.fieldSearchSize,
                    },
                    sortArgs: {
                        sort: 'chartUsage',
                        order: 'desc' as const,
                    },
                };

                const { data: dimensions } =
                    await this.catalogService.searchCatalog({
                        ...sharedArgs,
                        catalogSearch: {
                            ...sharedArgs.catalogSearch,
                            filter: CatalogFilter.Dimensions,
                        },
                    });

                const { data: metrics } =
                    await this.catalogService.searchCatalog({
                        ...sharedArgs,
                        catalogSearch: {
                            ...sharedArgs.catalogSearch,
                            filter: CatalogFilter.Metrics,
                        },
                    });

                return {
                    explore,
                    catalogFields: {
                        dimensions: dimensions.filter(
                            (d) => d.type === CatalogType.Field,
                        ),
                        metrics: metrics.filter(
                            (m) => m.type === CatalogType.Field,
                        ),
                    },
                };
            });

        return findExplores;
    }

    async getFindFieldsFunction(
        toolArgs: ToolFindFieldsArgs & { projectUuid: string },
        context: McpToolContext,
    ): Promise<FindFieldFn> {
        const { user, account } = context;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Get tags from context for filtering
        const tagsFromContext = await this.getTagsFromContext(context);

        const findFields: FindFieldFn = (args) =>
            wrapSentryTransaction('McpService.findFields', args, async () => {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                const explore = await this.getExplore(
                    user,
                    projectUuid,
                    tagsFromContext,
                    args.table,
                );

                const { data: catalogItems, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        catalogSearch: {
                            type: CatalogType.Field,
                            searchQuery: args.fieldSearchQuery.label,
                        },
                        context: CatalogSearchContext.MCP,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                        userAttributes,
                        filteredExplore: explore,
                    });

                const catalogFields = catalogItems.filter(
                    (item) => item.type === CatalogType.Field,
                );

                return { fields: catalogFields, pagination };
            });

        return findFields;
    }

    async getRunMetricQueryDependencies(
        toolArgs: ToolRunMetricQueryArgs & {
            projectUuid: string;
        },
        context: McpToolContext,
    ): Promise<{
        getExplore: GetExploreFn;
        runMiniMetricQuery: RunMiniMetricQueryFn;
    }> {
        const { user, account } = context;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const getExplore: GetExploreFn = async ({ exploreName }) => {
            const explore = await this.projectService.getExplore(
                account,
                projectUuid,
                exploreName,
            );
            return explore;
        };

        const runMiniMetricQuery: RunMiniMetricQueryFn = async (
            metricQuery,
            maxLimit,
            additionalMetrics,
        ) =>
            this.projectService.runMetricQuery({
                account,
                projectUuid,
                metricQuery: {
                    ...metricQuery,
                    additionalMetrics: additionalMetrics ?? [],
                },
                exploreName: metricQuery.exploreName,
                csvLimit: maxLimit,
                context: QueryExecutionContext.MCP,
                chartUuid: undefined,
                queryTags: {
                    project_uuid: projectUuid,
                    user_uuid: user.userUuid,
                    organization_uuid: organizationUuid,
                },
            });

        return { getExplore, runMiniMetricQuery };
    }

    async getSearchFieldValuesFunction(
        toolArgs: ToolSearchFieldValuesArgs & { projectUuid: string },
        context: McpToolContext,
    ): Promise<SearchFieldValuesFn> {
        const { user, account } = context;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const searchFieldValues: SearchFieldValuesFn = (args) =>
            wrapSentryTransaction(
                'McpService.searchFieldValues',
                args,
                async () => {
                    const dimensionFilters = args.filters?.dimensions;
                    const andFilters =
                        dimensionFilters && 'and' in dimensionFilters
                            ? dimensionFilters
                            : undefined;

                    const results =
                        await this.projectService.searchFieldUniqueValues(
                            user,
                            projectUuid,
                            args.table,
                            args.fieldId,
                            args.query,
                            100,
                            andFilters,
                            false,
                            undefined,
                        );
                    return results;
                },
            );

        return searchFieldValues;
    }

    public static getVersion(): string {
        return VERSION;
    }

    public getServer(): McpServer {
        return this.mcpServer;
    }

    // eslint-disable-next-line class-methods-use-this
    public getAccount(context: McpToolContext): {
        user: SessionUser;
        organizationUuid: string;
        account: Account;
    } {
        const { user, account } = context;
        const { organizationUuid } = user;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }
        return { user, organizationUuid, account };
    }

    public canAccessMcp(context: AnyType): boolean {
        return this.toolRegistry.canAccessMcp(
            McpService.extractAuthContext(context),
        );
    }

    /**
     * Extracts the normalised authentication context from either a raw MCP SDK
     * context or an already normalised context.
     */
    private static extractAuthContext(
        context: AnyType,
    ): McpAuthContext | undefined {
        if (!context) {
            return undefined;
        }
        if (context.authType && Array.isArray(context.scopes)) {
            return {
                user: context.user,
                account: context.account,
                authType: context.authType,
                scopes: context.scopes,
            } as McpAuthContext;
        }
        return context.authInfo?.extra as McpAuthContext | undefined;
    }

    // MCP is enabled if MCP_ENABLED is true OR if AI Copilot is enabled
    public async isEnabled(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        if (this.lightdashConfig.mcp.enabled) {
            return true;
        }

        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return aiCopilotFlag.enabled;
    }

    public getLightdashVersion(context: McpToolContext): string {
        this.canAccessMcp(context);
        return VERSION;
    }

    private trackToolCall(
        context: McpToolContext,
        toolName: string,
        projectUuid?: string,
    ): void {
        try {
            const { user, organizationUuid } = this.getAccount(context);
            this.analytics.track<McpToolCallEvent>({
                event: 'mcp_tool_call',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    toolName,
                },
            });
        } catch (error) {
            this.logger.debug('Failed to track MCP tool call', error);
        }
    }
}
