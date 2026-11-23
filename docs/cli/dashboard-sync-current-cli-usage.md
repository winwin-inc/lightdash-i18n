# 本仓看板 YAML 与同步说明

命令、安装、更新见 [cli-standalone-usage.md](./cli-standalone-usage.md)。本文只写 YAML、权限、以及和官方的差异。

## YAML

后端走 `/api/v1/projects/{id}/code/{spaces,charts,sqlCharts,dashboards}`。看板 YAML 在官方字段之外还有：

- Tab / tile 用 **slug**（不要手抄环境本地 UUID）
- `tabs[].filters`：Tab 级筛选
- `tabSlug`：由 Tab 名派生（中文名会变成 `tab-{n}`，重名加 `-1` / `-2`）；upload 先按 `tabSlug`，再退回 `tabUuid`
- `config`：颜色同步、Tab 筛选开关、必填筛选锁 Tab（`lockedTabUuids` 按 slug 映回）
- 公式 / PoP、`--language-map`

导入按 `slug` 匹配。目标环境要有兼容的 dbt explore / 字段 / 指标。对不上的 slug 会丢掉并 warning，不阻断 upload。不要用会剥未知字段的工具改 YAML。

两个容易踩的语义差异：

- **`spaceSlug` 用 space 的 path 派生值，不是 REST API 里的 `slug`。** 两者可能不一致：改过名的 space，API 返回 `slug: lafa-0`，而库里的 ltree path（以及 as-code 的 `spaceSlug`）是 `lafa0`，即 `lafa0/msy150` 这种写法。按 API 返回的 slug 手写 `spaceSlug` 会全部报“space 不存在”并被跳过（加 `--skip-space-create` 时表现为静默跳过）。要拿正确的值，直接看 `download` 产出的 `spaceSlug`，不要从页面 URL 或 API 反推。
- **指定原 slug 上传 = 覆盖，不是新建副本。** 图表同样按 slug 原地更新，所以 `upload -d <原 slug>` 会改写目标环境同 slug 的看板及其图表。要做「独立副本、保留目标原内容」，必须在本地把看板与它引用的全部图表 slug 都改掉（并同步改 `tiles[].properties.chartSlug`、筛选器里以图表 slug 为 key 的 `tileTargets`），否则 `dashboardSlug` 还会把图表挂回原看板。

旧版 download 会写出 `config: null`（看板配置列为可空，老看板库里为 NULL）以及 `description: null`。已修复：新 download 不再写出这些字段；lint 与 upload 都容忍存量的 null，旧文件不改可直接过。图表的 `dashboardSlug: null` 同理（lint 允许，upload 现已接受）。不要为了过官方 lint 去剥 `tab.filters`。

## 筛选器能力（全部随 YAML 往返）

看板筛选器（全局 + `tabs[].filters`）的这些 fork 能力不需要额外开关，下载上传都保留：

- 必填分组：`requiredGroupId`（同组内任一项有值即解锁）
- 范围限制：`minAllowedDate` / `maxAllowedDate`、`enableDynamicMaxAllowedDate`、`rollingMinAllowedMonths`、`dataAvailableFromDay`
- 操作符与取值：`allowedOperators`、`excludedValues`、`clearable`、`singleValue`
- 联动 / 级联：`parentFieldId`、`parentScope`、`parentTabUuid`（或别名 `parentTabSlug`）、`categoryLevel`
- 可视与作用域：`hidden`、`readOnly`、`hideTilesWhenEmpty`、`lockedTabUuids`、`tileTargets`

其中三个引用型字段会转成可移植形态再转回，跨环境同步后引用不悬空：

| YAML 里的形态 | 库内形态 |
|---|---|
| `tileTargets` 的键 = 图表 slug | 图表所在 tile 的 uuid |
| `lockedTabUuids` = tab slug 列表 | tab uuid 列表 |
| `parentTabUuid` = tab slug | tab uuid |

注意 `parentTabUuid` 的字段名仍叫 uuid，但 YAML 里存的是 **tab slug**（Tab 级联）；上传时若还是旧环境 uuid 也能解析。也可以写别名 `parentTabSlug`（推荐，语义清晰），两者同时存在时以 `parentTabUuid` 为准；`download` 仍只输出 `parentTabUuid`。

## 图表能力（随 `chartConfig` / `metricQuery` 往返）

表格：`showRowGrouping`、`showSubtotals`、`enablePagination` + `pageSize`、`columns.*`（显隐 / 别名 / 冻结 / 列宽 / 展示样式）、`cellAlignment`、`conditionalFormattings`、透视布局（`metricsAsRows`、`pivotMetricHeaderPosition`、`pivotAutoFillWidth`、`pivotDimensionColumnMaxWidth`、`pivotColumnMaxWidth`、`pivotRowDimensionAlignment`）。

排序与分页游标：`metricQuery.sorts`（含 `nullsFirst`、`valueOrder`）、`metricQuery.offset` / `limit`。改这些会被识别为图表更新，不会被当成「无变更」跳过。

## 权限

| 角色 | download | upload |
|---|---|---|
| Viewer / Interactive viewer | 否 | 否 |
| Editor | 是 | 是 |
| Developer / Admin / 现有 Service Account | 是 | 是 |
| 自定义角色只勾 `view:ContentAsCode` | 是 | 否 |

只读同步：自定义角色只授 `view:ContentAsCode` + PAT。已落库的旧自定义角色不会自动多出 view/create。空间权限仍在：进不了的 private space 下不了、也建不进去。跨环境 space ACL 按 email / group name 对齐，对不上警告并跳过。

## 同步时会警告、不会中断

- 缺依赖 chart：看板仍上传，对应 tile 暂时空着。补上 chart 再 upload。
- spaces 失败：跳过，不影响 charts / dashboards。
- SQL chart 走 space ACL：无权私人目录里的 SQL 图拉不到。
- 私人 space 只要调用者有权就会导出。跨环境不想带时，删掉本地 `spaces/*.space.yml`。无权看到的 space 在接口 `skipped` 里，不会写进 YAML。

## 范围

- `download` / `upload`：看板、图表、SQL 图表、space。`lightdash deploy` 是 dbt explores / table-groups，不要混用。
- 默认 download 会打 `/code/spaces`（404/403 警告继续）、`/code/charts`、`/code/sqlCharts`、`/code/dashboards`。旧路径 `/charts/code`、`/dashboards/code` 仍给 MCP / 旧脚本用。
- 本仓有 `/code/virtualViews`，CLI 默认不拉，也没有 `--include-virtual-views`。
- 不做：组织级 users / groups / roles as-code、agents、定时任务、告警、homepages、`--include-all`、官方 lint 整仓门禁。
- `.lightdash-metadata.json` 是 CLI 写在本地的，服务端不会生成。

官方 CLI 仅作对照，不要当操作命令：官方 `lint` 不认 `tabs[].filters`；官方较新版本 `-d` 也会带 SQL 图，本仓现在同样会带（upload 仍靠本地 `*.sql.yml`，先 download 再 `--include-charts`）。
