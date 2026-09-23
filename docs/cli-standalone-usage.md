# 本仓 CLI 使用流程

看板跨环境同步只用本仓 CLI。不要用官方 `npx @lightdash/cli` 做日常 download / upload / lint。

原因：

- 本仓看板 YAML 有 `tab.filters`、`config`、公式 / PoP 等扩展字段
- 官方 CLI 的 `lint` 会按官方 schema 把这些字段判成非法
- 本仓 CLI 走 `/api/v1/projects/{id}/code/*`，并带 `--include-charts`、`--language-map`、允许 `tab.filters` 的 `lint`

命令名是 `lightdash`（与官方同名）。本机若已装官方 CLI，全局安装本仓包会覆盖它；只在同步机或 CI 里装本仓包即可。

推荐顺序：

```text
拿 tgz → npx 冒烟（--version / lint --help）
    → 环境变量登录 → download --project 源项目
    → lint
    → （需要时再）upload，先预发、先 -d 一条看板
```

冒烟够用 download + lint。不要一上来就对全项目 `upload --force`。

## 1. 拿 CLI

从 GitHub Release 下载对应 `cli-vX.Y.Z` 的 `lightdash-cli-X.Y.Z.tgz`。源码 zip **不能**当安装包。这个 tgz 用于 `download` / `upload` / `lint`。Jenkins 上的 `lightdash deploy` 继续用 CLI Docker 镜像。

仓库若只有这一条 CLI Release，GitHub 页面仍可能标 Latest。下载必须带 tag（`cli-vX.Y.Z`），不要用不带 tag 的 `gh release download`。

有 `gh`：

```powershell
gh release list --limit 20
# 找到最新的 cli-vX.Y.Z，再：
gh release download cli-vX.Y.Z -p "lightdash-cli-*.tgz"
```

没有 `gh`：打开仓库 Releases 页，下载 Assets 里的 `lightdash-cli-X.Y.Z.tgz`。PowerShell 也可以：

```powershell
Invoke-WebRequest `
  -Uri "https://github.com/<org>/<repo>/releases/download/cli-vX.Y.Z/lightdash-cli-X.Y.Z.tgz" `
  -OutFile "lightdash-cli-X.Y.Z.tgz"
```

公开库可以直接下。私有库需要登录权限；不要对私有 Release URL 做无 token 的 npx。

可选校验 sha256（和 Release 页或同事提供的摘要对比）：

```powershell
(Get-FileHash -Algorithm SHA256 .\lightdash-cli-X.Y.Z.tgz).Hash.ToLower()
```

仓库里开发可以不装包：`pnpm -F cli build` 后 `node ./packages/cli/dist/index.js --help`。

## 2. 安装

第一次建议用 `npx`，不要急着 `npm install -g`（会盖掉本机已有的官方 `lightdash`）：

```powershell
npx --yes ./lightdash-cli-X.Y.Z.tgz --version
npx --yes ./lightdash-cli-X.Y.Z.tgz lint --help
```

`--version` 应和文件名里的 X.Y.Z 一致。确认没问题再：

```powershell
npm install -g ./lightdash-cli-X.Y.Z.tgz
lightdash --version
```

下文命令写成 `lightdash ...`。若没装全局，把 `lightdash` 换成 `npx --yes ./lightdash-cli-X.Y.Z.tgz` 即可。

## 3. 登录

个人访问令牌：Lightdash UI → User settings → Personal access tokens。只放在当前 shell 的环境变量里，测完删掉。不要写进文档、仓库、截图。

```powershell
$env:LIGHTDASH_URL = "https://你的站点"
$env:LIGHTDASH_API_KEY = "你的PAT"
# 可选：$env:LIGHTDASH_PROJECT = "项目UUID"
```

也可以 `lightdash login https://你的站点 --token 你的PAT`，之后读本机已保存的登录信息。环境变量会覆盖本地配置。

项目 UUID 从地址栏抄：`https://<站点>/projects/<项目UUID>/...`。

CI 里用 secret 注入这三个变量，不要进 git。

若 CLI 提示和服务器版本不一致（例如 CLI `2.1.6`、服务端 `2.1.6-test.4`），major 相同一般可继续。不要因此去装官方 `npm install -g @lightdash/cli@...`。

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

- `-d` 会带 tile 上的 **saved chart** 和同 slug 的 **SQL 图**。对不上的 slug 会警告并跳过。全量 `download`（不带 `-d`/`-c`）本来就会拉全部 SQL 图。
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

校验 `charts/*.yml` 和 `dashboards/*.yml`。本仓 schema **允许** `tabs[].filters`，以及对象形状的本仓 `config`。

download 有时会写出 `config: null`。本仓 lint 要求 `config` 是 object，这类文件会报 `/config must be object`。要绿可以删掉该字段或改成 `{}`；不要为了过官方 lint 去剥 `tab.filters`。

不要用官方 `npx @lightdash/cli lint` 校验这批文件。

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

- 先在预发验证。第一次只传一条：`-d <看板slug> --include-charts --force`。不要一上来对生产全量 `--force`。
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
- run: gh release download "$CLI_RELEASE_TAG" -p "lightdash-cli-*.tgz"
- run: npm install -g ./lightdash-cli-*.tgz
- run: lightdash login "$SITE_URL" --token "$LIGHTDASH_PAT"
- run: lightdash lint --path ./lightdash
- run: lightdash upload --project "$PROJECT_UUID" --force
```

`CLI_RELEASE_TAG` 形如 `cli-vX.Y.Z`。`SITE_URL`、`LIGHTDASH_PAT`、`PROJECT_UUID` 用 CI secret，不要进 git。
