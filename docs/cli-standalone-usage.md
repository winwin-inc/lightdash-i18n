# 本仓 CLI 使用流程

看板跨环境同步只用本仓 CLI，不要用官方 `npx @lightdash/cli`。

命令名是 `lightdash`（与官方同名）。`npm install -g` 会覆盖本机已有的官方 CLI，只在同步机或 CI 里装。

仓库：[`winwin-inc/lightdash-i18n`](https://github.com/winwin-inc/lightdash-i18n)。只下 Release Assets 里的 `lightdash-cli-X.Y.Z.tgz`，源码 zip **不能**当安装包。下载必须带 tag（`cli-vX.Y.Z`），不要用不带 tag 的 `gh release download`。当前已发版示例：`cli-v2.1.6`（以最新 `cli-v*` 为准）。

`lightdash deploy` 仍用 CLI Docker 镜像，不用这个 tgz。

YAML、权限、空 tile 见 [dashboard-sync-current-cli-usage.md](./dashboard-sync-current-cli-usage.md)。

## 1. 下载 / 安装 / 更新

需要 Node.js。私有库先 `gh auth login`。

```bash
# 列出最近的 CLI tag，选最新的 cli-vX.Y.Z
gh release list -R winwin-inc/lightdash-i18n --limit 20

gh release download cli-vX.Y.Z -R winwin-inc/lightdash-i18n -p "lightdash-cli-*.tgz"

# 没有 gh 时：
# curl -L -o lightdash-cli-X.Y.Z.tgz \
#   https://github.com/winwin-inc/lightdash-i18n/releases/download/cli-vX.Y.Z/lightdash-cli-X.Y.Z.tgz

# 可选：和 Release 页摘要对比
sha256sum lightdash-cli-X.Y.Z.tgz

# 冒烟后再全局装
npx --yes ./lightdash-cli-X.Y.Z.tgz --version
npx --yes ./lightdash-cli-X.Y.Z.tgz lint --help
npm install -g ./lightdash-cli-X.Y.Z.tgz
lightdash --version
```

npm / npx 也可以直接装这个 tgz 的 https 地址，不必先下载、也不必申请 npm 账号或搭私有仓库。必须是 Assets 里 `.tgz` 的下载链接，不能是源码 zip 或 Releases 列表页：

```bash
npx --yes https://github.com/winwin-inc/lightdash-i18n/releases/download/cli-vX.Y.Z/lightdash-cli-X.Y.Z.tgz --version
npm install -g https://github.com/winwin-inc/lightdash-i18n/releases/download/cli-vX.Y.Z/lightdash-cli-X.Y.Z.tgz
```

私有库匿名会 404，需要 GitHub 登录权限；不要把 token 写进文档或 CI 明文。这和 `npm install -g @lightdash/cli` 不是一回事，后者仍是官方包。

更新：再下新 tag 的 tgz（或换 URL 里的版本），重复 `npx` + `npm install -g` 即可覆盖。不要装官方 `@lightdash/cli`。

仓库里开发可以不装包：`pnpm -F cli build` 后 `node ./packages/cli/dist/index.js --help`。

## 2. 登录

PAT：Lightdash UI → User settings → Personal access tokens。只放当前 shell，测完 `unset`。不要写进仓库或截图。

```bash
export LIGHTDASH_URL="https://你的站点"
export LIGHTDASH_API_KEY="你的PAT"
# 可选：export LIGHTDASH_PROJECT="项目UUID"
```

也可以 `lightdash login https://你的站点 --token 你的PAT`。环境变量覆盖本地配置。

项目 UUID 从地址栏抄：`https://<站点>/projects/<项目UUID>/...`。

CLI 和服务端版本不一致（例如 `2.1.6` vs `2.1.6-test.4`）时，major 相同一般可继续。

## 3. 同步

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

## 4. CI

```yaml
- run: gh release download "$CLI_RELEASE_TAG" -R winwin-inc/lightdash-i18n -p "lightdash-cli-*.tgz"
- run: npm install -g ./lightdash-cli-*.tgz
- run: lightdash login "$SITE_URL" --token "$LIGHTDASH_PAT"
- run: lightdash lint --path ./lightdash
- run: lightdash upload --project "$PROJECT_UUID" --force
```

`CLI_RELEASE_TAG` 形如 `cli-vX.Y.Z`。`SITE_URL`、`LIGHTDASH_PAT`、`PROJECT_UUID` 用 secret，不要进 git。
