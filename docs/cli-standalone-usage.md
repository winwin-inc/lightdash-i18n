# 本仓 CLI 使用流程

看板跨环境同步只用本仓 CLI，不要用官方 `npx @lightdash/cli`。当前已发版：**2.1.7**。YAML / 权限见 [dashboard-sync-current-cli-usage.md](./dashboard-sync-current-cli-usage.md)。

## 最小使用

```bash
# 1. 装（空目录，不要在本仓库根目录跑 npx）
npm install -g https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz
lightdash --version   # 应为 2.1.7

# 2. 登录（PAT：UI → User settings → Personal access tokens；测完 unset）
export LIGHTDASH_URL="https://x.pre.banmahui.cn"   # 必须已部署 /code/*，不要用还是 2.1.3 的 lightdash.pre
export LIGHTDASH_API_KEY="你的PAT"
# 项目 UUID 从地址栏抄：https://<站点>/projects/<项目UUID>/...

# 3. 拉 + 校验
lightdash download --project <项目UUID> --path ./sync-out
# 或只拉一块看板（会带 saved chart 和同 slug 的 SQL 图）
# lightdash download --project <项目UUID> -d <看板slug> --path ./sync-out
lightdash lint --path ./sync-out

# 4. 要上传时：先预发、先一条
# lightdash upload --project <目标项目UUID> -d <看板slug> --include-charts --force --path ./sync-out

# 5. 升级：换版本号再装一遍，不用卸载
# npm install -g https://img0.banmahui.cn/msy-x/cli/X.Y.Z/lightdash-cli-X.Y.Z.tgz
```

不要 `npm install -g @lightdash/cli`，也不要 `npm update -g @lightdash/cli`。`lightdash deploy` 仍用 ACR 镜像，和这个 tgz 无关。

---

## 安装补充

命令名是 `lightdash`，全局装会覆盖本机官方 CLI，只在同步机或 CI 里装。CDN 与前端同一套 `CDN_BASE_URL`（`https://img0.banmahui.cn`）。必须是 `.tgz`，源码 zip 不行。路径带版本，没有 `latest`。

```bash
npx --yes https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz --version
npx --yes https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz lint --help
```

可选校验：

```bash
curl -fsSL -o lightdash-cli-2.1.7.tgz \
  https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz
sha256sum lightdash-cli-2.1.7.tgz
# 对照 https://img0.banmahui.cn/msy-x/cli/2.1.7/lightdash-cli-2.1.7.tgz.sha256
```

备份（要仓库权限）：`gh release list -R winwin-inc/lightdash-i18n --limit 20`，再 `gh release download cli-v2.1.7 -p "lightdash-cli-*.tgz"`。不要用不带 tag 的 `gh release download`。仓库里开发：`pnpm -F cli build` 后 `node ./packages/cli/dist/index.js --help`。

也可以 `lightdash login https://你的站点 --token 你的PAT`。环境变量覆盖本地配置。CLI 和服务端版本不完全一致（如 `2.1.7` vs `2.1.6-test.4`）时，major 相同一般可继续。

## 更新与发版

升级换 URL 里的版本号再 `npm install -g`。新版本号看发版说明，或 `gh release list -R winwin-inc/lightdash-i18n --limit 20`。

维护者发新版本：

1. `pnpm bump-cli -- X.Y.Z`
2. `git push && git push origin cli-vX.Y.Z`，等 `build-docker-cli` 打 tgz、挂 GitHub Release、传到 `msy-x/cli/X.Y.Z/`
3. `npx --yes https://img0.banmahui.cn/msy-x/cli/X.Y.Z/lightdash-cli-X.Y.Z.tgz --version`
4. 通知使用方换 URL 再装

同版本不覆盖，修包必须 bump 新号。已发包装 CDN：`scripts/upload-cli-tgz-to-cdn.sh` 或重跑对应 `cli-v*` workflow。

## 同步补充

默认写到 `lightdash/`（spaces / charts / dashboards）。冒烟够用 download + lint。不要一上来对生产全量 `upload --force`。

- `-c <图表slug>`：只拉指定图
- `--language-map`：顺便生成语言映射
- 全量 `upload --project <目标UUID> --path ./sync-out --force`
- `--skip-space-create`：目标没有对应 space 时跳过创建
- `-d` 对不上的 slug 会警告并跳过。全量 download 会拉全部 SQL 图
- **先有图，再有看板。** 只传看板、本地没有 YAML、或漏了 `--include-charts`，目标可能空 tile
- `--include-charts` 只在带 `-d` 传看板时需要；全量 upload 会处理目录里的 charts（含 `*.sql.yml`）
- `--force` 用于目标是空的或要覆盖远端。跨环境建议加上
- spaces 失败会警告并跳过。权限：Editor 可 download / upload；Viewer 不行。后端必须已部署 `/code/*`

跨环境：

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

## CI

```yaml
- run: npm install -g https://img0.banmahui.cn/msy-x/cli/${CLI_VERSION}/lightdash-cli-${CLI_VERSION}.tgz
- run: lightdash login "$SITE_URL" --token "$LIGHTDASH_PAT"
- run: lightdash lint --path ./lightdash
- run: lightdash upload --project "$PROJECT_UUID" --force
```

`CLI_VERSION` 当前用 `2.1.7`。`SITE_URL`、`LIGHTDASH_PAT`、`PROJECT_UUID` 用 secret，不要进 git。
