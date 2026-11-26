---
name: release-tagging
description: 打 git tag / 发版时使用。仅在用户明确许可后才能执行；提供版本号同步、CHANGELOG、annotated tag、单 tag 推送与验证的完整步骤，以及误打 tag 的回滚方式。注意任何 tag 推送都会触发 build-docker-with-i18n 镜像构建。
---

# Skill: Tag 与发版（必须先获许可）

配套强制规则：`.agents/rules/release-tags.md`。
**本技能的第一步永远是"确认用户已明确许可"，不要跳过。**

## 步骤 0：确认许可（不通过就停）

用户必须在本轮明确说过"可以打 tag / 推 tag"。没有 → 输出申请（模板见规则文件），等回复。
获得许可后，确认三件事：tag 名、指向的 commit、是否同步版本号。**只做被批准的那一个 tag。**

## 步骤 1：用仓库脚本升版本号（禁止手改）

**不要手写 `node -e` 或逐文件改 `version`**——用脚本，它同时负责文件、commit 与 tag：

```bash
# 主站（根 + 12 个 package.json，跳过 lightdash-* / cli / msy-x-cli）
pnpm bump-version -- 2.8.1            # → commit `chore(release): 升级所有包至 2.8.1` + tag v2.8.1

# msy-x-cli（package.json + src/lib/version.ts 双写）
pnpm bump-msyx -- 0.2.7               # → commit `chore(msy-x-cli): 发布 0.2.7` + tag msyx-v0.2.7

# 独立包（已计划退役）与 dbt CLI，按需
pnpm bump-mcp -- <ver>                # → mcp-v<ver>
pnpm bump-cli -- <ver>                # → cli-v<ver>
```

未获 tag 许可时加 `--no-tag`（四个脚本都支持），只落版本号 + commit。

**脚本的坑（必须知道）：**

-   版本号**已经是目标版本**时，`bump-msyx` / `bump-mcp` / `bump-cli` 只打 tag、**不写文件也不 commit**。所以想留下规范的发版 commit，必须在旧版本号状态下跑；先手改到目标版本再跑只会得到一个 tag。
-   脚本会 `JSON.stringify(pkg, null, 4)` 重写 `package.json`（整文件格式 diff 属预期）。
-   脚本**不写 `CHANGELOG.md`**：正式版仍需人工补 `## vX.Y.Z (YYYY-MM-DD)` 段。
-   `msy-x-cli` 的 `src/lib/version.ts` 必须与 `package.json` 一致（`version.test.ts` 兜底），只有 `bump-msyx` 会同时写两处。

版本号口径（参照 CHANGELOG 顶部说明）：

-   测试验证：`x.y.z-test.N`（N 递增，每次只加一个）
-   正式上线：`x.y.z`（同一次上线只打一个）

`CHANGELOG.md`：正式版把标题写成 `## vX.Y.Z (YYYY-MM-DD)`；测试版可保留"待上线 / 验证 tag"标注。

## 步骤 2：打 annotated tag

**正常情况下步骤 1 的脚本已经打好 tag**（`bump-version` / `bump-msyx` / `bump-mcp` / `bump-cli` 默认都带 tag）。
只有在用脚本 `--no-tag` 落了版本号、之后单独补 tag 时才手打：

```bash
git tag -a v2.8.1 -m "lightdash v2.8.1" <commit-sha>
```

-   必须是 annotated（`-a`），消息沿用历史：`lightdash v<version>` / `msy-x-cli v<version>`
-   **不要**用 `-f` 覆盖已存在/已推送的 tag；需要改指向先问用户
-   tag 落在「版本号提交」上，不要落在合并提交或功能提交上

## 步骤 3：推送（只推这一个）

```bash
git push origin v2.7.9-test.4          # ✅ 单个 tag
# ❌ git push --tags / git push --follow-tags 永远不要用
```

分支推送：`git push origin fix/bugs` 不触发 workflow；**推 `main` 会触发 `test-and-build.yml`，同样需要许可。**

## 步骤 4：验证触发了什么

```bash
gh run list --limit 5        # 有 gh 且已登录时
# 或：观察仓库 Actions 页面
```

预期只多出**一条** `build-docker-with-i18n` run。多出多条说明推了多个 tag，立即报告用户。

## 步骤 5：误打 tag 的回滚（需另行许可）

```bash
git push origin --delete <tag>   # 删远端
git tag -d <tag>                 # 删本地
```

必须明确告知用户：**已触发的 run 与已推送的 registry 镜像不会被撤销**，需要清理镜像要单独处理。

## 反模式（真实踩过的坑）

-   ❌ 一个需求连续打 `-test.1 … -test.4`：4 次镜像构建，全部白跑。
-   ❌ 修完之后"顺手打正式 tag"：正式 tag 等同上线标记，必须用户发起。
-   ❌ 删除 tag 后又重新推同样的 tag 来"恢复"：等于再触发一次构建。
-   ❌ 用了 `git push --follow-tags`，把本地历史 tag 一起推上去。
