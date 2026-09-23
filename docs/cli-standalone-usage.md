# 本仓 CLI 使用流程

看板跨环境同步只用本仓 CLI。不要用官方 `npx @lightdash/cli` 做日常 download / upload / lint。

原因：

- 本仓看板 YAML 有 `tab.filters`、`config`、公式 / PoP 等扩展字段
- 官方 CLI 的 `lint` 会按官方 schema 把这些字段判成非法
- 本仓 CLI 走 `/api/v1/projects/{id}/code/*`，并带 `--include-charts`、`--language-map`、允许 `tab.filters` 的 `lint`

命令名是 `lightdash`（与官方同名）。本机若已装官方 CLI，全局安装本仓包会覆盖它；只在同步机或 CI 里装本仓包即可。

推荐顺序：

```text
拿 tgz → npm i -g → login --token
    → download --project 源项目
    → （可选）改 YAML / 看 language-map
    → lint
    → upload --project 目标项目 [--force] [--include-charts]
```

## 1. 拿 CLI

优先从 GitHub Release 下载 `cli-v*` 的独立 tgz（文件名形如 `lightdash-cli-*.tgz`）。源码 zip **不能**当安装包。

```powershell
gh release download cli-v2.1.5 -p "lightdash-cli-*.tgz"
```

公开库也可以用 Release 文件 URL。私有库不要直接 npx URL（没 token 会 404），用 `gh release download`。

仓库里开发可以不装包，直接跑构建产物：

```powershell
pnpm -F cli build
node ./packages/cli/dist/index.js --help
```

## 2. 安装

```powershell
npm install -g ./lightdash-cli-2.1.5.tgz
lightdash --version
```

或不装全局：

```powershell
npx --yes ./lightdash-cli-2.1.5.tgz --help
```

## 3. 登录

个人访问令牌：Lightdash UI → User settings → Personal access tokens。

```powershell
lightdash login https://你的站点 --token 你的PAT
```

之后命令读本机已保存的登录信息。也可以用环境变量覆盖，不必反复 `login`：

- `LIGHTDASH_URL`：服务地址
- `LIGHTDASH_API_KEY`：Personal Access Token
- `LIGHTDASH_PROJECT`：默认项目 UUID，可被 `--project` 覆盖

CI 里同样先 `login`，或注入上面三个环境变量。不要把 token 写进仓库。

## 4. 下载

默认拉当前项目的 charts、sqlCharts、dashboards，并尽量拉 spaces。未指定 `--path` 时，写到当前目录下的 `lightdash/`：

```text
lightdash/
  spaces/
  charts/
  dashboards/
```

```powershell
# 全量（第一次、或目标环境还没有这些内容时）
lightdash download --project <项目UUID>

# 指定看板（会带上该看板引用的 saved chart）
lightdash download --project <项目UUID> -d <看板slug或uuid>

# 指定图
lightdash download --project <项目UUID> -c <图表slug或uuid>

# 指定输出目录
lightdash download --project <项目UUID> --path ./sync-out

# 顺便生成语言映射（给后续翻译用）
lightdash download --project <项目UUID> --language-map
```

注意：

- `-d` 只保证带 **saved chart**。看板里的 **SQL 图** 不会当依赖自动拉。SQL 图要同步时，用全量 `download`，或再 `-c` 把对应 SQL 图 slug 拉下来。
- 缺图时 upload 不会 500，对应 tile 会空，命令会打 warning。先补下图表再传。
- spaces 失败时命令会警告并跳过，不影响 charts / dashboards。
- 后端必须已经部署本仓的 `/code/*` 接口。可用 `lightdash diagnostics` 看登录和版本，但它成功不代表 download 一定能用。

## 5. 校验（本仓 lint）

在 YAML 目录执行：

```powershell
lightdash lint
lightdash lint --path ./lightdash
lightdash lint --path ./sync-out
```

校验 `charts/*.yml` 和 `dashboards/*.yml`。本仓 schema **允许** `tabs[].filters`，以及本仓 `config` 扩展。

不要用官方 `npx @lightdash/cli lint` 校验这批文件。也不要为了过官方 lint 去剥 `tab.filters`。

## 6. 上传

```powershell
# 全量：目录里的 charts + dashboards 都传（有改动才传，除非 --force）
lightdash upload --project <目标项目UUID>

# 只传指定看板，并带上本地 charts/ 里对应的图
lightdash upload --project <目标项目UUID> -d <看板slug> --include-charts

# 强制覆盖（新环境第一次、或本地没改但目标缺内容）
lightdash upload --project <目标项目UUID> --force

# 指定目录
lightdash upload --project <目标项目UUID> --path ./sync-out --force
```

注意：

- **先有图，再有看板。** 只传看板、本地没有对应 chart YAML、或漏了 `--include-charts`，目标环境可能出现空 tile。
- `--include-charts` 只在带 `-d` 传看板时需要显式打开；全量 `upload` 会处理目录里的 charts。
- `--force` 用于目标项目是空的、或要覆盖远端。跨环境导入建议加上，否则本地没改动时可能被判断为无需上传。
- `--skip-space-create`：目标环境没有对应 space 时跳过创建。
- 上传走 `/code/charts`、`/code/dashboards`、`/code/sqlCharts`。权限：Editor 可 create（有则更新），Viewer 不行。

## 7. 跨环境示例

从 A 下载，对 B `upload --force`。slug、`tabSlug`、config 里的 slug 可移植；环境本地 UUID 不要手抄进 YAML。

### PowerShell

```powershell
$ExportPath = ".\lightdash-dashboard-export"
$DashboardSlug = "sales-overview"

$env:LIGHTDASH_URL = "https://prod.example.com"
$env:LIGHTDASH_API_KEY = "prod_api_key"

lightdash download `
  --project "source-project-uuid" `
  --dashboards $DashboardSlug `
  --path $ExportPath

$env:LIGHTDASH_URL = "https://staging.example.com"
$env:LIGHTDASH_API_KEY = "staging_api_key"

lightdash upload `
  --project "target-project-uuid" `
  --dashboards $DashboardSlug `
  --include-charts `
  --force `
  --path $ExportPath

Remove-Item Env:\LIGHTDASH_API_KEY
Remove-Item Env:\LIGHTDASH_URL
```

### Bash

```bash
EXPORT_PATH="./lightdash-dashboard-export"
DASHBOARD_SLUG="sales-overview"

LIGHTDASH_URL="https://prod.example.com" \
LIGHTDASH_API_KEY="prod_api_key" \
lightdash download \
  --project "source-project-uuid" \
  --dashboards "$DASHBOARD_SLUG" \
  --path "$EXPORT_PATH"

LIGHTDASH_URL="https://staging.example.com" \
LIGHTDASH_API_KEY="staging_api_key" \
lightdash upload \
  --project "target-project-uuid" \
  --dashboards "$DASHBOARD_SLUG" \
  --include-charts \
  --force \
  --path "$EXPORT_PATH"
```

导出后目录类似：

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

YAML 字段、权限、空 tile 行为见 [dashboard-sync-current-cli-usage.md](./dashboard-sync-current-cli-usage.md)。

## 8. CI 示例

```yaml
- run: npm install -g ./lightdash-cli-2.1.5.tgz
- run: lightdash login "$SITE_URL" --token "$LIGHTDASH_PAT"
- run: lightdash lint --path ./lightdash
- run: lightdash upload --project "$PROJECT_UUID" --force
```

`SITE_URL`、`LIGHTDASH_PAT`、`PROJECT_UUID` 用 CI secret，不要进 git。
