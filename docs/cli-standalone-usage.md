# 本仓 CLI 使用流程

看板跨环境同步只用本仓 CLI，不要用官方 `npx @lightdash/cli`。

命令名是 `lightdash`（与官方同名）。`npm install -g` 会覆盖本机已有的官方 CLI，只在同步机或 CI 里装。

日常从 **CDN** 装独立 tgz，不用申请 npm 账号、不用搭私有仓库。当前已发版：**2.1.7**（之后以最新 `cli-v*` 为准）。

```text
https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz
```

以后换版本只改路径里的号：`.../cli/X.Y.Z/lightdash-cli-X.Y.Z.tgz`。

主机与前端静态资源同一套 `CDN_BASE_URL`（默认 `https://img0.banmahui.cn`）。必须是这个 `.tgz`，源码 zip / Releases 列表页不行。路径带版本且不可变，没有 `latest`。

`lightdash deploy` 仍用 CLI Docker 镜像（ACR `lightdash-cli-X.Y.Z`），不用这个 tgz。

YAML、权限、空 tile 见 [dashboard-sync-current-cli-usage.md](./dashboard-sync-current-cli-usage.md)。

## 1. 安装

需要 Node.js。

```bash
# 冒烟
npx --yes https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz --version
npx --yes https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz lint --help

# 全局装
npm install -g https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz
lightdash --version
```

`--version` 应为 `2.1.7`。这和 `npm install -g @lightdash/cli` 不是一回事，后者仍是官方包。不要在本仓库根目录跑 `npx`（会撞 monorepo 的 npm overrides），换个空目录即可。

可选校验：

```bash
curl -fsSL -o lightdash-cli-2.1.7.tgz \
  https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz
sha256sum lightdash-cli-2.1.7.tgz
# 对照 https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz.sha256
```

备份（需要仓库权限）：GitHub Release `cli-v2.1.7` 上同一份 tgz。`gh release list -R winwin-inc/lightdash-i18n --limit 20` 后 `gh release download cli-v2.1.7 -p "lightdash-cli-*.tgz"`，再 `npm install -g ./lightdash-cli-2.1.7.tgz`。不要用不带 tag 的 `gh release download`。

仓库里开发可以不装包：`pnpm -F cli build` 后 `node ./packages/cli/dist/index.js --help`。

## 2. 更新

CDN 没有 `latest`。升级就是换 URL 里的版本号，再 `npm install -g` 覆盖，不用先卸载。

```bash
lightdash --version   # 看当前，例如 2.1.6

# 升到当前最新 2.1.7（之后把号换成新版本即可）
npm install -g https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz
lightdash --version   # 应为 2.1.7
```

新版本号从哪来：

- 发版说明 / 同事通知里的 `cli-vX.Y.Z`（日常够用，CDN 不提供目录列表）
- 有仓库权限：`gh release list -R winwin-inc/lightdash-i18n --limit 20`，看最新 `cli-v*`

不要跑 `npm update -g @lightdash/cli`，那会装到官方包。`npx` 每次带完整 URL，换版本即换 URL。Jenkins 的 `lightdash deploy` 跟 ACR 镜像 tag，和这个 tgz 升级无关。

### 发新版本（维护者）

1. `pnpm bump-cli -- X.Y.Z`（改 `packages/cli/package.json`、打 `cli-vX.Y.Z`）
2. `git push && git push origin cli-vX.Y.Z`，等 `build-docker-cli`：打 tgz → 挂 GitHub Release → 传到 `msy-x/cli/X.Y.Z/`
3. 冒烟：`npx --yes https://img0.banmahui.cn/msy-x/cli/X.Y.Z/lightdash-cli-X.Y.Z.tgz --version`（当前已发：`2.1.7`）
4. 通知使用方换 URL 再装

同版本不覆盖。修包必须 bump 新号。已发的包不必重打 tag，可用现有 tgz 跑 `scripts/upload-cli-tgz-to-cdn.sh`（或重跑对应 `cli-v*` workflow）。

## 3. 登录

PAT：Lightdash UI → User settings → Personal access tokens。只放当前 shell，测完 `unset`。不要写进仓库或截图。

```bash
export LIGHTDASH_URL="https://你的站点"
export LIGHTDASH_API_KEY="你的PAT"
# 可选：export LIGHTDASH_PROJECT="项目UUID"
```

也可以 `lightdash login https://你的站点 --token 你的PAT`。环境变量覆盖本地配置。

项目 UUID 从地址栏抄：`https://<站点>/projects/<项目UUID>/...`。

CLI 和服务端版本不一致（例如 CLI `2.1.7`、服务端 `2.1.6-test.4`）时，major 相同一般可继续。`LIGHTDASH_URL` 用已部署 `/code/*` 的环境（如 `https://x.pre.banmahui.cn`），不要连还是 2.1.3 的旧预发。

## 4. 同步

默认写到当前目录 `lightdash/`（spaces / charts / dashboards）。冒烟够用 download + lint。不要一上来对生产全量 `upload --force`。

```bash
# 全量
lightdash download --project <源项目UUID> --path ./sync-out

# 只拉一块看板（会带 tile 上的 saved chart 和同 slug 的 SQL 图）
lightdash download --project <源项目UUID> -d <看板slug> --path ./sync-out

lightdash lint --path ./sync-out

# 先预发、先一条
lightdash upload --project <目标项目UUID> -d <看板slug> --include-charts --force --path ./sync-out
```

常用补充：

- `-c <图表slug>`：只拉指定图
- `--language-map`：顺便生成语言映射
- 全量 `upload --project <目标UUID> --path ./sync-out --force`：目录里的 charts + dashboards 都传
- `--skip-space-create`：目标没有对应 space 时跳过创建

注意：

- `-d` 对不上的 slug 会警告并跳过。全量 download（不带 `-d`/`-c`）会拉全部 SQL 图。
- **先有图，再有看板。** 只传看板、本地没有对应 YAML、或漏了 `--include-charts`，目标环境可能空 tile。
- `--include-charts` 只在带 `-d` 传看板时需要显式打开；全量 upload 会处理目录里的 charts（含 `*.sql.yml`）。
- `--force` 用于目标是空的或要覆盖远端。跨环境建议加上。
- spaces 失败会警告并跳过，不影响 charts / dashboards。
- 权限：Editor 可 download / upload；Viewer 不行。后端必须已部署本仓 `/code/*`。

跨环境示例：

```bash
EXPORT_PATH="./sync-out"
DASHBOARD_SLUG="sales-overview"

LIGHTDASH_URL="https://prod.example.com" \
LIGHTDASH_API_KEY="prod_api_key" \
lightdash download --project "source-project-uuid" -d "$DASHBOARD_SLUG" --path "$EXPORT_PATH"

LIGHTDASH_URL="https://staging.example.com" \
LIGHTDASH_API_KEY="staging_api_key" \
lightdash upload --project "target-project-uuid" -d "$DASHBOARD_SLUG" --include-charts --force --path "$EXPORT_PATH"

unset LIGHTDASH_API_KEY LIGHTDASH_URL
```

## 5. CI

```yaml
- run: npm install -g https://img0.banmahui.cn/msy-x/cli/${CLI_VERSION}/lightdash-cli-${CLI_VERSION}.tgz
- run: lightdash login "$SITE_URL" --token "$LIGHTDASH_PAT"
- run: lightdash lint --path ./lightdash
- run: lightdash upload --project "$PROJECT_UUID" --force
```

`CLI_VERSION` 当前用 `2.1.7`。`SITE_URL`、`LIGHTDASH_PAT`、`PROJECT_UUID` 用 secret，不要进 git。
