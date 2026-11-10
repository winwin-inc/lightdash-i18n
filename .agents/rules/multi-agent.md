# 多 Agent 协作规则（herd）

## 派发

1. 写任务必须给 `owns=`（项目相对路径，精确到文件）；report-only 任务省略 owns。
2. 有类型/接口依赖的下游任务用 `after=` 挂依赖，依赖完成并经验收后自动启动。
3. **验证策略在派发时写明**：默认"worker 只做代码自查，批量验证由主控统一收口"。不要依赖事后补发消息（排队中的 worker 收不到）。
4. i18n、生成物（OpenAPI/schema）等小而独立的任务派 `coder-fast`；核心逻辑派 `coder`；验收前审查派 `reviewer`（只读）。

## 验收（parent 职责）

1. 完成 ≠ 验收。先读 artifact，再抽样核对 diff 与测试证据，然后 `herd accept`。
2. 统一收口在**全部写任务验收后**执行一次：目标测试（改动文件）→ 定向 lint（改动文件）→ typecheck（common/frontend）→ 生成物同步（如动了 common 类型，跑 `pnpm generate-api` 与 chart-as-code schema 生成）。
3. 独立审查（reviewer）针对功能 diff 做一次，要求按 blocker/major/minor/nit 分级输出；blocker（如会打红 CI 的既有测试）必须在收尾前修复。

## 修改公共类型后必查

- `packages/common/src/types/*` 新增字段 → `pnpm generate-api`（swagger/routes）+ `pnpm -F common generate:chart-as-code-schema`，生成物随 PR 一起提交。
- 检索该字段所有引用点（dashboard / AI copilot / CLI），确认可选字段不破坏消费方。

## 组件改动连带检查

- 给既有组件新增 context/hook 依赖时，必须检查其**既有测试文件**（renderWithProviders 不一定提供所需 Provider），同步补 mock，否则 CI 红。这是本次实践中的真实教训。
