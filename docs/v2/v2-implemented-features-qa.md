# V2 前端交测清单

> **日期**：2026-09-09  
> **入口**：[`README.md`](README.md) · **发版说明**：[`CHANGELOG.md`](CHANGELOG.md)  
> 只列**代码已落地、前端可测**项；暂缓项见 [`v2-changelog-high-value-backlog.md`](v2-changelog-high-value-backlog.md) §7。

---

## 一、环境变量 ↔ 功能（先开再测）

下列开关开在 **backend**（或根 `.env`），改完**重启 backend**，再刷前端。未列出的功能 = **不依赖这些 FF**。

| 环境变量 | 打开后可测的前端能力 |
|----------|----------------------|
| `MERGE_QUERIES_ENABLED=true` | Explore **合并查询**（选第二表 / join / Run / 保存重开） |
| `DASHBOARD_TABS_IN_MEMORY=true` | 看板 **Tab 切回不整页重建**（已访问 Tab 保留实例） |
| `LOCK_DASHBOARD_FILTERS_ENABLED=true` | 看板编辑态 **锁定筛选**；view 下 URL 改筛被忽略并提示 |
| `ENABLE_TIMEZONE_SUPPORT=true` | **时区全套**（仅 env 可开）：项目查询时区、Explore/图表时区选择、时区感知分组与筛选、用户默认时区、仓库「数据时区」+ Preview、结果 `resolvedTimezone` Badge |
| `RESULTS_CACHE_ENABLED=true` | 项目设置 **结果缓存 TTL**（`/caching`）可读可写 |
| `APPS_RUNTIME_ENABLED=true` | **Data Apps** 导航 / 权限 / 看板磁贴（有限；Sandbox、generate **不测**） |

**试跑建议**：以上除 Data Apps 外，预发可先全部 `=true`。

---

## 二、无需上述 FF 即可测（已实现）

### Explore

1. **Formula 表计算** — Modal 公式 → 校验 → Run；保存重开；标量 totals  
2. **同期对比 PoP** — 有时间维时可加对比列；无时间维无入口/有提示  
3. **透视 · 冻结列** — 表格列配置冻/解冻；**有透视维度时冻列按钮隐藏**  
4. **透视 · 合并重复行值** — 表格「合并重复行值」开关；不改 150 列上限  

### 看板

5. **Date Zoom（基础）** — 顶栏切日/周/月等，图时间聚合颗粒变化（不是筛选器）  
6. **看板 Owner** — 编辑模式看板标题旁铅笔 → 指定 Owner；组织删用户时可转让  
7. **导出 XLSX** — 导出弹窗可选「分文件 ZIP」/「单个工作簿（多 sheet）」  
8. **定时推送 XLSX** — 同上格式选项  

### 体验 / 权限

9. **Omnibar** — 中文 **1 字**可出结果  
10. **定时/分享截图** — 中文可读（CJK 字体）  
11. **Custom SQL 表计算权限** — 无 `manage:CustomSqlTableCalculations` 时 SQL 模式禁用并 toast  
12. **关键中文** — 公式 Modal、Data Ops 项目分组等无裸英文 key  

### 配置侧（非纯 UI，需 deploy）

13. **数据集 Nested Groups** — dbt `groups`/`group_label` + `lightdash.config.yml`，**新 CLI deploy** 后 Explore 侧边栏多层分组（不改表名）  

---

## 三、依赖 FF 的验收要点（对照 §一）

| FF | 怎么验 |
|----|--------|
| Merge | Explore 出现合并入口 → join → Run → 保存重开仍在 |
| Tab 内存 | 多 Tab 看板切 A→B→A，A 不闪断整页重建 |
| 锁筛选 | 编辑锁定某筛 → 分享带 `?filters=` → view 不覆盖并提示 |
| 时区 | 开 FF 后：项目设置有查询时区；Explore/图可选时区；仓库有数据时区 Preview；图旁有时区 Badge |
| 结果缓存 | 项目 `/caching` 能改 TTL |
| Data Apps | 能进列表/加看板磁贴即可；**不测** Sandbox / generate / Chart Types |

---

## 四、明确不写进交测（未交付 / 不做）

- 多 Tab「隐藏 Tab」、URL `?filters=` 深链、全局/Tab 筛叠加等 **旧能力回归**（非本窗口 V2 新增交测点；冒烟可另做）  
- 必填筛选 **GuidedSetup** 配置向导（语义核有，向导 UI 未做 → **不交测**）  
- Date Zoom **增强**（`dateZoomConfig`）、Slug **重命名**、Embed 解绑、Pre-agg、Role Sets 等  

---

## 五、回归抽查（各 1 条即可）

- 旧看板 / 图表链接仍可打开  
- CSV/Excel、类目权限主路径正常  
- slug URL 能打开（不是「改 slug 保旧链」）
