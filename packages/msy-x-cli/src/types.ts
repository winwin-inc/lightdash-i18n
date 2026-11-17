/**
 * 本文件的类型是并行开发的契约层：任何 job 改动这里必须同步通知主控。
 * 只放类型，不放运行时代码，避免循环依赖。
 */

/** 输出格式；`null` 表示按 TTY 自动判定（TTY=table，非 TTY=json） */
export type OutputFormat = 'table' | 'json' | 'csv';

export type AuthMode = 'oauth' | 'pat';

/** v2 主站用 authorization，v1 独立包逃生口用 x-api-key */
export type AuthHeader = 'authorization' | 'x-api-key';

export type SiteProfile = {
    name: string;
    mcpUrl: string;
    authMode: AuthMode;
    authHeader: AuthHeader;
};

/** 配置文件里的站点定义（不含 name，name 即 sites 的 key） */
export type SiteConfig = {
    mcpUrl: string;
    authMode: AuthMode;
    authHeader: AuthHeader;
};

export type OAuthCredentials = {
    mode: 'oauth';
    clientId: string;
    /** DCR 目前返回 confidential client；后端改为 public client 时为 null */
    clientSecret: string | null;
    redirectUri: string;
    accessToken: string;
    /** ISO8601 */
    accessExpiresAt: string;
    refreshToken: string | null;
    scope: string;
};

export type PatCredentials = {
    mode: 'pat';
    pat: string;
};

export type AuthCredentials = OAuthCredentials | PatCredentials;

export type CliConfig = {
    currentSite: string;
    sites: Record<string, SiteConfig>;
    auth: Record<string, AuthCredentials>;
};

/** 解析后的全局选项（commander 原始值 → 归一化值） */
export type GlobalOptions = {
    site: string | null;
    projectUuid: string | null;
    format: OutputFormat | null;
    envelope: boolean;
    out: string | null;
    timeoutMs: number;
    mcpUrl: string | null;
    authHeader: AuthHeader | null;
    configPath: string | null;
    dryRun: boolean;
    raw: boolean;
    verbose: boolean;
    quiet: boolean;
};

/** 每个命令拿到的运行上下文 */
export type CommandContext = {
    options: GlobalOptions;
    site: SiteProfile;
    credentials: AuthCredentials | null;
    /** 已按 TTY/显式 flag 归一化 */
    format: OutputFormat;
    /** performance.now()，用于 meta.durationMs */
    startedAt: number;
};

/** 命令层唯一产出：要调哪个工具、传什么参数（--dry-run 直接打印它） */
export type ToolCall = {
    tool: string;
    args: Record<string, unknown>;
};

export type ToolContentBlock = {
    type: string;
    text?: string;
};

export type ToolResult = {
    structuredContent?: unknown;
    content: ToolContentBlock[];
    isError: boolean;
};

export type ToolDescriptor = {
    name: string;
    description: string | null;
    inputSchema: unknown;
};

export type McpClient = {
    listTools(): Promise<ToolDescriptor[]>;
    callTool(
        call: ToolCall,
        options?: { timeoutMs?: number },
    ): Promise<ToolResult>;
    close(): Promise<void>;
};

/** 命令结果：要么是工具返回，要么是本地生成的消息 */
export type CommandResult =
    | {
          kind: 'tool';
          tool: string;
          data: unknown;
          rows: number | null;
      }
    | {
          kind: 'message';
          message: string;
          data: unknown | null;
      };

/** 渲染层入参 */
/** 命令描述符：纯数据 + 纯映射，便于单测与并行开发 */
export type CommandOptionSpec = {
    /** commander flags，如 '--limit <n>' */
    flags: string;
    description: string;
    defaultValue?: string;
};

/** build 的入参：位置参数 + 选项 + 全局上下文，全部已归一化为字符串 */
export type CommandBuildInput = {
    args: Record<string, string | undefined>;
    options: Record<string, string | boolean | undefined>;
    projectUuid: string | null;
};

export type CommandSpec = {
    /** 空格分隔的 commander 路径，如 'dashboards tiles <dashboardUuid>' */
    name: string;
    description: string;
    options: CommandOptionSpec[];
    /** --help 里展示的真实可跑示例（单行） */
    example: string;
    /** 纯函数：不读环境、不发请求、不写盘 */
    build: (input: CommandBuildInput) => ToolCall[];
    /** 数据类命令才允许 --csv */
    dataCommand: boolean;
};

/** 渲染层入参 */
export type RenderInput = {
    tool: string;
    result: ToolResult;
    format: OutputFormat;
    envelope: boolean;
    out: string | null;
    quiet: boolean;
    startedAt: number;
    site: string;
};

export type RenderOutput = {
    /** 要写到 stdout 的内容（已含结尾换行） */
    stdout: string;
    /** 行数，未知为 null */
    rows: number | null;
};
