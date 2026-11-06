# .agents — Agent 协作规则与技能

本目录约束所有在本仓库工作的编码 agent（主控与子 agent），避免无意义空转与无意义测试。

## rules/（强制规则）

- `testing-discipline.md` — 测试纪律：聚焦测试、命令保险、空转禁止、已知热点（frontend vitest 冷启动极慢）。
- `multi-agent.md` — 多 agent 协作：owns/依赖/验收流程、统一收口清单、公共类型与生成物同步。

## skills/（操作技能）

- `focused-testing/` — 本仓库 frontend vitest 快速通道（单文件/单用例/jsdom 绕过/挂起判定）。

## 生效方式

主控在 CLAUDE.md 中引用本目录；派发子 agent 任务时，将 rules 中相关条目写入任务描述（子 agent 不会自动读取本目录）。
