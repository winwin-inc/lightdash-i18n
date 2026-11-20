# 看板 / 图表 as-code 往返覆盖矩阵

> **状态：已实施**（基于 v2.7.6，仓库 `528fc91dc`）
> **范围**：本 fork 相对上游新增、且**会落库**的看板 / 图表 / 筛选器配置，在 `download` → YAML → `upload` 之间的往返完整性。
> **不在范围**：命令用法、安装、权限——见 [dashboard-sync-current-cli-usage.md](./dashboard-sync-current-cli-usage.md)。
> **判定口径**：`download` 写出的字段在 `upload` 后，库内字段值与语义不变。引用型字段允许「uuid ⇄ slug」转译，只要转译后不悬空、跨环境可解析。

## 一、能完整往返（原样字段）

字段名在 YAML 与库内一致，不做任何转译。

### 1.1 看板筛选器（全局 `filters` 与 `tabs[].filters` 同构）

| 功能 | 落库位置 | 依据 |
|---|---|---|
| 必填筛选 / 必填分组（同组任一有值即解锁） | filter rule：`required`、`requiredGroupId` | `packages/common/src/types/filter.ts:113,242-245`；`CoderService.test.ts:341` |
| 无值隐藏图表 | filter rule：`hideTilesWhenEmpty` | CHANGELOG v2.7.3；`CoderService.test.ts:107`（`preserves hideTilesWhenEmpty…`） |
| 静态可选范围（最早/最晚） | filter rule：`minAllowedDate`、`maxAllowedDate` | CHANGELOG v0.2098.9；`filter.ts:198-199` |
| 动态最晚可选（按数据更新滚动） | filter rule：`enableDynamicMaxAllowedDate` | CHANGELOG v0.2109.5~9 / v2.7.3；`filter.ts:201-205` |
| 近 N 个整月滚动下限 | filter rule：`rollingMinAllowedMonths` | CHANGELOG v2.7.2；`filter.ts:220` |
| 数据可用日（1–28，缺省 4） | filter rule：`dataAvailableFromDay` | CHANGELOG v2.7.3；`filter.ts:230` |
| 允许操作符清单 | filter rule：`allowedOperators` | CHANGELOG v0.2103.4~6；`filter.ts:196` |
| 排除值 | filter rule：`excludedValues` | CHANGELOG v0.2098.7；`filter.ts:193-194` |
| 不可清空 | filter rule：`clearable` | CHANGELOG v2.5.5；`filter.ts:240` |
| 单值模式 | filter rule：`singleValue` | CHANGELOG v0.2108.1~6；`filter.ts:163` |
| 对查看者隐藏 | filter rule：`hidden` | CHANGELOG v0.2094.6~10；`filter.ts:233` |
| 只读 | filter rule：`readOnly` | CHANGELOG v0.2091.57/58；`filter.ts:231` |
| 跟随父级筛选器 / 级联层级（支持多级链） | filter rule：`parentFieldId`、`parentScope`、`categoryLevel` | CHANGELOG v0.2091.28 / v2.1.3 / v2.5.2~2.5.4；`filter.ts:164,176-184` |
| 日期范围粒度（日 / 月 / 季 / 年） | filter rule：`dateRangeGranularity` | CHANGELOG v0.2107.1~9；`filter.ts:50` |
| 动态日期默认（相对时间、单值月份「是」） | filter rule：`settings.dateRange`、`singleDate` | CHANGELOG v2.0.4~2.0.8 / v2.7.2；`filter.ts:285-288` |
| Tab 级筛选器 | `tabs[].filters`（结构与全局 `filters` 相同，规则不带 `id`） | CHANGELOG v0.2091.5 / v2.1.6；`dashboardAsCodeSchema.test.ts:85`（`accepts fork cascade…`，注释说明 root 带 id、tab 不带） |
| Tab 顺序与隐藏 | `tabs[].order`、`tabs[].hidden` | `packages/common/src/types/contentAsCode/dashboards.ts:97-104` |

> `tileTargets`、`lockedTabUuids`、`parentTabUuid` 是筛选器里仅有的三个引用型字段，见第二节。

### 1.2 看板 `config`

| 功能 | 落库位置 | 依据 |
|---|---|---|
| 颜色同步开关 + 看板色板 | `config.syncChartColors`、`config.colorPalette` | CHANGELOG v2.1.2 / v2.7.6；`packages/common/src/types/dashboard.ts:194-196` |
| Tab 筛选开关 | `config.tabFilterEnabled` | CHANGELOG v2.0.2（Tab 内存）/ v2.1.6；`dashboard.ts:189` |
| 全局筛选开关 / 全局「添加筛选器」按钮 | `config.isGlobalFilterEnabled`、`config.showGlobalAddFilterButton` | CHANGELOG v0.2091.24；`dashboard.ts:190-191` |
| Tab「添加筛选器」按钮 | `config.showTabAddFilterButton` | `dashboard.ts:192`（CHANGELOG 未单列，随 v2.1.6 标签过滤器恢复同批） |
| 参数行置顶 | `config.pinnedParameters` | CHANGELOG v2.4.3~7（筛选器/标签栏/参数行吸顶）；`dashboard.ts:187` |
| 必填筛选提示文案 | `config.requiredFiltersNote` | CHANGELOG v2.0.2（锁定筛选）；`dashboard.ts:200` |
| Date Zoom 开关 | `config.isDateZoomDisabled` | CHANGELOG v2.0.2；`dashboard.ts:188` |

> `config` 可为空：老库该列为 `NULL`，新 `download` 不再写出 `config: null`，`upload` 与 lint 仍容忍存量 null。见 `dashboardAsCodeReferences.test.ts:140`。

### 1.3 图表

| 功能 | 落库位置 | 依据 |
|---|---|---|
| 表格行分组 / 小计 | `chartConfig.config.showRowGrouping`、`showSubtotals` | `CoderService.test.ts:525`、`chartAsCodeSchema.test.ts:39`（CHANGELOG 未单列条目） |
| 表格分页 | `chartConfig.config.enablePagination`、`pageSize` | CHANGELOG v0.2111~2112；`chart-as-code-1.0.json:2467-2478` |
| 分页游标 | `metricQuery.offset`、`metricQuery.limit` | CHANGELOG v0.2111~2112；`chartAsCodeSchema.test.ts:74` |
| 列显隐 / 别名 / 冻结 / 列宽 / 展示样式 | `chartConfig.config.columns.*` | CHANGELOG v2.5.2~2.5.4（可拖拽列宽落库）/ v0.2092.9 / v2.6.5（修复被误清空） |
| 条件格式化（含透视表、背景或字体） | `chartConfig.config.conditionalFormattings` | CHANGELOG v2.3.2~2.3.3 / v0.2094.3；`chart-as-code-1.0.json:2461` |
| 透视布局（指标为行、列头位置、自动撑满、列宽上限、行维度对齐） | `chartConfig.config.metricsAsRows` / `pivotMetricHeaderPosition` / `pivotAutoFillWidth` / `pivotDimensionColumnMaxWidth` / `pivotColumnMaxWidth` / `pivotRowDimensionAlignment` | CHANGELOG v0.2103.1~3 / v0.2103.4~6；`packages/common/src/types/savedCharts.ts:197-200` |
| 透视冻列 / 合并重复行 | `pivotConfig` | CHANGELOG v2.0.2；`CoderService.test.ts:525` |
| 单元格对齐 | `chartConfig.config.cellAlignment` | CHANGELOG v0.2103.1~3 |
| 表头悬停显示字段描述 | `chartConfig.config.showFieldDescriptionTooltip` | CHANGELOG v2.6.5；`savedCharts.ts:181` |
| 排序键（空值位置、自定义值顺序） | `metricQuery.sorts[].nullsFirst`、`sorts[].valueOrder` | CHANGELOG v2.5.2~2.5.4；`chart-as-code-1.0.json:2194-2197` |
| 指标基准线 | `chartConfig.config.layout.baselineFieldIds`、`baselineStyle` | CHANGELOG v2.6.5；`savedCharts.ts:403-405` |
| 查询口径（时区、metadata、指标覆盖、自定义维度、附加指标） | `metricQuery.timezone` / `metadata` / `metricOverrides` / `customDimensions` / `additionalMetrics` | CHANGELOG v2.0.2（时区 / 公式 / PoP）；`charts.ts:20-24` 整块导出 |
| 自定义图表（Vega-Lite）配置 | `chartConfig`（含 Vega spec 与颜色） | CHANGELOG v0.2104.1~6；`CoderService.ts:246` 整块透传 |
| 系列级视觉属性（颜色、重命名、隐藏指标名、符号、面积、平滑） | `chartConfig.config.series[]` | CHANGELOG v2.6.5 / v2.7.0（基准线与系列视觉在看板重建时保持）；`savedCharts.ts:259-300`（`Series`） |
| 系列符号填充 | `chartConfig.config.series[].filledSymbol` | CHANGELOG v0.2102.5~9；`savedCharts.ts:287` |
| 列顺序 / 参数 / 合并查询 | `tableConfig.columnOrder`、`parameters`、`merge` | CHANGELOG v2.0.2；`charts.ts:29-30`；`CoderService.test.ts:525` |

## 二、转译后往返（引用型字段）

YAML 写可移植 slug，库内存本地 uuid；`upload` 时按目标环境解析回 uuid。解析不到时跳过该项并 warning，不阻断上传。

| 字段 | YAML 形态 | 库内形态 | 依据 |
|---|---|---|---|
| filter rule `tileTargets` 的键 | 图表 slug | tile uuid | `CoderService.test.ts:19`（`getFiltersWithTileSlugs`）/ `:139`（`getFiltersWithTileUuids`） |
| filter rule `lockedTabUuids` | tab slug 列表 | tab uuid 列表 | `dashboardAsCodeReferences.ts:237-283`；`dashboardAsCodeReferences.test.ts:123,230` |
| filter rule `parentTabUuid` | tab slug（字段名仍叫 uuid） | tab uuid | `dashboardAsCodeReferences.ts:250-253`；`dashboardAsCodeReferences.test.ts:151`（`remaps parentTabUuid as a portable slug and back`） |
| `config.tabFilterEnabled` / `config.showTabAddFilterButton` 的键 | tab slug | tab uuid | `dashboardAsCodeReferences.ts:145-158` |
| `config.syncChartTileUuids` | tile slug | tile uuid | `dashboardAsCodeReferences.ts:157-161,195-204` |
| tile 的所属 Tab | `tabSlug` | `tabUuid` | `dashboards.ts:28-31`；`dashboardAsCodeReferences.test.ts:304`（`prefers tabSlug over a stale tabUuid`） |
| tile 引用的图表 | `properties.chartSlug` | `properties.savedChartUuid` | `dashboards.ts:36-39` |
| 图表所属看板 | `dashboardSlug` | `dashboardUuid` | `charts.ts:24`；`CoderService.ts:248-250` |

## 三、不进 as-code（附原因）

| 能力 | 落库位置 | 为什么不进 as-code |
|---|---|---|
| 组织级色板 / 主题（含 14 色规格与 `legacyColors` 对账） | 组织设置 | 环境级品牌配置，YAML 不应覆盖目标环境主题；看板自身 `config.colorPalette` 已随 YAML 走 |
| 用户 / 组 / 角色 / 项目 ACL | 用户、组、项目成员表 | 跨环境主体不同，按 email / group name 对齐而非搬 ID |
| 定时交付与告警（含「按 Tab 分工作簿 ZIP」选项） | scheduler 相关表 | 依赖目标环境的渠道、凭据与收件人 |
| 看板导出（按 Tab 分工作簿、图片比例/背景、CSV/XLSX 布局与性能参数） | 请求参数 / 导出任务 | 一次性产物，不是看板定义 |
| 客户使用模式（client-use）权限与看板白名单 | 项目属性 + 内容可见性表 | 安全边界，不允许通过 YAML 改写 |
| `virtualViews` | 独立表 + 独立 endpoint（`/code/virtualViews`） | CLI 默认不拉，无 `--include-virtual-views` |
| 运行时视图状态：筛选器取值、activeTab、Tab 内存、置顶/收藏、浏览量 | 会话 / 内存 / pinned list | 每人每会话状态，非定义 |
| 类目/父级筛选器的自动解析结果 | 运行时（写回按筛选器 id 合并） | 由数据现场算出，配置侧只保留 `parentFieldId` / `categoryLevel` |
| 看板 / 过滤器操作日志 | 操作日志表 | 审计记录，随目标环境重新产生 |
| 图表错误诊断文案、移动端布局与吸顶 | 运行时 / UI | 纯展示层 |
| Date Zoom 的运行时选择 | 会话 | 只导出开关 `config.isDateZoomDisabled` |
| 派生字段：图表 `colorPalette`、`views` / `lastViewedAt`；tile 的 `savedChartUuid`、`lastVersionChartKind` | 库内派生或按环境计算 | 由目标环境的组织色板 / 访问统计重新生成；`dashboards.ts:36-39` 的 `Pick` 已显式排除 |

## 四、已知不对称 / 后续项

1. **`ownerEmail`**：`download` 导出 `ownerEmail`（`CoderService.ts:594`）；`upload` 按邮箱解析成本环境成员并设为负责人，邮箱在本组织不存在时 warning 跳过，不阻断上传（创建与更新两条路径都覆盖，见 `CoderService.test.ts` 的 `upsertDashboard ownerEmail`）。即「单向携带、按环境解析」，不保证跨环境一定有人。
2. **引用解析失败一律降级**：`tileTargets` / `lockedTabUuids` / `syncChartTileUuids` 中解析不到的条目会被丢弃并 warning，`upload` 不中断。缺 chart 时 tile 仍建，只是暂时空着。
3. **旧色板色值会被改写**：看板 `colorPalette` 里命中 `legacyColors` 的旧 20 色，读路径 `reconcileColorPalette` 会换成当前色值并在保存后落库（CHANGELOG v2.7.6）。因此拿旧 YAML 上传后，再 `download` 出来的色值可能与源文件不同（属预期迁移）。
4. **颜色一致性的边界**：`syncChartColors` 只同步「哪些图表参与」与看板色板映射；单图系列数超过色板容量（14）时超出部分用生成色，跨图不再保证同系列同色（CHANGELOG v2.7.6 已知边界）。SQL 图表不参与颜色同步。
5. **`config` 为空的老看板**：老库 `config` 列为 `NULL`，新 `download` 省略该字段；`upload` 与 lint 容忍存量 `config: null`（`dashboardAsCodeReferences.test.ts:140`）。
6. **审核中的语义差异**：`parentTabUuid` 在 YAML 里存 slug 但字段名保留 `uuid`；如上游工具按名字校验会误判，暂不改名以免破坏存量文件。
7. **`verified` 字段尚未落地**：`ChartAsCode` / `DashboardAsCode` 类型里有 `verified?: boolean`，但 `download` 从不写、`upload` 也不消费——校验状态（内容治理）目前不进 as-code。要跨环境携带需另做决定（校验是环境级治理行为，未必应该同步）。

## 五、核对方式

> 行号按撰写时工作区（含本批 `ownerEmail` 修复）计；若后续提交挪动行，以测试名称为准。

**单元测试（可直接指定文件跑）**

-   `packages/backend/src/services/CoderService/CoderService.test.ts`
    -   `fork filter fields survive the as-code round-trip`（:341）：一条规则覆盖 `requiredGroupId`、`clearable`、`dataAvailableFromDay`、`rollingMinAllowedMonths`、`enableDynamicMaxAllowedDate`、`minAllowedDate` / `maxAllowedDate`、`allowedOperators`、`excludedValues`、`parentFieldId` / `parentScope` / `parentTabUuid`、`categoryLevel`、`singleValue`、`hideTilesWhenEmpty`、`hidden`、`readOnly`、`lockedTabUuids`、`tileTargets`
    -   `table chart grouping, pagination and sorting survive as-code`（:525）：`showRowGrouping`、`showSubtotals`、`enablePagination` / `pageSize`、`columns.*`、`conditionalFormattings`、透视布局、`sorts`（含 `nullsFirst` / `valueOrder`）、`offset` / `limit`、`pivotConfig`、`parameters`、`tableConfig`
    -   `getFiltersWithTileSlugs`（:19）/ `getFiltersWithTileUuids`（:139）：`tileTargets` 双向转译
    -   `transformChart / transformDashboard null normalization`（:278）：空 `config`、空 `description` 的写出/读入
    -   `upsertDashboard ownerEmail`（:630）：`creates the dashboard with ownerUserUuid when ownerEmail resolves to a member`、`still creates the dashboard and warns when ownerEmail has no matching member`、`updates the dashboard owner when ownerEmail resolves to a different user`、`does not touch the owner on update when ownerEmail is not set`
-   `packages/backend/src/services/CoderService/dashboardAsCodeReferences.test.ts`
    -   `config and locked tab refs`（:87）：`exports tab and tile uuids as slugs`、`exports null config as undefined…`、`remaps parentTabUuid as a portable slug and back`、`imports slugs back to uuids and warns on unknown refs`
-   `packages/common/src/schemas/chartAsCodeSchema.test.ts`
    -   `accepts table grouping, pagination and column props`（:39）、`accepts sorting keys, offset and pivot grouping`（:74）
-   `packages/common/src/schemas/dashboardAsCodeSchema.test.ts`
    -   `accepts tab-level filters and fork config extras`（:31）、`accepts fork cascade, group and range-limiter fields`（:85）、`accepts legacy null config and null description from old downloads`（:74）

**端到端核对（人工）**

1. 源环境 `download` 到目录 A；
2. `upload` 到目标环境（确认无 `Skipped …` 警告，或逐条核对已知可跳过项）；
3. 目标环境再 `download` 到目录 B；
4. 比对 A / B，忽略 `updatedAt`、`downloadedAt`、`uuid`、`tileSlug` 与引用型字段的本地 id 差异。

## 附录：CHANGELOG 条目归类

从 `CHANGELOG.md`（v2.7.6 起回溯至 v0.2091.5）提取与本主题相关的条目共 **57 条**，归类如下（S1 = 完整往返，S2 = 转译后往返，S3 = 不进 as-code）。

| 版本 | 条目 | 归类 |
|---|---|---|
| v2.7.6 | 看板颜色同步 14 色规格、`legacyColors` 对账 | S1（`colorPalette`）/ S3（组织预设色） |
| v2.7.6 | 颜色同步只统计真正渲染的系列、CIEDE2000 阈值 | S3（运行时分配算法） |
| v2.7.4 | 筛选器「无值隐藏图表」残留提示条修复 | S3（UI） |
| v2.7.3 | `hideTilesWhenEmpty` 规则级开关 | S1 |
| v2.7.3 | `dataAvailableFromDay` 规则级配置 | S1 |
| v2.7.2 | 日期可选范围约束（滚动下限、动态最晚、跨模式字段清理） | S1 |
| v2.7.2 | 基准线圆点跟随线宽 | S3（渲染） |
| v2.6.5 | 指标基准线 `baselineFieldIds` / `baselineStyle` | S1 |
| v2.6.5 | 表头悬停显示字段描述开关 | S1 |
| v2.6.5 | 表格列配置被误清空并落库的修复 | S1 |
| v2.6.5 | 筛选器下拉「添加所有匹配项」/「清空」 | S3（UI 操作） |
| v2.6.4 | 看板导出按 Tab 分工作簿（XLSX/CSV） | S3（导出） |
| v2.6.4 | 定时交付新增「按 Tab 分工作簿（ZIP）」 | S3（定时交付） |
| v2.6.3 | 导出连接泄漏、100 万行内存、gzip 兼容 | S3（导出管道） |
| v2.5.5 | 筛选器「不可清空」`clearable` | S1 |
| v2.5.5 | 删除「按类目筛选器配置」入口 | S3（UI） |
| v2.5.2~2.5.4 | 跨 Tab 继承扩展到普通字段 | S3（运行时取值） |
| v2.5.2~2.5.4 | 非类目筛选器绑定父级类目 | S1（`parentFieldId` / `parentScope`） |
| v2.5.2~2.5.4 | 表格列宽可拖拽并随图表保存 | S1（`columns.*.width`） |
| v2.5.2~2.5.4 | 维度自定义值顺序排序 | S1（`sorts[].valueOrder`） |
| v2.5.2~2.5.4 | 父级绑定支持多级链 | S1（`categoryLevel`） |
| v2.4.8 | 跨 Tab 继承、类目层级识别、时间筛选按形态继承 | S3（运行时取值） |
| v2.4.3~2.4.7 | 自定义图表（Vega-Lite）跟随看板颜色 | S1（`chartConfig`）/ S3（同步算法） |
| v2.4.3~2.4.7 | 看板深度复制（含图表/SQL 图表） | S3（操作，非字段） |
| v2.4.3~2.4.7 | 筛选器/标签栏/参数行吸顶 | S1（`pinnedParameters`）/ S3（UI） |
| v2.3.6~2.4.2 | client-use 内容可见性与 as-code 导出限制 | S3（权限） |
| v2.3.2~2.3.3 | 表格 / 透视表支持隐藏维度 | S1（`columns.*.visible`） |
| v2.3.2~2.3.3 | 条件格式化增强（含透视表） | S1（`conditionalFormattings`） |
| v2.3.2~2.3.3 | 看板图表卡片全屏弹窗 | S3（UI） |
| v2.1.7~2.2.0 | 禁用类目过滤规则的处理逻辑 | S3（运行时 / 操作日志） |
| v2.1.6 | 仪表板标签过滤器恢复 | S1（`tabs[].filters`） |
| v2.1.5 | 看板级未知名颜色追加 | S3（运行时分配） |
| v2.1.3 | 类目筛选初始化与级联展示态 | S1（`categoryLevel`）/ S3（展示态） |
| v2.1.2 | 看板颜色同步 | S1（`syncChartColors` / `colorPalette`） |
| v2.0.9~2.1.0 | 仪表板选项卡管理 | S1（`tabs[]` 顺序 / 隐藏） |
| v2.0.9~2.1.0 | 过滤器默认图块目标回填 | S2（`tileTargets`） |
| v2.0.9~2.1.0 | 看板 / 过滤器操作日志 | S3（审计表） |
| v2.0.4~2.0.8 | 月份筛选「是」动态默认值 | S1（`singleDate` / `settings.dateRange`） |
| v2.0.2 | 公式表计算 / 同期对比（PoP） | S1（`metricQuery`） |
| v2.0.2 | 透视冻列 / 合并重复行 | S1（`pivotConfig`） |
| v2.0.2 | 看板 Date Zoom | S1（`isDateZoomDisabled`）/ S3（运行时选择） |
| v2.0.2 | 看板所有者与转让 | S1（`ownerEmail`，见第四节） |
| v2.0.2 | Excel 导出 / 定时推送多 sheet | S3（导出 / 定时） |
| v2.0.2 | 合并查询 | S1（`merge`） |
| v0.2111~2112 | 表格 / 图表分页 | S1（`enablePagination` / `pageSize` / `offset` / `limit`） |
| v0.2109.5~9 | 看板动态日期限制与校验 | S1（`enableDynamicMaxAllowedDate`） |
| v0.2107.1~9 | 「在之间」日期筛选粒度切换（日/月/季/年） | S1（`dateRangeGranularity`） |
| v0.2103.4~6 | 透视列宽自动撑满 / 最大宽度 | S1（`pivotAutoFillWidth` / `pivotColumnMaxWidth`） |
| v0.2103.4~6 | 筛选器允许操作符配置 | S1（`allowedOperators`） |
| v0.2103.1~3 | 透视列头层级、单元格对齐、行维度对齐 | S1 |
| v0.2098.9 | 可选最早 / 最晚日期 | S1（`minAllowedDate` / `maxAllowedDate`） |
| v0.2098.7 | 筛选器排除指定选项值 | S1（`excludedValues`） |
| v0.2094.6~10 | 筛选器支持隐藏 | S1（`hidden`） |
| v0.2094.3 | 条件格式化颜色（背景 / 字体） | S1（`conditionalFormattings`） |
| v0.2091.57/58 | 只读筛选器 | S1（`readOnly`） |
| v0.2091.28 | 关联类目与父级筛选器 | S1（`parentFieldId` / `parentScope`） |
| v0.2091.5 | 支持 tab 页面筛选器 | S1（`tabs[].filters`） |

> 表中 57 行按「一条 CHANGELOG 条目」计；其中同一条同时命中 S1 与 S3 的，已在归类列分别注明；未列入表中的条目属性能 / 稳定性 / MCP / 登录 / 品牌等与看板定义无关的改动。
