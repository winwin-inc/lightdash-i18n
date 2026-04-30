# 使用指南

## 开始之前

你只需要两样东西，找平台或运维同学获取：

1. **PAT**（Personal Access Token / API Token）：权限和你在 Lightdash 网页端一致。
2. **MCP 根 URL**：比如 `https://your-mcp-host/mcp`。

多项目时，在对话里用 `list_projects` / `set_project` 切换就行。不需要在本机配一堆环境变量——那些端口、主站 URL，是跑 MCP 进程那一方在服务端配的。

## 连接 MCP

### Claude Code

先设个环境变量（别把 token 直接写进配置文件）：

```bash
export LIGHTDASH_MCP_APIKEY="your-token"
claude mcp add lightdash-mcp https://your-mcp-host/mcp \
  -H "x-api-key: $LIGHTDASH_MCP_APIKEY" \
  -t http
```

连上之后，用 `tools/list` 确认工具名都在。

### Cursor

在项目根目录新建 `.mcp.json`：

```json
{
  "mcpServers": {
    "lightdash": {
      "type": "http",
      "url": "https://your-mcp-host/mcp",
      "headers": {
        "x-api-key": "<填 PAT>"
      }
    }
  }
}
```

别把 PAT 提交到 Git。

### 工具列表

连上之后能看到这些工具，分几组：

**健康 / 组织**
- `get_lightdash_version`：查实例版本
- `list_projects`：列出能访问的项目

**会话 / 项目**
- `set_project`：设本会话默认项目（内存，支持 `tags` 过滤数据目录）
- `get_current_project`：读当前设的是哪个项目

**Explore**
- `list_explores`：列出所有 explores（`filtered: true` 默认只显示已启用的）
- `find_explores`：按关键词搜索 explore
- `find_fields`：在某个 explore 里按关键词找字段

**内容**
- `find_content`：v2 内容搜索，返回 webUrl
- `list_verified_content`：已验证的图表和看板

**查询**
- `search_field_values`：枚举维度取值
- `run_sql`：跑原始 SQL
- `run_metric_query`：指标查询 v2

**扩展工具**（`lightdash_*` 前缀）
- `lightdash_get_site_info`：返回 siteBaseUrl
- `lightdash_list_spaces`：列空间
- `lightdash_get_saved_chart` / `lightdash_run_saved_chart`：操作已保存的图表

另外有一个 `lightdash-analyst` Prompt，给模型用的角色说明，不是工具。

## 挂载 Skills

Skills 是放在项目里的 Markdown 文件，告诉模型遇到什么任务应该先走哪条路。只要编辑器能读到 `SKILL.md` 就行，不需要跑在任何服务上。

`lightdash-insight-router` 是唯一入口，所有请求先经过它路由；`lightdash-metric-query` 补充指标查询的参数说明和常见问题。

### Claude Code

1. 把技能包根目录当作工作区打开（应该能看到 `lightdash-insight-router/`、`lightdash-metric-query/` 这些文件夹）。
2. 把 `.mcp.json.example` 复制到你的项目根，改名成 `.mcp.json`，填入 MCP 地址和 API Key。
3. 过一遍 `.claude/settings.json`，确认 MCP 自动启用和权限配置没问题。
4. 指标查询看 `lightdash-metric-query/QUERY-CHECKLIST.md`；整体流程看 `lightdash-insight-router/ROUTER-SOP.md`。

### Cursor

MCP 配置和上面一样。

Skills 可以用两种方式挂：
- **方式 A**：用 Cursor 打开技能包根目录，Agent 会自动找到子目录里的 `SKILL.md`。
- **方式 B**：在 Settings → Features → Agent Skills 里，手动填技能包里 `lightdash-insight-router/SKILL.md` 的绝对路径。

## 怎么用比较好

先交代清楚你要查什么、时间范围是多少。多项目时先用 `list_projects` / `set_project` 声明上下文。

优先找现成的图表：先 `find_content` 搜搜有没有已做好的，没有再做新的。流程是 `list_explores` → 按需 `find_explores` / `find_fields` → `run_metric_query`。

想打开看详情，用工具返回的 `webUrl` / `siteBaseUrl`，别自己去猜 URL 格式。

### 422 怎么避

`run_metric_query` 几个容易踩的坑：

- 用扁平参数，别嵌套 `query` 对象
- `filters` 是对象，不是数组
- `parameters` 要对象，不是字符串
- `context` 传枚举值，比如 `mcp`

## 常见问题

**401/403**：PAT 无效，或者这个用户对这个项目没权限。

**404**：当前主站未提供该 REST 路径（例如接口未开放或版本差异）。

**422**：请求 JSON 格式不对。

**会话丢了**：多副本部署或进程重启后，内存里的会话信息丢了。重新 `set_project` 或者配个默认项目 UUID 就行。
