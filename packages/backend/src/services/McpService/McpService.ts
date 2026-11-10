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
    type DashboardQueryContextAttributes,
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
import { OrganizationModel } from '../../models/OrganizationModel';
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
import { McpToolCallInfo, McpToolRegistry } from './tools/registry';
import { McpToolScope } from './tools/scopes';
import { McpToolContext } from './tools/types';
import { McpToolDeps } from './tools/deps';
import {
    NO_DEFAULT_PROJECT_ERROR,
    NO_DEFAULT_PROJECT_HINT,
    PROJECT_UUID_PARAM_DESCRIPTION,
    resolveProjectContext,
} from './tools/projectContext';
import { registerOrgTools } from './tools/orgTools';
import { registerAccessTools } from './tools/accessTools';
import { registerDocsTools } from './tools/docsTools';
import { registerQueryTools } from './tools/queryTools';
import { assertExploreQueryable } from './tools/access/assertExploreQueryable';
import {
    createRequiredDashboardGuard,
    formatDashboardAccessError,
} from './tools/access/requiredDashboardContext';
import { exploreRequiresDashboardContext } from './tools/access/exploreRequiresDashboardContext';
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
    organizationModel: OrganizationModel;
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

    private organizationModel: OrganizationModel;

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
        organizationModel,
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
        this.organizationModel = organizationModel;
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
                (info) => this.handleToolCall(info),
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
                    .describe(PROJECT_UUID_PARAM_DESCRIPTION),
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
            organizationModel: this.organizationModel,
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
            async (_args, context) => ({
                content: [
                    {
                        type: 'text',
                        text: this.getLightdashVersion(context),
                    },
                ],
            }),
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
                    'Set the default project for subsequent MCP operations. This is a per-user, per-organization preference stored in the database; it does not affect other users. An explicit projectUuid argument on a tool call always takes precedence over this default.',
                inputSchema: {
                    projectUuid: z
                        .string()
                        .describe(
                            'Project UUID to use as the default. Must be a project you can view.',
                        ) as AnyType,
                    tags: z
                        .array(z.string())
                        .optional()
                        .describe(
                            'Optional catalog tags to filter explores and fields by default. Overrides any previously stored tags. Pass an empty array to clear them.',
                        ) as AnyType,
                },
            },
            async (_args, context) => {
                const args = _args as { projectUuid: string; tags?: string[] };
                const { user, organizationUuid, account } = this.getAccount(
                    context,
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
                description:
                    'Get the default project for the current user and organization, and show which fallback level it came from.',
                inputSchema: {},
            },
            async (_args, context) => {
                const { user, organizationUuid, account } = this.getAccount(
                    context,
                );

                const contextRow = await this.mcpContextModel.getContext(
                    user.userUuid,
                    organizationUuid,
                );
                const storedContext = contextRow?.context;
                const hasUserDefault = !!storedContext?.projectUuid;

                try {
                    const resolved = await resolveProjectContext(
                        this.getToolDeps(),
                        context,
                    );

                    // The stored name may be stale for the fallback levels;
                    // always report the live project name.
                    const project = await this.projectService.getProject(
                        resolved.projectUuid,
                        account,
                    );

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        projectUuid: resolved.projectUuid,
                                        projectName: project.name,
                                        selectedTags: storedContext?.tags ?? null,
                                        source: resolved.source,
                                        hasUserDefault,
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    };
                } catch (error) {
                    if (error instanceof ForbiddenError) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(
                                        {
                                            error: NO_DEFAULT_PROJECT_ERROR,
                                            hint: NO_DEFAULT_PROJECT_HINT,
                                        },
                                        null,
                                        2,
                                    ),
                                },
                            ],
                        };
                    }
                    throw error;
                }
            },
        );

        this.registerMcpTool(
            McpToolName.RUN_METRIC_QUERY,
            {
                description: toolRunMetricQueryArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    // 强制看板模式：schema 增加可选 dashboardUuid（非 strict 保持原 schema）
                    this.lightdashConfig.mcp?.dashboardStrict === true
                        ? toolRunMetricQueryArgsSchema.extend({
                              dashboardUuid: z.string().optional(),
                          })
                        : toolRunMetricQueryArgsSchema,
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

                // v1 对齐（registerQueryTools run-query）：执行前预检 explore
                // 可查，拒绝时抛受控/非受控两行中文文案，不跑数；strict 时还须
                // 解析出已验证的看板上下文（dashboardUuid 可选参数）。
                const strict =
                    this.lightdashConfig.mcp?.dashboardStrict === true;
                // v1 对齐：exploreName 存在才预检（vizConfig.exploreName 为
                // schema 必填，实际恒有值；缺失时交由后续 parse 报参数错误）
                const exploreName =
                    argsWithProject.vizConfig?.exploreName;
                let dashboardContextForQuery:
                    | DashboardQueryContextAttributes
                    | undefined;
                if (exploreName) {
                    await assertExploreQueryable(
                        this.getToolDeps(),
                        context,
                        projectUuid,
                        exploreName,
                        'metric',
                        { dashboardStrict: strict },
                    );
                    // 看板上下文（v1 对齐）：strict 无条件；否则 explore 需要
                    // （sql_filter 引用看板 slug）或显式传了 dashboardUuid 才解析；
                    // 解析出的上下文传进查询——行级权限依赖看板 slug。
                    const explicitDashboardUuid = (
                        argsWithProject as { dashboardUuid?: string }
                    ).dashboardUuid;
                    const explore =
                        await this.projectService.getExplore(
                            context.account,
                            projectUuid,
                            exploreName,
                        );
                    if (
                        strict ||
                        exploreRequiresDashboardContext(explore) ||
                        explicitDashboardUuid !== undefined
                    ) {
                        const guard = createRequiredDashboardGuard(
                            this.getToolDeps(),
                        );
                        const guardResult = await guard.ensure(context, {
                            projectUuid,
                            dashboardUuid: explicitDashboardUuid,
                            exploreName,
                        });
                        if (!guardResult.ok) {
                            return guardResult.result;
                        }
                        const c = guardResult.context;
                        dashboardContextForQuery = {
                            dashboardUuid: c.dashboardUuid,
                            dashboardSlug: c.dashboardSlug,
                            dashboardName: c.dashboardName,
                        };
                    }
                }

                const { getExplore, runMiniMetricQuery } =
                    await this.getRunMetricQueryDependencies(
                        argsWithProject,
                        context,
                        dashboardContextForQuery,
                    );

                let result: string;
                try {
                    result = await runRunMetricQuery(
                        {
                            getExplore,
                            runMiniMetricQuery,
                            maxLimit: this.lightdashConfig.ai.copilot
                                .maxQueryLimit,
                        },
                        argsWithProject,
                    );
                } catch (error) {
                    if (strict) {
                        // 看板类 403/404（含 RLS 无法应用）映射为 dashboard_*
                        // 结构化 payload（v1 对齐）；其余错误原样抛出
                        const mapped = formatDashboardAccessError({
                            error,
                            projectUuid,
                            dashboardUuid:
                                dashboardContextForQuery?.dashboardUuid ?? null,
                        });
                        if (mapped) {
                            return mapped;
                        }
                    }
                    throw error;
                }

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
                    this.lightdashConfig.mcp?.dashboardStrict === true
                        ? toolSearchFieldValuesArgsSchema.extend({
                              dashboardUuid: z.string().optional(),
                          })
                        : toolSearchFieldValuesArgsSchema,
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

                // v1 对齐（registerQueryTools search_field_values）：fieldValues
                // 口径预检（metadataOnly 也可查值）+ strict 看板门控。
                const strict =
                    this.lightdashConfig.mcp?.dashboardStrict === true;
                await assertExploreQueryable(
                    this.getToolDeps(),
                    context,
                    projectUuid,
                    argsWithProject.table,
                    'fieldValues',
                    { dashboardStrict: strict },
                );
                let dashboardContextForSearch:
                    | DashboardQueryContextAttributes
                    | undefined;
                if (strict) {
                    const guard = createRequiredDashboardGuard(
                        this.getToolDeps(),
                    );
                    const guardResult = await guard.ensure(context, {
                        projectUuid,
                        dashboardUuid: (
                            argsWithProject as { dashboardUuid?: string }
                        ).dashboardUuid,
                        exploreName: argsWithProject.table,
                    });
                    if (!guardResult.ok) {
                        return guardResult.result;
                    }
                    // 保留解析出的上下文传给字段值查询（v1 对齐：
                    // dashboardUuidForQuery）——行级口径
                    dashboardContextForSearch = {
                        dashboardUuid: guardResult.context.dashboardUuid,
                        dashboardSlug: guardResult.context.dashboardSlug,
                        dashboardName: guardResult.context.dashboardName,
                    };
                }

                const searchFieldValues: SearchFieldValuesFn =
                    await this.getSearchFieldValuesFunction(
                        argsWithProject,
                        context,
                        dashboardContextForSearch,
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

    /**
     * Returns the default project of the current user and organization:
     * the user-level default stored with `set_project`, falling back to the
     * organization-level default and then the deployment-level default.
     *
     * Returns `undefined` when no level resolves.
     */
    async getProjectUuidFromContext(
        context: McpToolContext,
    ): Promise<string | undefined> {
        try {
            const { projectUuid } = await resolveProjectContext(
                this.getToolDeps(),
                context,
            );
            return projectUuid;
        } catch (error) {
            if (error instanceof ForbiddenError) {
                return undefined;
            }
            throw error;
        }
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

    /**
     * Resolves the project of a tool call: an explicit `projectUuid`
     * argument always wins; otherwise the four level fallback chain is
     * applied (user default > organization default > server default).
     */
    async resolveProjectUuid(
        context: McpToolContext,
        args?: { projectUuid?: string },
    ): Promise<string> {
        const { projectUuid } = await resolveProjectContext(
            this.getToolDeps(),
            context,
            args?.projectUuid,
        );
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

        // Get tags from context for filtering. An explicit `catalogTags`
        // argument overrides the tags stored by `set_project` for this call;
        // an empty array disables tag filtering (it does not fall back to
        // the stored tags).
        const tagsFromContext = await this.getTagsFromContext(context);
        const effectiveTags = toolArgs.catalogTags ?? tagsFromContext;
        const yamlTags =
            effectiveTags && effectiveTags.length > 0
                ? effectiveTags
                : undefined;

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
                    effectiveTags,
                    args.exploreName,
                );

                const sharedArgs = {
                    projectUuid,
                    catalogSearch: {
                        type: CatalogType.Field,
                        yamlTags,
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

        // Get tags from context for filtering. An explicit `catalogTags`
        // argument overrides the tags stored by `set_project` for this call;
        // an empty array disables tag filtering (it does not fall back to
        // the stored tags).
        const tagsFromContext = await this.getTagsFromContext(context);
        const effectiveTags = toolArgs.catalogTags ?? tagsFromContext;

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
                    effectiveTags,
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
        dashboardContext?: DashboardQueryContextAttributes,
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
                dashboardContext,
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
        dashboardContext?: DashboardQueryContextAttributes,
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
                            dashboardContext,
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

    /**
     * Handles the observability of a tool call: analytics event and
     * structured log.
     *
     * Every tool goes through this handler, so the events are consistent
     * across the legacy tools and the modular tool modules.
     */
    private async handleToolCall(info: McpToolCallInfo): Promise<void> {
        const { toolName, context, durationMs, success, error } = info;

        try {
            const { user, organizationUuid } = this.getAccount(context);

            const projectUuid = await this.getTrackedProjectUuid(
                context,
                info.args,
            );

            this.analytics.track<McpToolCallEvent>({
                event: 'mcp_tool_call',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    toolName,
                    authType:
                        context.authType === McpAuthType.Pat ? 'pat' : 'oauth',
                    durationMs,
                    success,
                },
            });

            this.logger.info('MCP tool call', {
                toolName,
                userId: user.userUuid,
                organizationUuid,
                projectUuid,
                authType: context.authType,
                durationMs,
                success,
                ...(error ? { error: error.message } : {}),
            });
        } catch (trackingError) {
            this.logger.debug(
                'Failed to track MCP tool call',
                trackingError as Error,
            );
        }
    }

    /**
     * Resolves the project of a tool call for the analytics event.
     *
     * The project is optional: tools that do not need a project (or that were
     * called without a project context) are tracked without it.
     */
    private async getTrackedProjectUuid(
        context: McpToolContext,
        args: AnyType,
    ): Promise<string | undefined> {
        try {
            const explicitProjectUuid = args?.projectUuid;
            if (typeof explicitProjectUuid === 'string') {
                return explicitProjectUuid;
            }

            const storedContext = await this.mcpContextModel.getContext(
                context.user.userUuid,
                context.organizationUuid,
            );

            return storedContext?.context?.projectUuid;
        } catch (error) {
            return undefined;
        }
    }
}
