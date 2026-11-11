# MCP 工具迁移指南（主站后端）

本文件是给实现者（人或 agent）的契约：从独立包 `packages/lightdash-mcp` 把 MCP 工具迁移到主站后端
`packages/backend/src/services/McpService/`。

## 1. 背景

- 主站后端已内置 MCP（`/api/v1/mcp`），核心在 `packages/backend/src/services/McpService/`。
- 独立包 `packages/lightdash-mcp` 是一套“通过 REST 回调主站”的独立 MCP 服务，工具更全（27 个），
  但它绕不开 EE/商业能力限制，且会在主站进程外再走一圈 HTTP。
- 目标：把独立包的工具语义（入参、描述、返回格式、权限校验）搬到主站后端，**直接调用 backend service**，
  不做 HTTP 自环。

## 2. 框架 API

目录：`packages/backend/src/services/McpService/`

| 文件 | 作用 |
| --- | --- |
| `McpService.ts` | MCP 服务主体，持有 `McpServer`，注册已有工具 |
| `McpToolName.ts` | 所有 MCP 工具名枚举（新增工具必须在此登记） |
| `McpAuthContext.ts` | 鉴权上下文（OAuth / PAT） |
| `tools/registry.ts` | `McpToolRegistry`：唯一注册入口，负责鉴权 + scope 校验 |
| `tools/types.ts` | `McpToolContext`（工具拿到的上下文） |
| `tools/deps.ts` | `McpToolDeps`（工具可用的 service / model 集合） |
| `tools/helpers.ts` | `jsonToolResult()`、`textToolResult()` |
| `tools/scopes.ts` | 工具 → scope 映射（新增工具必须在此登记） |

### 注册一个工具

```ts
import { z } from 'zod';
import { McpToolName } from '../McpToolName';
import { McpToolDeps } from './deps';
import { jsonToolResult } from './helpers';
import { McpToolRegistry } from './registry';

export const registerExampleTools = (
    registry: McpToolRegistry,
    deps: McpToolDeps,
): void => {
    registry.register(
        McpToolName.EXAMPLE,
        {
            description: 'Short English description of what the tool does.',
            inputSchema: {
                projectUuid: z.string().optional().describe('...'),
            },
        },
        async (args, context) => {
            // args 已按 inputSchema 校验
            const { user, organizationUuid } = context;
            const data = await deps.someService.someMethod(user, args);
            return jsonToolResult(data);
        },
    );
};
```

然后在 `McpService.setupHandlers()` 里调用：

```ts
registerExampleTools(this.toolRegistry, this.getToolDeps());
```

### `McpToolContext`

```ts
type McpToolContext = {
    user: SessionUser;          // 带 ability / abilityRules / role
    account: Account;           // OauthAccount | ApiKeyAccount
    ability: MemberAbility;     // user.ability
    organizationUuid: string;
    authType: McpAuthType;      // oauth | pat
    scopes: string[];           // PAT 为全量 scope
};
```

## 3. 硬性规则

1. **禁止 HTTP 自环**：工具必须直接调用 `deps` 里的 service / model，
   不得用 `fetch`/`axios` 请求主站自己的 REST API。
2. **权限**：
   - 优先使用本身带权限过滤的 service（`ContentService.find`、`SavedChartService.get`、
     `DashboardService.get`、`SpaceService.get` 等已经做过 CASL 过滤）。
   - 需要显式判断项目可见性时用：
     ```ts
     import { subject } from '@casl/ability';
     context.ability.can('view', subject('Project', { organizationUuid, projectUuid }))
     ```
   - 看不到就抛 `ForbiddenError`（来自 `@lightdash/common`），不要静默返回空。
3. **项目解析顺序**：`args.projectUuid`（显式） → `mcp_context` 表里存的当前项目 → 抛
   `ForbiddenError('No project context set. Use set_project or provide projectUuid parameter.')`。
   参考 `McpService.resolveProjectUuid()`。
4. **入参 schema**：使用普通 zod（`z.string().optional()` 等），**不要**带 AI agent 那套
   `type: 'xxx'` 判别字段。数值分页用 `z.coerce.number()`（LLM 常传字符串）。
5. **返回**：`jsonToolResult(data)` 或 `textToolResult(text)`；`content` 文本里放 JSON 字符串。
6. **描述用英文**（与主站已有 MCP 工具保持一致），并写清关键字段含义。
7. **代码风格**（见仓库 `CLAUDE.md`）：
   - 不用 duck typing，参数类型明确；
   - 对象形状尽量严格，缺省用 `null` 而不是 optional；
   - switch 穷举用 `assertUnreachable`；
   - `pnpm -F backend lint` 必须通过。
8. **新工具必须登记**：`McpToolName`（名字）+ `tools/scopes.ts`（scope）。
9. **分析埋点**：可复�� `McpService.trackToolCall()` 的思路，但新模块拿不到 private 方法；
   可直接调用 `deps.analytics.track<McpToolCallEvent>({...})`（`analytics` 在 `McpToolDeps` 里）。

## 4. 迁移来源对照

独立包实现（语义参考，**不要直接复制 HTTP 调用**）：

- `packages/lightdash-mcp/src/mcp/tools/registerOrgAndHealthTools.ts`
- `packages/lightdash-mcp/src/mcp/tools/registerAccessTools.ts`
- `packages/lightdash-mcp/src/mcp/tools/registerSessionProjectTools.ts`
- `packages/lightdash-mcp/src/mcp/tools/registerContentTools.ts`
- `packages/lightdash-mcp/src/mcp/tools/registerExploreCatalogTools.ts`
- `packages/lightdash-mcp/src/mcp/tools/registerQueryTools.ts`
- `packages/lightdash-mcp/src/mcp/registerExtensionTools.ts`
- `packages/lightdash-mcp/src/mcp/access/*.ts`（权限辅助，纯函数，可移植）
- `packages/lightdash-mcp/src/mcp/mcpDocsContent.ts`、`mcpAnalystPrompt.ts`（静态文档）

## 5. 验收

```bash
cd packages/backend
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --project tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=4096 npx eslint -c .eslintrc.js --ignore-path ./../../.gitignore src/services/McpService
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npx jest --config jest.config.js src/services/McpService
```

新增工具应带一个单测（至少覆盖参数校验与权限分支）。
