# .agents — Agent 协作规则与技能

本目录约束所有在本仓库工作的编码 agent（主控与子 agent），避免无意义空转与无意义测试。

## rules/（强制规则）

- `testing-discipline.md` — 测试纪律：聚焦测试、命令保险、空转禁止、已知热点（frontend vitest 冷启动极慢）。
- `multi-agent.md` — 多 agent 协作：owns/依赖/验收流程、统一收口清单、公共类型与生成物同步。
- `branching.md` — 分支模型：fix/bugs 只承接 bug 修复；功能走 feat/xx → dev（或 pre/main）；功能分支不合入 release。
- `commits.md` — 提交信息规范：标题 `type(scope): 摘要` ≤ 50 字符（硬上限 72），细节写正文；禁止把细节塞进标题。
- `release-tags.md` — **Tag 纪律（强制）**：任何 `git tag`、tag 推送/删除、推 `main` 都必须先得到用户明确许可；tag push 会触发镜像构建，删 tag 不会撤销已触发的 run 或已推送的镜像。
- `k8s-config.md` — **k8s 配置纪律（强制）**：禁止修改 `k8s-config` 里任何 `image:` 版本号（发版/重启流程自动写入）；只改 ConfigMap env / Secret / 路由，改完靠 `rollout restart` 生效。

## skills/（操作技能）

- `focused-testing/` — 本仓库 frontend vitest 快速通道（单文件/单用例/jsdom 绕过/挂起判定）。
- `release-tagging/` — 打 tag / 发版操作步骤（版本号同步、CHANGELOG、annotated tag、单 tag 推送、误打回滚）；**必须先获用户许可**。

## 生效方式

主控在 CLAUDE.md 中引用本目录；派发子 agent 任务时，将 rules 中相关条目写入任务描述（子 agent 不会自动读取本目录）。
