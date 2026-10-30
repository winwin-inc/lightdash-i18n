# Lightdash MCP 强制看板模式（设计稿，未实现）

> **状态：设计定稿，代码未实现。** 本文只描述目标行为、环境变量、权限口径与返回契约；实施另起任务。
>
> 关联阅读：[MCP 看板上下文](../mcp-dashboard-context.md)、[上线流程](./mcp-service-launch.md)、[工具与权限对照](./mcp-tools-permissions.md)、[包 README](../../packages/lightdash-mcp/README.md)。

---

## 1. 背景

部分 dbt 模型的 `sql_filter` 会引用 `lightdash.user.dashboardSlug`。MCP 查数时如果**没有**携带看板上下文，后端会使用默认值 `NA`，`sql_filter` 的第一个分支可能恒为真，导致：

- 返回比看板 UI 更宽的数据（行级类目过滤未生效）；
- 外部客户看到不属于自己的数据。

因此，面向外部客户的 MCP 部署需要一层**强制看板模式**：

- 查询类工具必须解析出 `dashboardUuid` 才能执行；
- 没有可用看板时，明确告诉调用方“必须配置看板 / 申请看板权限”，而不是静默按 `NA` 查询。

> 内部部署（内部平台、分析师自助）不启用该模式，行为保持不变。

---

## 2. 环境变量

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `MCP_DASHBOARD_STRICT` | 否 | `false` | 强制看板模式总开关。**仅外部品牌 CT 部署设为 `true`**；内部不设或 `false` |
| `MCP_DASHBOARD_CONTACT` | 否 | `请联系客服开通看板访问权限。` | 看板无权限时的联系文案，可填电话 / 群 / 邮箱 |
| `LIGHTDASH_PUBLIC_SITE_URL` | 否 | 同 `LIGHTDASH_SITE_URL` | 生成看板链接的浏览器根地址 |

看板链接格式：

```text
{publicBaseUrl}/projects/{projectUuid}/dashboards/{dashboardUuid}/view
```

约束：

- 不把现有前端客服手机号 / 微信号硬编码进 MCP；需要时通过 `MCP_DASHBOARD_CONTACT` 配置。
- 受限用户打开看板链接会进入现有 `NoDashboardPermission` 页面，该页面本身已有客服电话、微信与二维码。

---

## 3. 部署口径

| 部署 | `MCP_DASHBOARD_STRICT` | 行为 |
|------|------------------------|------|
| 线上·外部品牌 CT | `true` | 查询必须带看板上下文；无看板 / 无权限均阻断并提示 |
| 预发·外部品牌 CT | `true` | 同上 |
| 线上·内部 | `false` / 不设 | 保持现有行为，不产生新提示 |
| 预发·内部 | `false` / 不设 | 同上 |

> 强制模式是**部署级**开关，不是角色级开关。外部部署即使有 editor / admin 访问，也按外部口径要求看板上下文；内部管理员请使用内部 MCP 部署。

---

## 4. 权限模型评估（viewer / interactive_viewer）

### 4.1 结论

**主流程不需要在 MCP 里新增角色判断。** 现有权限链路已经覆盖：

- 后端 `client-use` 白名单只对 `viewer` / `interactive_viewer` 生效；其他角色不收窄。
- MCP 现有 `assertExploreQueryable` 已按能力位检查：
  - `viewer` 没有 `runMetricQuery`，`run_metric_query` / `run_semantic_metric_query` 会被拒绝；
  - `interactive_viewer` 可以跑临时指标查询。
- 看板 / 空间 / CASL 权限由后端统一判断，MCP 只需要把 403 映射成用户可读的权限提示。

### 4.2 唯一需要额外处理的地方：反查 0 候选的“权限 vs 配置”消歧

`GET /projects/{projectUuid}/dashboards/context` 返回的是**当前用户可见**的关联看板。反查 0 个时，可能是：

1. 数据集确实没有挂任何看板（配置问题）；
2. 数据集挂了看板，但当前账号没有可见权限（权限问题）。

两种情况的提示不同，因此只在**反查 0 候选时**调用现有诊断接口：

```text
GET /api/v1/user?projectUuid={projectUuid}
→ results.clientUse
```

读取：

- `scopeApplied === true`：当前项目是 client-use 且用户是受限角色（viewer / interactive_viewer）→ 按**权限问题**提示。
- `scopeApplied === false`：非 client-use 或非受限角色 → 按**配置问题**提示。
- 诊断接口失败 / 字段缺失 → 返回“暂时无法确认看板配置或权限，请稍后重试”。

该诊断只在 0 候选路径调用，并缓存 60 秒，正常查询没有额外开销。

### 4.3 角色行为矩阵（强制模式开启时）

| 角色 | 临时指标查询 | Saved Chart / 字段取值 | 反查 0 候选时的提示 |
|------|--------------|------------------------|----------------------|
| `viewer` | 现有能力位已拒绝 | 允许（仍受后端 scope 限制） | `scopeApplied=true` → 权限提示 |
| `interactive_viewer` | 允许（仍受后端 scope 限制） | 允许 | `scopeApplied=true` → 权限提示 |
| `editor` / `developer` / `admin` | 允许 | 允许 | `scopeApplied=false` → 配置提示 |

说明：

- 不在本方案中新增“按角色绕过强制模式”的逻辑；如后续需要，可基于 `clientUse.scopeApplied` 扩展。
- `get_my_access` 继续作为 agent 查看能力位的入口；本方案不新增 `contentScope` 字段。

---

## 5. 三条拒绝路径

| 情况 | 状态 | `action` | 给什么 | 是否执行查询 |
|------|------|----------|--------|--------------|
| 传了 `dashboardUuid`，但当前账号无该看板权限 | `dashboard_permission_required` | `request_dashboard_access` | 看板链接 + `MCP_DASHBOARD_CONTACT` | 否 |
| 未传 `dashboardUuid`，反查 0 候选，且 `scopeApplied=true` | `dashboard_permission_required` | `request_dashboard_access` | 权限提示 + `MCP_DASHBOARD_CONTACT`；无具体看板链接 | 否 |
| 未传 `dashboardUuid`，反查 0 候选，且 `scopeApplied=false` | `dashboard_configuration_required` | `configure_dashboard` | “必须配置看板；无看板 ID 的数据集对外客户不能正常使用” | 否 |

这样 agent 不会把“没权限”误判成“没配置看板”，也不会把“没配置看板”误判成“申请权限”。

---

## 6. 解析顺序

仅在 `MCP_DASHBOARD_STRICT=true` 时生效。

### 6.1 显式 `dashboardUuid`

1. 调 `GET /api/v1/dashboards/{dashboardUuid}` 校验。
2. 成功 → 使用后端返回的 `uuid` / `slug` / `name`，生成 `dashboardUrl`。
3. `403` → `dashboard_permission_required`，返回链接 + `MCP_DASHBOARD_CONTACT`，**不执行查询**。
4. `404` → `dashboard_not_found`，返回链接 + 提示确认 UUID / 权限，**不执行查询**。
5. 其他错误 → `dashboard_context_unavailable`，**不执行查询**。

### 6.2 未显式传

1. 临时指标查询 / 字段取值先做现有 `assertExploreQueryable`；`run_saved_chart` 先读取图表元数据。未知表 / 无临时查询权限 / 图表不存在仍走现有提示。
2. 再按 `exploreName` 或 `chartUuid` 反查 `/dashboards/context`。
3. 候选数量：
   - **0 个** → 调 `GET /api/v1/user?projectUuid=` 读取 `clientUse`：
     - `scopeApplied=true` → `dashboard_permission_required`（权限提示，无具体看板链接）；
     - `scopeApplied=false` → `dashboard_configuration_required`（必须配置看板）；
     - 诊断失败 → `dashboard_context_unavailable`（稍后重试 / 联系客服）。
   - **1 个** → 自动使用，`source=uniqueExploreContext / uniqueChartContext`，返回 `dashboardUrl` 和“对外查询建议显式传 dashboardUuid”提示。
   - **≥2 个** → `dashboard_selection_required`，候选含 `dashboardUuid / dashboardSlug / dashboardName / dashboardUrl`，**不执行查询**。

### 6.3 工具范围

**纳入强制模式：**

- `run_metric_query`
- `run_semantic_metric_query`
- `run_saved_chart`
- `search_field_values`
- `run_dashboard_tiles`（自带 `dashboardUuid`，只把 403 / 404 转成友好结果）

**不变：**

- `list_charts`、`get_dashboard_tiles`、`get_dashboard_code` 等元数据工具；
- 所有非查询工具；
- 开关关闭时的全部现有行为。

### 6.4 `search_field_values` 安全回退

强制模式下：

- 主接口 `POST /projects/:projectUuid/field/:fieldId/search` 必须带解析后的 `dashboardUuid`；
- 回退到 metric-query 时，`runMetricQueryUntilReady` 必须带同一个 `dashboardUuid`；
- **禁用 SQL DISTINCT 回退**：裸 SQL 无法应用 dbt `sql_filter`；
- 非强制模式保持现有回退链不变。

### 6.5 防御性错误映射

查询执行阶段如果后端仍返回包含 `dashboard` 的 403（权限在预检后变化、跨项目看板等），也转成 `dashboard_permission_required`，附看板链接与联系文案；其他错误保持现有格式化逻辑。

---

## 7. 返回契约

阻断类结果同时返回 `content`（格式化 JSON 文本）和 `structuredContent`，并设置 `isError: true`；多候选选择结果不算错误。每个阻断结果带 `action` 字段。

### 7.1 有看板 ID，但无权限

```json
{
  "status": "dashboard_permission_required",
  "action": "request_dashboard_access",
  "message": "您没有该看板的访问权限。",
  "dashboardUuid": "...",
  "dashboardUrl": "https://x.brandct.com/projects/.../dashboards/.../view",
  "contact": "请联系客服开通看板访问权限。",
  "hint": "请将看板链接提供给客服申请开通；开通后用同一 dashboardUuid 重试。",
  "detail": "后端 403 原始信息"
}
```

### 7.2 受限用户，反查 0 个可见看板

```json
{
  "status": "dashboard_permission_required",
  "action": "request_dashboard_access",
  "message": "当前账号没有可见的关联看板权限。",
  "dashboardUuid": null,
  "dashboardUrl": null,
  "contact": "请联系客服开通看板访问权限。",
  "scope": { "applied": true, "status": "rpc_empty", "projectRole": "viewer" },
  "hint": "请联系客服检查看板授权；若该数据集确实未配置看板，请管理员配置看板。"
}
```

### 7.3 非受限用户 / 非 client-use，反查 0 个关联看板

```json
{
  "status": "dashboard_configuration_required",
  "action": "configure_dashboard",
  "message": "该数据集未配置看板。必须配置看板；无看板 ID 的数据集对外客户不能正常使用。",
  "source": "exploreName | chartUuid | none",
  "exploreName": "可选",
  "chartUuid": "可选",
  "hint": "请联系管理员在 admin 后台登记看板并授权该数据集，或在调用时显式传入已授权的 dashboardUuid。",
  "note": "该限制仅在 MCP_DASHBOARD_STRICT=true 时生效。"
}
```

### 7.4 反查到多个看板，需要选择

```json
{
  "status": "dashboard_selection_required",
  "action": "select_dashboard",
  "message": "未提供 dashboardUuid，且该数据集关联多个看板。请选择后重试。",
  "source": "exploreName | chartUuid",
  "candidateCount": 2,
  "candidates": [
    {
      "dashboardUuid": "...",
      "dashboardSlug": "...",
      "dashboardName": "...",
      "dashboardUrl": "..."
    }
  ],
  "hint": "对外查询建议每次显式传 dashboardUuid 以固定行级口径。"
}
```

### 7.5 其他状态

- `dashboard_not_found` → `action: "verify_dashboard_uuid"`，带 `dashboardUrl`。
- `dashboard_context_unavailable` → `action: "retry_later"`，可带 `dashboardUrl`；用于显式看板校验失败或 0 候选诊断失败。

---

## 8. 验收场景

| 场景 | `MCP_DASHBOARD_STRICT` | 期望 |
|------|------------------------|------|
| 不带 `dashboardUuid` 查普通数据集 | `false` | 行为与现在完全一致，无新提示 |
| 显式有效 `dashboardUuid` | `true` | 查询成功，`resolvedDashboardContext.dashboardWebUrl` 存在 |
| 显式无权限 `dashboardUuid` | `true` | `dashboard_permission_required`，含链接 / contact，无查询 |
| 未传、反查唯一 | `true` | 自动使用并提示显式传 UUID |
| 未传、反查多个 | `true` | `dashboard_selection_required` + 候选链接，无查询 |
| 未传、反查 0 个，受限用户 | `true` | `dashboard_permission_required`，提示检查看板授权，无查询 |
| 未传、反查 0 个，非受限用户 | `true` | `dashboard_configuration_required`，文案包含“必须配置看板；无看板 ID 的数据集对外客户不能正常使用”，无查询 |
| `search_field_values` 同上场景 | `true` | 同样阻断 / 放行，且不回退裸 SQL |
| `run_saved_chart` 图表未挂看板 | `true` | 按角色走权限提示或配置提示 |
| `run_dashboard_tiles` 无权限看板 | `true` | `dashboard_permission_required` |
| `GET /health` | 任意 | 返回 `dashboardStrict` 布尔值 |

---

## 9. 实施映射（代码，未实现）

| 位置 | 计划改动 |
|------|----------|
| `packages/lightdash-mcp/src/config.ts` | 新增 `dashboardStrict: boolean`、`dashboardContact: string`；解析 `MCP_DASHBOARD_STRICT` / `MCP_DASHBOARD_CONTACT` |
| `packages/lightdash-mcp/src/http.ts` | 启动日志与 `/health` 输出 `dashboardStrict` |
| `packages/lightdash-mcp/src/rest/requestBase.ts` | 新增 `LightdashApiError`（`status`、`detail`），保持现有 message 格式；导出 `isDashboardAccessError` |
| `packages/lightdash-mcp/src/rest/endpoints.ts` | 新增 `getAuthenticatedUserWithProject(apiKey, projectUuid)` → `GET /api/v1/user?projectUuid=`，读取 `clientUse` |
| `packages/lightdash-mcp/src/lib/contentWebUrls.ts` | 导出 `buildDashboardWebUrl(...)` |
| 新增 `packages/lightdash-mcp/src/lib/requiredDashboardContext.ts` | 显式校验、反查、0 候选消歧、状态映射、阻断结果构造；`clientUse` 诊断缓存 60s |
| `packages/lightdash-mcp/src/lib/dashboardContextResolver.ts` | 让选择结果支持候选携带 `dashboardUrl` 和自定义 `hint` |
| `packages/lightdash-mcp/src/mcp/tools/registerQueryTools.ts` | 接入 `run_metric_query`、`run_semantic_metric_query`、`search_field_values` |
| `packages/lightdash-mcp/src/mcp/registerExtensionTools.ts` | 接入 `run_saved_chart`、`run_dashboard_tiles` |
| 工具描述 / `mcpDocsContent.ts` | 说明强制模式、三条拒绝路径、角色差异与 `dashboard_*` 状态 |
| 测试 | 新增 config 与 guard 测试；覆盖 `scopeApplied=true/false` 的 0 候选消歧；更新 3 处手工构造 `LightdashMcpEnvConfig` 的测试夹具；加入 `package.json` test 脚本 |

---

## 10. 发布与回滚

- 本文档阶段不产生运行时变更。
- 代码实施后：仅外部品牌 CT 部署设置 `MCP_DASHBOARD_STRICT=true`；内部保持关闭。
- 回滚只需把 `MCP_DASHBOARD_STRICT` 设为 `false`，无数据迁移、无 backend / frontend 回滚。
- 版本按现有 `pnpm bump-mcp -- x.y.z` + `mcp-v*` tag 流程发布。

---

## 11. 假设与默认值

1. **仅外部强制**：所有新提示与阻断只在 `MCP_DASHBOARD_STRICT=true` 时出现；内部部署完全不变。
2. **主流程不新增角色判断**：viewer / interactive_viewer 的工具能力继续由现有 `assertExploreQueryable` 和后端 403 负责；只在反查 0 候选时读取 `clientUse.scopeApplied` 做“权限 vs 配置”消歧。
3. **三条拒绝路径必须区分**：无权限 → 看板链接 + 客服文案；受限用户无可见看板 → 权限提示；未配置看板 → “必须配置看板”提示。
4. **允许反查兜底**：显式优先，唯一自动用，多候选必须选择，0 个拒绝；不强制调用方必须显式传 UUID，但结果中始终提示显式传参。
5. **联系文案通用化**：默认“请联系客服开通看板访问权限。”；如需电话 / 微信，通过 `MCP_DASHBOARD_CONTACT` 配置。
6. **看板链接复用现有无权限页**：受限用户打开链接会看到 `NoDashboardPermission` 页面，页面本身已有客服信息。
7. **阻断结果 `isError: true`**：避免 agent 把“无权限 / 未配置看板”误当成空数据继续推理；多候选选择仍为正常结果。
8. **不新增 MCP 工具**，不改变 `tools/list` 的工具集合；只扩展查询类工具的返回状态。
