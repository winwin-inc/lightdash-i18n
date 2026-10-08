# 操作日志 + 使用分析 Export CSV i18n 方案

> 状态：已定稿待开发（本文档先于代码）。  
> 分支建议：与 `fix/bugs` 上的 **筛选器 tileTargets 回填** 分开发版；回填已完成，单独上线。  
> 范围：  
> - **B. 项目操作日志**（主需求，含 DB migration、表格展示、清除接口）  
> - **A. 使用分析 Export CSV 按钮 i18n**（小修复，细节见文末）

---

## 0. 与筛选器回填的边界

| 事项 | 状态 | 发版 |
|---|---|---|
| 看板筛选器 `tileTargets` 回填 | 已在 `fix/bugs` 改完（本地） | **单独上线**，不纳入本文开发批次 |
| Export CSV i18n（A） | 未做 | 可与操作日志同迭代，或先行小 PR |
| 操作日志（B） | 未做 | 按本文分阶段实现 |

---

## 1. 操作日志（B）目标

解决看板等资源被误改后「不知道谁动的」：记录 **谁 / 何时 / 对什么 / 做了什么**，管理员可查、可按保留策略清理。

- 数据进 **数据库**（不依赖 Usage Analytics / 前端埋点）
- **仅管理员**可查看与清除
- 入口在 **`generalSettings` → 项目管理 → 某项目** 下独立导航「操作日志」，与「使用分析」并列
- 列表用 **表格** 展示（对齐现有设置页列表风格）

---

## 2. 数据模型与 Migration

### 2.1 表名

`project_operation_logs`（项目级操作日志）

### 2.2 字段设计

| 列 | 类型 | 说明 |
|---|---|---|
| `operation_log_id` | bigserial PK | 自增主键 |
| `operation_log_uuid` | uuid UNIQUE NOT NULL | 对外 ID |
| `organization_uuid` | uuid NOT NULL | 组织 |
| `project_uuid` | uuid NOT NULL | 项目（列表与清除按项目隔离） |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 操作时间 |
| `actor_user_uuid` | uuid NULL | 操作人稳定 ID；用户删除后可空 |
| `actor_email` | text NULL | 邮箱快照 |
| `actor_name` | text NULL | 姓名快照（展示名；可 first+last 拼） |
| `action` | text NOT NULL | 动作枚举，见 §3 |
| `resource_type` | text NOT NULL | 如 `dashboard` / `saved_chart` / `space` / `project_member` / `operation_log` |
| `resource_uuid` | uuid NULL | 资源 UUID |
| `resource_name` | text NULL | 当时名称快照 |
| `status` | text NOT NULL DEFAULT `'success'` | `success` / `failure` |
| `summary` | jsonb NULL | 人读友好摘要结构，见 §3.2 |
| `request_id` | text NULL | 可选，关联请求 |
| `ip` | text NULL | 可选 |
| `user_agent` | text NULL | 可选 |

**操作人存储原则（已拍板）**

- 库内 **分列**：`actor_user_uuid` + `actor_email` + `actor_name`，不要只存邮箱，也不要把姓名邮箱合成唯一存储字段。
- UI 表格 **一列「操作人」**：展示为 `姓名（email@x.com）`；姓名空则只显示邮箱；都空则显示「系统/未知」。

### 2.3 索引

- `(project_uuid, created_at DESC)` — 列表主查询  
- `(project_uuid, action, created_at DESC)` — 按动作筛  
- `(project_uuid, actor_user_uuid, created_at DESC)` — 按人筛  
- `(project_uuid, resource_type, resource_uuid)` — 按资源追查  
- `(created_at)` — 按时间清除  

### 2.4 Migration 文件（开发时新增）

路径：`packages/backend/src/database/migrations/`  
命名示例：`YYYYMMDDHHMMSS_create_project_operation_logs_table.ts`  

风格对齐现有 migration（Knex + 必要时 `SET lock_timeout`）：

```ts
// 示意：实际上线时按仓库最新时间戳命名
import { Knex } from 'knex';

const TABLE = 'project_operation_logs';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    const exists = await knex.schema.hasTable(TABLE);
    if (!exists) {
        await knex.schema.createTable(TABLE, (table) => {
            table.bigIncrements('operation_log_id').primary();
            table.uuid('operation_log_uuid').notNullable().defaultTo(knex.raw('uuid_generate_v4()')).unique();
            table.uuid('organization_uuid').notNullable().index();
            table.uuid('project_uuid').notNullable();
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.uuid('actor_user_uuid').nullable().index();
            table.text('actor_email').nullable();
            table.text('actor_name').nullable();
            table.text('action').notNullable();
            table.text('resource_type').notNullable();
            table.uuid('resource_uuid').nullable();
            table.text('resource_name').nullable();
            table.text('status').notNullable().defaultTo('success');
            table.jsonb('summary').nullable();
            table.text('request_id').nullable();
            table.text('ip').nullable();
            table.text('user_agent').nullable();

            table.index(['project_uuid', 'created_at']);
            table.index(['project_uuid', 'action', 'created_at']);
            table.index(['project_uuid', 'actor_user_uuid', 'created_at']);
            table.index(['project_uuid', 'resource_type', 'resource_uuid']);
            table.index(['created_at']);
        });
    }
    await knex.raw(`RESET lock_timeout`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    await knex.schema.dropTableIfExists(TABLE);
    await knex.raw(`RESET lock_timeout`);
}
```

说明：若环境未启用 `uuid_generate_v4()`，改用应用层 `uuid` 写入或项目既有 uuid 默认值方式（实现时对照其它表）。

配套：

- Entity：`packages/backend/src/database/entities/projectOperationLogs.ts`
- Model/Service：写日志、分页查询、按 `beforeDays` 删除

---

## 3. 动作枚举（P0 / P1）

### 3.1 P0 — 看板（第一期必做）

| action | 说明 |
|---|---|
| `dashboard.created` | 创建看板 |
| `dashboard.updated` | 通用更新（改名、描述等）；若能拆细则优先用下面细动作 |
| `dashboard.deleted` | 删除看板 |
| `dashboard.duplicated` | 复制看板 |
| `dashboard.moved` | 移动空间 |
| `dashboard.tiles.copied` | 复制图表 tile |
| `dashboard.tiles.layout_updated` | 布局 / Tab 保存 |
| `dashboard.filters.created` | 新增筛选器 |
| `dashboard.filters.updated` | 修改筛选器取值/运算符等 |
| `dashboard.filters.deleted` | 删除筛选器 |
| `dashboard.filters.tile_targets_updated` | 绑定 / 取消绑定图表（图表区块） |

### 3.2 summary JSON 示例

```json
{
  "filterId": "...",
  "filterLabel": "一级类目",
  "tileUuid": "...",
  "tileTitle": "Copy of TOP15集团销售额趋势图",
  "bound": true,
  "fieldId": "折线图_集团_一级类目"
}
```

复制 tile：

```json
{
  "sourceTileUuid": "...",
  "newTileUuid": "...",
  "chartName": "TOP15集团销售额趋势图"
}
```

### 3.3 P1 — 其它核心（第二期）

- 已保存图表：`saved_chart.created|updated|deleted|duplicated|moved`
- 空间：`space.created|updated|deleted|access_updated`
- 项目成员：`project_member.role_updated|added|removed`
- 日志自身：`operation_log.purged`（执行清除时写入，且该条不受本次清除影响或延迟保留）

### 3.4 明确不记

- 纯浏览看板 / 图表  
- 未保存的临时筛选  
- 每次 query 跑数（与 User Activity 重叠且量大）

---

## 4. 写入方式

- 在 **后端 service 成功提交后** 写日志（DashboardService / ChartService 等），禁止只靠前端点击埋点。  
- 封装 `OperationLogService.record({ projectUuid, actor, action, resource, summary, status })`。  
- 写日志失败：**打 error 日志，不回滚主业务**（审计从属，避免拖垮保存）。  
- 可复用/对齐 `packages/backend/src/logging/auditLog.ts` 的 actor/resource 概念，但 **落库用本表**，不要只打 stdout。

---

## 5. API

### 5.1 列表（表格数据）

`GET /api/v1/projects/:projectUuid/operation-logs`

Query：

- `page` / `pageSize`（默认 20，最大 100）  
- `from` / `to`（ISO 时间，可选）  
- `action`（可选，可多值）  
- `actorUserUuid` / `actorEmail`（可选）  
- `resourceType` / `resourceUuid`（可选）  
- `q`（可选，搜 resource_name / actor_email / actor_name）

响应：分页 + rows（含合成展示用的 `actorDisplay` 可由后端拼好或前端拼）。

权限：`ability.can('manage', 'Project')` 或组织 Admin（实现时与现有 CASL 对齐；**Viewer/Editor 不可见**）。

### 5.2 详情（可选）

`GET /api/v1/projects/:projectUuid/operation-logs/:operationLogUuid`  
返回完整 `summary`。

### 5.3 清除

`DELETE /api/v1/projects/:projectUuid/operation-logs`

Body 或 Query：

- `beforeDays`: number（例如 90）  
  或 `before`: ISO 日期  

约束：

- `beforeDays` **≥ 最小保留天数**（建议默认最小 **30**；配置项可调）  
- 仅删除该 `project_uuid` 下 `created_at < cutoff` 的行  
- 成功后写入一条 `operation_log.purged`（summary 含删除条数、cutoff）  
- 需二次确认（前端 Modal）；权限建议组织 Admin 或项目管理员（产品可定为仅组织 Admin）

---

## 6. 前端：表格展示与入口

### 6.1 路由与导航

- 路由：`/generalSettings/projectManagement/:projectUuid/operationLogs`  
- `ProjectSettings.tsx` 增加 path  
- `Settings.tsx` 侧栏在「使用分析」附近增加「操作日志」导航（i18n key）  
- **不要**挂在 `SettingsUsageAnalytics` 卡片列表里

### 6.2 页面结构（表格）

参考：`UserActivity`、项目成员、调度相关列表。

顶部筛选：

- 时间范围  
- 动作（多选）  
- 操作人（邮箱/姓名搜索）  
- 资源类型  

主区：**Mantine Table**（或项目现有 Table 组件）

| 时间 | 操作人 | 动作 | 资源类型 | 资源名称 | 状态 | 操作 |
|---|---|---|---|---|---|---|
| … | 张三（a@x.com） | 绑定筛选器 | 看板 | xxx | 成功 | 详情 |

- 「操作人」一列合成展示  
- 「详情」打开 Drawer/Modal 看 `summary` JSON 的可读渲染  
- 页头提供「清理日志」按钮 → 输入保留天数 / 确认 → 调清除 API  

### 6.3 权限 UI

无权限用户：隐藏导航；直链进入显示无权限态（与 Usage Analytics / `view Analytics` 类似，但能力点用 Project manage / Admin）。

---

## 7. 实现分期

### 第一期（可上线最小集）

1. Migration + Entity + OperationLogService  
2. 看板 P0 动作写入钩子  
3. 列表 API + 设置页表格 UI + 管理员权限  
4. 清除 API + 确认弹窗 + `operation_log.purged`  
5. （可选同 PR 或紧随）A. Export CSV i18n  

### 第二期

- P1 图表 / 空间 / 成员  
- 定时保留任务（可选）  
- CSV 导出操作日志（可选）  

---

## 8. A. 使用分析 Export CSV i18n（补充细节）

### 8.1 问题

`packages/frontend/src/pages/UserActivity.tsx`：

- Tooltip 已：`t('pages_user_activity.export_csv_tooltip')`  
- 按钮正文硬编码：`Exporting...` / `Export CSV`  

中文环境按钮仍为英文。

### 8.2 改法

1. 增加 key（名称以现有 locale 文件结构为准）：  
   - `pages_user_activity.export_csv` → 中文「导出 CSV」 / 英文 `Export CSV`  
   - `pages_user_activity.exporting_csv` → 中文「导出中…」 / 英文 `Exporting...`  
2. 按钮改为：

```tsx
{isDownloadingCsv
  ? t('pages_user_activity.exporting_csv')
  : t('pages_user_activity.export_csv')}
```

3. 同步补齐项目使用的中英文（及若有的其它）locale。  
4. **本阶段不强制**改 CSV 文件内列头语言；若产品需要，另开「导出列头 i18n」任务（后端按语言或固定中英列名）。

### 8.3 验收

- 中文 UI 下按钮为「导出 CSV」/「导出中…」  
- 英文 UI 保持 Export CSV / Exporting...  
- Tooltip 与按钮语言一致  

---

## 9. 开发检查清单

**Migration / 后端**

- [ ] 新增 `project_operation_logs` migration（up/down）  
- [ ] Entity + Service（record / list / purge）  
- [ ] 看板 P0 写钩子  
- [ ] 列表 / 清除 API + 权限  
- [ ] 清除后写 `operation_log.purged`  

**前端**

- [ ] 设置导航 + 路由  
- [ ] 操作日志表格页 + 筛选 + 详情 + 清理弹窗  
- [ ] i18n（导航、表头、动作文案、空态）  
- [ ] Export CSV 按钮 i18n（A）  

**发版**

- [ ] 筛选器回填单独上线  
- [ ] 本文功能独立 PR / 独立验证  

---

## 10. 开放决策（实现前默认值）

| 项 | 默认 |
|---|---|
| 谁可看日志 | 组织 Admin + 能 manage Project 的项目管理员 |
| 谁可清除 | 同上，或收紧为仅组织 Admin（实现前产品可再定） |
| 最小保留天数 | 30 |
| 默认清除建议值 | 90 天之前 |
| 写日志失败 | 不阻断主流程 |

---

## 11. 下一步

1. 评审本文档（尤其动作枚举与权限默认值）  
2. 开发第一期：migration → 写入 → 表格页 → 清除 →（顺手）Export CSV i18n  
3. 筛选器回填继续走自己的上线流程，不阻塞本文


---

## 10. 下一期规划：语义化操作日志（前端埋点 + 后端落库）

> 状态：待评审 / 待执行  
> 背景：一期后端 JSON diff 能证明「保存时有变化」，但缺少操作入口与业务语义（全局 vs Tab、绑定层级、Tab 下配置等），审计价值不足。

### 10.1 目标

把「看板操作日志」做成**可读、可筛、能回答业务问题**的审计：

- 能区分 **全局筛选** vs **Tab 筛选**
- 单个筛选器的设置变更可细分（绑定层级 / 日期约束 / tile 勾选 / 取值配置等）
- Tab 增删改及 Tab 下关联配置可追踪
- 列表展示中文语义，详情可看 before/after

### 10.2 现有后端记录还要不要？

**结论：要保留，但收缩职责；不要整段删掉。**

| 类别 | 建议 | 原因 |
|---|---|---|
| 看板创建 / 复制 / 删除 / 移动空间 | **保留（后端）** | 生命周期事件，前端埋点容易漏；后端最稳 |
| 未带前端事件的版本保存兜底 | **保留精简版后端 diff** | API/脚本/旧客户端改看板时仍有痕迹 |
| 筛选器细粒度（一期 diff 出的 filters.* / tile_targets.*） | **下一期由前端语义事件主导**；后端同类粗 diff **可降级或关掉**，避免一条保存刷出一堆难读记录 | 否则双写重复、列表噪音大 |
| tiles 布局粗 diff | **短期保留**；有前端 tile 事件后再降级 | 布局拖拽未必逐步上报 |
| parameters / config 粗 diff | **保留**（含 tabFilterEnabled、全局/Tab 开关）直到前端补齐 | 配置变更仍有价值 |

原则：

1. **权威落库仍在后端表** `project_operation_logs`（权限、保留策略、清理不变）
2. **语义以前端事件为准**（带 `scope` / `tabUuid` / `changeKind`）
3. **后端 diff 是兜底与生命周期**，不是主叙事

### 10.3 推荐架构（协同）

```
筛选器设置 UI / Tab 设置 UI
    │  产生语义事件 clientEvents[]
    ▼
看板保存 API（update versioned）
    │  body 增加 optional clientEvents
    ▼
DashboardService.update
    ├─ 优先：逐条校验并写入 clientEvents → operation_logs
    ├─ 生命周期：create/duplicate/delete/move（现有）
    └─ 兜底：若无 clientEvents，再跑精简后端 diff（或仅记一条 dashboard.updated + 摘要）
```

备选（不推荐一期就上）：每个设置弹窗即时打独立写日志 API——未保存也会成审计，和「版本真相」不一致，产品要单独定义。

**下一期默认采用：随保存上报 `clientEvents`。**

### 10.4 事件模型（建议）

公共字段：

- `schemaVersion`: 1
- `occurredAt`: ISO time（前端操作时刻）
- `scope`: `global` | `tab`
- `tabUuid` / `tabName`（scope=tab 时必填）
- `resourceType`: `dashboard_filter` | `dashboard_tab` | `dashboard_tile` | `dashboard_config`
- `action`: 稳定英文码（库内）
- `summary`: 结构化 before/after + 中文可读 `messageKey` / 已渲染 `message`（可选）

筛选器细分 `action` 示例：

- `dashboard.filters.created` / `deleted`
- `dashboard.filters.field_changed`（换字段）
- `dashboard.filters.values_changed`
- `dashboard.filters.operator_changed`
- `dashboard.filters.category_level_changed`（绑定层级）
- `dashboard.filters.parent_binding_changed`（类目父子）
- `dashboard.filters.date_constraint_changed`（min/max/动态最大日期等）
- `dashboard.filters.tile_binding_changed`（单 tile 绑定/取消/换 fieldId）
- `dashboard.filters.visibility_changed`（hidden/required/lockedTab 等）

Tab：

- `dashboard.tabs.created` / `renamed` / `deleted` / `reordered`
- `dashboard.tabs.filter_scope_changed`（Tab 筛选开关等，来自 config）

### 10.5 前端埋点落点（优先）

1. 筛选器配置面板（Apply/确认时聚合成事件，不要每个 keystroke）
2. 图表区块勾选绑定（Apply 时）
3. 全局筛选条 vs Tab 筛选入口（打 `scope`）
4. Tab 增删改名、Tab 筛选开关
5. 看板保存时把队列中的 `clientEvents` 塞进 update payload

### 10.6 后端改动要点

1. `UpdateDashboard` / versioned body 增加可选 `clientEvents?: OperationClientEvent[]`
2. `ProjectOperationLogService.recordClientEvents(...)`：校验长度上限、字段白名单、绑定当前 actor/project
3. `DashboardService.update`：
   - 有 `clientEvents` → 按事件写日志（可合并同一 filter 的连续同类事件）
   - **关闭或降噪**一期对 filters/tileTargets 的自动 diff（避免重复）
   - 无事件时 fallback：单条 `dashboard.updated` 或精简 diff
4. 列表 API / 前端：按 `summary.scope`、`action` 筛选；操作列继续中文映射

### 10.7 一期后端代码怎么处置

- **先不删文件** `dashboardOperationLogDiff.ts`，改为：
  - `mode: 'lifecycle_and_fallback' | 'full_diff'`
  - 默认 fallback：仅在无 clientEvents 时启用 full_diff 或只记 updated
- 等前端埋点覆盖率达标（建议：筛选器设置路径全覆盖）后再删除 filters 细 diff



### 10.10 补充覆盖范围（产品点名必须记）

以下与筛选器语义事件同一套 `clientEvents` / 后端落库模型；按切片落地。

#### A. 筛选器设置（Slice A 必含）

| 场景 | 建议 action / changeKind | 关键 summary 字段 |
|---|---|---|
| 类目筛选器 | `dashboard.filters.category_*` | `filterId`、`scope`、`categoryLevel`、`parentFieldId` |
| 类目层级关联变化 | `dashboard.filters.category_level_changed` / `parent_binding_changed` | before/after 层级与父字段 |
| 日期筛选器设置 | `dashboard.filters.date_constraint_changed` | `minAllowedDate`、`maxAllowedDate`、`enableDynamicMaxAllowedDate`、`settings.dateRange` / `singleDate`、粒度 |
| 默认值变化 | `dashboard.filters.default_values_changed` | `operator`、`values`、动态默认 preset |
| 全局 vs Tab | 所有筛选事件必带 | `scope: global\|tab`、`tabUuid`、`tabName` |

说明：类目/日期/默认值不要只落一条含糊的 `filters.updated`，应按上表拆 `changeKind`（可同 action 码 + `summary.changeKind`）。

#### B. 图表与 Tab / 看板对应关系（Slice A 后半或 Slice B 前半）

| 场景 | 建议 action | 关键 summary |
|---|---|---|
| 更新图表展示类型 | `dashboard.tiles.chart_kind_changed` 或 `saved_chart.display_type_changed` | `tileUuid`、`savedChartUuid`、`previousKind`、`nextKind`（如 table/line/bar） |
| 图表所属 Tab 变化 | `dashboard.tiles.tab_assignment_changed` | `tileUuid`、`previousTabUuid/Name`、`nextTabUuid/Name` |
| 图表与看板归属/嵌入关系 | `dashboard.tiles.chart_link_changed` | `belongsToDashboard`、`savedChartUuid`、是否看板内建图 |

实现提示：展示类型若在**已保存图表**上改，可能走 `SavedChartService` 而非 dashboard version；日志需在图表更新钩子或前端保存图表时上报，并带上当前 `dashboardUuid`（若从看板内打开）。

#### C. 提升看板（Slice B，后端主记）

| 场景 | 建议 action | 记录位置 |
|---|---|---|
| 提升看板到其他环境/空间 | `dashboard.promoted` | **后端 `PromoteService`** 成功后写（不依赖前端埋点） |
| 提升结果摘要 | summary | 源/目标 project、dashboardUuid、是否连同依赖图表、操作人 |

提升属于跨环境运维动作，以后端为准；前端只需在成功 toast 后可选补一条展示事件，不作为唯一来源。

#### D. 与一期后端 diff 的关系（更新）

- Slice A 上线后：**筛选器自动细 diff 关掉**，改由 A 表语义事件。
- 图表展示类型 / Tab 归属：有前端或 SavedChart 钩子后再关掉对应 tiles 粗 diff 中的噪音字段。
- **提升看板：只加后端钩子，不靠 diff。**


### 10.8 交付切片

**Slice A（本下一期主切片）**

1. 定 `clientEvents` 协议 + common 类型
2. 保存链路透传 + 后端写入
3. 筛选器设置面板（**必含**）：
   - 全局 vs Tab（`scope`）
   - 类目筛选 / 层级关联 / 父子绑定
   - 日期筛选设置（含动态范围）
   - 默认值
   - tile 绑定勾选
4. 列表中文与详情 before/after（筛选器优先）
5. 关闭与前端重复的 filters 自动 diff

**Slice B**

- Tab 生命周期与 Tab 下筛选挂载关系
- 图表展示类型变更；图表所在 Tab / 看板对应关系（含看板内建图）
- Tile 拖拽/增删的前端事件
- **提升看板**（`PromoteService` 后端记 `dashboard.promoted`）
- 无 clientEvents 时的后端 fallback 策略调优

### 10.9 验收标准（Slice A）

- 改全局筛选绑定层级 → 日志含 scope=global、categoryLevel before/after
- 在某 Tab 筛选入口改类目/日期/默认值 → scope=tab 且带 tab 名 + 对应 changeKind
- 勾选/取消图表绑定 → tile_binding_changed 可读
- 一次保存若前端上报了筛选事件，**不再**额外刷一堆含糊的 filters.updated
- 不跑 migration 也能在已有表结构上验证（若缺表再执行既有 migration）

### 10.11 验收标准（Slice B 增补）

- 修改图表展示类型 → 能看到 old/new kind，并尽量带 dashboard/tile
- 图表从 TabA 挪到 TabB → tab_assignment_changed
- 提升看板成功 → `dashboard.promoted`（源/目标环境信息齐全）

## 11. Implementation status (2026-09-15)

### Slice A (done, local uncommitted)
- Common DashboardOperationClientEvent + UpdateDashboard.clientEvents
- DashboardService.update records client events; demotes filter auto-diff when client events present
- FE queue drained on dashboard save; filter create/update/delete enqueue semantic events
- i18n action labels (zh/en)

### Slice B (done, local uncommitted)
- PromoteService.promoteDashboard -> dashboard.promoted
- Tile/tab fine diff: chart kind, tab assignment, chart link; tab lifecycle events

### Still pending
- Run migration / UI smoke / commit

