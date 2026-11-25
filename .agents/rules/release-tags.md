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
4. 是否需要同步版本号（14 个 `package.json` + `CHANGELOG.md`）？用户没说同步就不要改版本号。

## 已经打错了怎么办

1. 立即停手，向用户报告：打了哪些 tag、是否已推送、触发了哪些 run。
2. **不要**自行删除或补打来"修正"——删 tag 同样需要许可。
3. 用户批准删除后，逐条 `git push origin --delete <tag>` + `git tag -d <tag>`，并说明"已触发的 run 与已推送的镜像不会被撤销"。
