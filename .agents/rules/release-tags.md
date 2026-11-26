# Tag / 发布纪律（强制）

适用于本仓库所有 agent（主控与子 agent）。**违反本规则视为严重事故**。

## 唯一硬性要求

> **任何 `git tag`、任何 tag 的推送/删除，都必须先得到用户（人类）的明确许可。**
> 未获许可一律不做，包括"顺手""验证一下""只是 test tag"。

用户没在当轮明确说"可以打 tag / 推 tag"，就等于**没有许可**。不要从上下文推断许可，
不要因为"上次允许过"而认为这次也允许。

配套规则：[`k8s-config.md`](./k8s-config.md) —— 镜像版本号由发版/重启流程写入，
**禁止手改 `k8s-config` 里的 `image:` 版本号**（包括为了测试把预发指到新 tag）。

## 为什么（事实）

`.github/workflows/build-docker-with-i18n.yml` 的触发条件是：

```yaml
on:
    push:
        tags: ['*', '!*-alpha*', '!*-beta*', '!mcp-v*', '!cli-v*', '!msyx-v*']
```

即**任何 tag 推送都会触发一次完整的 Docker 镜像构建并推送到 registry**。
后果：

-   每次 tag push = 一条 CI run + 一次镜像构建 + 一次 registry 写入（耗 CI 配额/机器时间）；
-   **删除 tag 不会撤销已触发的 run，也不会回滚已推送的镜像**；
-   连续打多个 test tag = 连续多次构建，代价成倍放大；
-   分支推送不同：只有推 `main` 触发 `test-and-build.yml`，推 `fix/bugs`、`feat/*` 不触发任何 workflow。

## 明确禁止的命令

以下命令在未获许可前**一律禁止**：

```bash
git tag <name>                       # 任何形式，含 -a / -f
git push origin <tag>                # 单个 tag
git push --tags                      # 批量
git push --follow-tags               # 隐式带 tag
git push origin --delete <tag>       # 删远端 tag
git tag -d <tag>                     # 删本地 tag
```

另外：推 `main` 分支同样需要许可（会触发 `test-and-build.yml`）。

## 版本号与 tag 只能走脚本（强制）

升版本号和打 tag **必须**用仓库脚本，禁止手改 `version` 后自己 commit / 自己 `git tag`。

| 脚本 | 作用域 | 写入文件 | 默认产出 |
|---|---|---|---|
| `pnpm bump-version -- <ver>` | 主站（其余所有 workspace） | 根 + 12 个 package.json（跳过 `packages/lightdash-*`、`packages/cli`、`packages/msy-x-cli`） | commit `chore(release): 升级所有包至 <ver>` + tag `v<ver>` |
| `pnpm bump-msyx -- <ver>` | `packages/msy-x-cli` | `package.json` **和** `src/lib/version.ts` | commit `chore(msy-x-cli): 发布 <ver>` + tag `msyx-v<ver>` |
| `pnpm bump-mcp -- <ver>` | `packages/lightdash-mcp`（v1 独立包） | `package.json` | commit + tag `mcp-v<ver>` |
| `pnpm bump-cli -- <ver>` | `packages/cli`（dbt CLI） | `package.json` | commit + tag `cli-v<ver>` |

为什么必须用脚本：

-   **双写点容易漏**：`msy-x-cli` 的版本号同时存在于 `package.json` 与 `src/lib/version.ts`，手改漏一处会让 `version.test.ts` 失败、`msy-x --version` 报错版本；`bump-msyx` 两个都写。
-   **容易漏文件**：主站版本分布在 14 个 `package.json`（含 `packages/frontend/sdk`），手写文件清单必然漏。
-   **commit / tag 文案是约定**：历史 tag 消息形如 `lightdash v<ver>` / `msy-x-cli v<ver>`，手打容易漂。
-   **脚本自带防护**：要求工作区干净、拒绝重复 tag、校验版本号格式。

脚本的坑（真实踩过）：

-   **已是目标版本时脚本只打 tag、不写文件也不 commit**（`bump-msyx` / `bump-mcp` / `bump-cli` 均如此）。所以想要「脚本产的发版 commit」，必须在旧版本号状态下运行；已经手改到目标版本再跑，只会多出一个 tag。
-   脚本会 `JSON.stringify(pkg, null, 4)` 重写 `package.json`，可能带来整文件格式 diff；这是预期行为，不要手工“修”回去。
-   脚本**不写 CHANGELOG**：正式版需要人工补 `## vX.Y.Z (YYYY-MM-DD)` 段。
-   **脚本只会把 tag 打在 HEAD 上**：所以升版本号后不要先追加无关提交/合并，再回来跑脚本补 tag；顺序必须是「合完要发的改动 → bump 脚本（产出 commit + tag）→ 推分支 + 推 tag」。

申请许可时的写法：

-   申请里直接写脚本命令（例如 `pnpm bump-version -- 2.8.1`），并说明它会产生 commit + tag；
-   未获许可时用 `--no-tag`（四个脚本都支持）先只落版本号，不要用“先打 tag 后补流程”的方式。

## 请求许可的模板

需要 tag 时，先只输出下面这段（不要边问边做）：

```
需要打 tag，请确认：
- tag：v2.7.9-test.4（annotated）
- 指向：<commit sha> <commit 标题>
- 原因：<为什么要 tag，谁在等这个镜像>
- 影响：会触发 build-docker-with-i18n 一次镜像构建（约 XX 分钟），并推 registry
- 版本号：package.json 是否需要同步到 <version>（涉及 14 个 package.json + CHANGELOG 标题）
```

等用户回复明确同意后，**只执行被批准的那一个 tag**，不得批量补打、不得"顺便"推历史 tag。

## 自查清单（执行前逐条过）

1. 用户在本轮是否**明确**说了"可以打 tag / 推 tag"？没有 → 停。
2. 这个 tag 名、指向的 commit 是否是用户点头的那个？不是 → 停。
3. 命令里是否有 `--tags` / `--follow-tags` 这类会隐式带出多个 tag 的参数？有 → 换成单个 tag 显式推送。
4. 版本号是否已用 `pnpm bump-version -- <ver>` 同步（14 个 `package.json`）？**`-test.N` 也必须 bump**
   —— tag 与仓库版本必须一致，否则 prerelease 判定失效（预发会去 CDN 找不存在的 `static/<旧版本>`）。
   只有用户当轮明确说"不 bump"才可跳过。

## 已经打错了怎么办

1. 立即停手，向用户报告：打了哪些 tag、是否已推送、触发了哪些 run。
2. **不要**自行删除或补打来"修正"——删 tag 同样需要许可。
3. 用户批准删除后，逐条 `git push origin --delete <tag>` + `git tag -d <tag>`，并说明"已触发的 run 与已推送的镜像不会被撤销"。
