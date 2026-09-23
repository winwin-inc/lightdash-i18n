# 使用 CLI 跨环境同步看板

## 概述

可以通过 Lightdash CLI 的 `download` 和 `upload` 完成「从一个环境导出看板，再导入到另一个环境」的流程。本实例已对齐官方 Content as Code 路由 `/api/v1/projects/{id}/code/*`。

核心思路：

1. 使用源环境的 `LIGHTDASH_URL`、`LIGHTDASH_API_KEY`、`project uuid` 执行 `lightdash download`。
2. CLI 将看板、图表、SQL 图表和 space 导出为本地 YAML 文件。
3. 切换为目标环境的 `LIGHTDASH_URL`、`LIGHTDASH_API_KEY`、`project uuid` 执行 `lightdash upload`。
4. CLI 按 slug 在目标环境创建或更新图表、看板和 space。

**验收请先固定官方 CLI 2.58.0。** 官方 npm CLI 只比对 major 版本（都是 `2.x`），`diagnostics` 成功不代表 download 能用。后端必须已经部署本仓的 `/code/*` 接口。

```bash
npx @lightdash/cli@2.58.0 diagnostics
npx @lightdash/cli@2.58.0 download
npx @lightdash/cli@2.58.0 upload --force
```

日常只用默认 `download`。不要对预发跑 `--include-all`：更新的官方 CLI 还会请求 agents / alerts / schedules / homepages，本实例未实现这些端点。

## 不要和 `lightdash deploy` 混用

- `download` / `upload`：看板、图表、SQL 图表、space 的 Content as Code。
- `lightdash deploy`：dbt explores / table-groups（数据集多级分组）。
- `.lightdash-metadata.json` 是官方 CLI 本地文件，服务端不会生成。

## 不要用官方 `lightdash lint` 卡自研字段

官方 CLI 包里的 `DashboardTabAsCode` schema 是 `additionalProperties: false`，且没有 `filters`。本仓看板 Tab 级筛选、看板 `config`、公式 / PoP 必须在 YAML 往返中保留。Agent 主路径是 download → 改 YAML → upload，不要用官方 lint 剥字段。

## 权限

| 角色 | download | upload |
|---|---|---|
| Viewer / Interactive viewer | 否 | 否 |
| Editor | 是 | 是 |
| Developer / Admin / 现有 Service Account | 是 | 是 |
| 自定义角色只勾 `view:ContentAsCode` | 是 | 否 |

只读同步给 agent 时：自定义角色只授 `view:ContentAsCode` + PAT。已落库的旧自定义角色不会自动多出 view/create，需要管理员补 scope。空间权限仍在：进不了的 private space 下不了、也建不进去。跨环境 space ACL 按 email / group name 对齐，对不上会警告并跳过，不会阻断 chart / dashboard upload。

## 当前 CLI 已支持的能力

默认 download 会请求：

- `GET /api/v1/projects/{id}/code/spaces`（404/403 会警告并继续）
- `GET /api/v1/projects/{id}/code/charts`
- `GET /api/v1/projects/{id}/code/sqlCharts`
- `GET /api/v1/projects/{id}/code/dashboards`

旧路径 `/charts/code`、`/dashboards/code` 仍可用，供 MCP / 旧脚本兼容。

### 导出

```bash
lightdash download
```

常用参数：

- `--project <project_uuid>`：指定从哪个项目导出。
- `--dashboards <dashboard...>`：只导出指定看板，支持 slug、uuid 或 URL。
- `--charts <chart...>`：只导出指定图表，支持 slug、uuid 或 URL。
- `--path <path>`：指定导出目录，默认是当前目录下的 `lightdash`。
- `--language-map`：同时导出多语言映射文件。

当使用 `--dashboards` 只导出指定看板时，CLI 会自动把这些看板依赖的 chart 一起下载到本地。

### 导入

```bash
lightdash upload
```

常用参数：

- `--project <project_uuid>`：指定导入到哪个目标项目。
- `--dashboards <dashboard...>`：只导入指定看板 slug。
- `--charts <chart...>`：只导入指定图表 slug。
- `--path <path>`：指定从哪个目录读取 YAML 文件。
- `--include-charts`：导入看板时，同时导入看板依赖的 charts。
- `--force`：即使本地文件没有变更，也强制上传。跨环境导入时建议使用。
- `--skip-space-create`：如果目标环境不存在对应 space，则跳过创建。

跨环境导入时通常需要加 `--include-charts --force`，否则只导入 dashboard 时可能因为目标环境缺少依赖 chart 而失败。

## 环境变量

CLI 当前只有一个运行上下文，目标环境由环境变量或本地登录配置决定。跨环境时推荐用环境变量显式指定，避免反复 `login` 或切换本地配置。

支持的环境变量：

- `LIGHTDASH_URL`：Lightdash 服务地址。
- `LIGHTDASH_API_KEY`：Personal Access Token 或 Service Account Token。
- `LIGHTDASH_PROJECT`：默认项目 UUID。也可以用命令参数 `--project` 覆盖。
- `LIGHTDASH_PROXY_AUTHORIZATION`：如环境需要代理鉴权时使用。

## PowerShell 示例

以下示例将线上环境的 `sales-overview` 看板同步到预发环境。

### 1. 设置公共变量

```powershell
$ExportPath = ".\lightdash-dashboard-export"
$DashboardSlug = "sales-overview"
```

### 2. 从源环境导出

```powershell
$env:LIGHTDASH_URL = "https://prod.example.com"
$env:LIGHTDASH_API_KEY = "prod_api_key"

npx @lightdash/cli@2.58.0 download `
  --project "source-project-uuid" `
  --dashboards $DashboardSlug `
  --path $ExportPath
```

导出后会生成类似目录：

```text
lightdash-dashboard-export/
  spaces/
    xxx.space.yml
  charts/
    xxx.yml
    xxx.sql.yml
  dashboards/
    sales-overview.yml
```

### 3. 导入到目标环境

```powershell
$env:LIGHTDASH_URL = "https://staging.example.com"
$env:LIGHTDASH_API_KEY = "staging_api_key"

npx @lightdash/cli@2.58.0 upload `
  --project "target-project-uuid" `
  --dashboards $DashboardSlug `
  --include-charts `
  --force `
  --path $ExportPath
```

### 4. 清理当前 PowerShell 会话中的敏感变量

```powershell
Remove-Item Env:\LIGHTDASH_API_KEY
Remove-Item Env:\LIGHTDASH_URL
```

## Bash 示例

```bash
EXPORT_PATH="./lightdash-dashboard-export"
DASHBOARD_SLUG="sales-overview"

LIGHTDASH_URL="https://prod.example.com" \
LIGHTDASH_API_KEY="prod_api_key" \
npx @lightdash/cli@2.58.0 download \
  --project "source-project-uuid" \
  --dashboards "$DASHBOARD_SLUG" \
  --path "$EXPORT_PATH"

LIGHTDASH_URL="https://staging.example.com" \
LIGHTDASH_API_KEY="staging_api_key" \
npx @lightdash/cli@2.58.0 upload \
  --project "target-project-uuid" \
  --dashboards "$DASHBOARD_SLUG" \
  --include-charts \
  --force \
  --path "$EXPORT_PATH"
```

## 本地开发运行本仓 CLI

如果没有全局安装 `lightdash`，可以在仓库根目录先构建 CLI：

```bash
pnpm -F cli build
```

然后用构建产物执行命令：

```bash
node ./packages/cli/dist/index.js download --help
node ./packages/cli/dist/index.js upload --help
```

跨环境同步时，把上文中的 `lightdash` 替换为：

```bash
node ./packages/cli/dist/index.js
```

官方 npm CLI 用户不需要等本仓发 CLI 包，后端部署到预发后即可用 `@lightdash/cli@2.58.0`。

## 注意事项

- 导入按 `slug` 匹配。目标环境中已有相同 slug 的图表或看板时，会更新已有内容。
- 目标环境需要有兼容的 dbt explore、字段和指标，否则导入后的图表可能无法正常查询。
- Tab 级筛选、看板 `config`、公式 / PoP、`--language-map` 会随 YAML 往返，不要用会剥未知字段的工具改 YAML。
- 当前流程不同步 agents、定时任务、告警、homepages。
- 导入看板前应先导入依赖图表；使用 `--include-charts` 可以让 CLI 自动处理。
- `--force` 适合跨环境导入，因为导出的 YAML 文件可能没有本地修改时间差异，不加时可能被判断为无需上传。
- API key 不要提交到仓库，也不要写入可共享文档。建议只放在本地 shell 会话或安全的 CI secret 中。
