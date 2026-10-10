# 马上赢 X 平台 MCP 上手指南

任何支持 MCP（Model Context Protocol）的智能体——Claude Code、WorkBuddy、OpenClaw、Codex 等——接上马上赢 X 平台的 Lightdash MCP 后，就能用对话直接查生产 BI 数据（品类宝、集团说数、哪吒AI 等 647+ 张表）。

本文以**品类宝（HSM）**与**品类洞察**两大看板为演示对象——前者服务连锁零售商（大区级趋势），后者服务品牌商（全国趋势、内容更丰富），二者同基于马上赢均衡模型150版。三个实战查询全部真实跑通，返回数据一并附上。

**实测环境**：Lightdash **2.2.0**（`get_lightdash_version`）／ `https://x.brandct.com` ／ MAT2609（2025-10 ~ 2026-09）。三个实战数字 **2026-10-04** 跑通；**2026-10-10** 复核版本与看板地址，可直接打开。

## 怎么读

第 1~3 章人人必读（接入 + 通用套路）；第 4 章帮你选看板；之后两个看板各成一章——连锁零售商读第 5 章，品牌商读第 6 章。

## 1. 原理：一图看懂

```text
你的智能体（WorkBuddy / OpenClaw / Codex / Claude Code）
     │  MCP 协议（Streamable HTTP）
     ▼
马上赢 X 平台 Lightdash MCP 端点
     https://mcp-x.brandct.com/mcp
     │  x-api-key（PAT 个人访问令牌）认证
     ▼
Lightdash 语义层（项目 → explore 表 → dimension 维度 + metric 指标）
     │
     ▼
生产数仓（品类趋势 / 品牌份额 / 集团市占率 …）
```

你不需要写 SQL。同一个端点、同一份 PAT，换任何智能体都不变。

## 2. 五分钟接入

### 2.1 第一步：拿 PAT（个人访问令牌）

1. 浏览器打开 <https://x.brandct.com/generalSettings/personalAccessTokens>（微信扫码登录）
2. 点 **Create new token**，作用域一般全选（read 为主）
3. 复制令牌——只显示一次，格式是 `ldpat_` 前缀 + 38 位随机串

### 2.2 第二步：把 MCP server 加进你的智能体

| 配置项 | 值 |
|---|---|
| 类型 | 远程 MCP（HTTP / Streamable HTTP） |
| URL | `https://mcp-x.brandct.com/mcp`（或 `http://mcp.x.brandct.com/mcp`，任选其一） |
| 认证 | 请求头 `x-api-key: <你的PAT>`（`Authorization: Bearer <你的PAT>` 同样可以） |

Claude Code 写在项目根 `.mcp.json`（已在 `.gitignore`，改完重启）：

```json
{
  "mcpServers": {
    "马上赢X平台": {
      "type": "http",
      "url": "https://mcp-x.brandct.com/mcp",
      "headers": {
        "x-api-key": "ldpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Codex 把令牌放环境变量 `LIGHTDASH_PAT`，配置里只写 `bearer_token_env_var`，不要把令牌写进文件。WorkBuddy 用 `~/.workbuddy/mcp.json`（文件名不带点）：写完必须重启，再到「自定义连接器」里点信任，否则工具调不到。其它客户端同样是 HTTP + 上面的 URL 和请求头。

需要内部 Lightdash 时另加一个条目，端点 `http://mcp.lightdash.banmahui.cn/mcp`，令牌单独申请。

### 2.3 第三步：验证连通

对智能体说「调用 get_lightdash_version」，期望返回 **2.2.0**。本文只查这一个项目：

| 项目 | projectUuid |
|---|---|
| **品牌CT** | `3667f682-4080-44a4-8365-49f405936e09` |

查询时固定传这个 `projectUuid`（或 `set_project` 一次）。

### 2.4 第四步：确认权限

这两张看板不随账号默认开通。

- 浏览器打开第 5 / 6 章的链接，打得开就能看看板
- `find_dashboards` 搜「品类宝」/「品类洞察」，搜不到就是未开通
- 接入时调一次 `get_my_access({ projectUuid: "3667f682-4080-44a4-8365-49f405936e09" })`，看 `runMetricQuery` 是否为 true。为 false 时只能 `run_saved_chart`。不必每次查询都调，更不必默认带 `includeExplores=true`（品牌CT 的表名单约 70KB）

未开通找项目经理或客服 **17612234299**。PAT 不进 git、不发群，泄漏就到令牌页作废重建。

## 3. 查数五步

```text
① list_projects / set_project   锁定品牌CT（或每次查询带 projectUuid）
② 表用本文给出的名字             不确定能不能查时，再 get_my_access 看 runMetricQuery
③ find_explores / find_fields   拿字段 ID（fieldId = 表名_字段名）
④ search_field_values           核对取值（「华南地区」不是「华南」）
⑤ run_semantic_metric_query     执行查询。简单查询可用 run_metric_query
```

已知看板时，第 ⑤ 步带上 `dashboardUuid`。不传会自动选一张；品类洞察有正式看板和「核对」副本两张，随机抽到副本时口径会偏。打开页面用工具返回的 `webUrl`。

### 关键工具

| 工具 | 做什么 |
|---|---|
| `get_my_access` | 接入时看一次能不能临时查数。只有选表拿不准时才加 `includeExplores=true` |
| `find_explores` / `find_fields` | 找数据表、拿字段 ID。客户使用查看者先 `find_dashboards`：`find_explores` 只有这些看板用到的数据表，不是项目里全部数据表 |
| `search_field_values` | 查维度的真实取值 |
| `run_semantic_metric_query` | 多条件查询（本文主用） |
| `run_metric_query` | 一两维、少量指标的简单查询 |
| `run_saved_chart` | 跑已保存图表；没有临时查询权限时用 |
| `find_dashboards` | 搜看板，结果里的 `webUrl` 可直接打开 |
| `get_saved_chart` | 看官方图表用了哪些字段（`full=true`） |

提示词可以这么说：「用马上赢X平台 MCP，项目固定品牌CT（`3667f682-4080-44a4-8365-49f405936e09`），表用文中的 `pinleibaohsm_*` 或 `cls_insight_*`，先 `search_field_values` 核对取值」。查询若因表不可查被拒绝，再 `get_my_access` 看 `runMetricQuery`。

## 4. 两大看板，选哪个？

| | 品类宝（HSM）→ 第 5 章 | 品类洞察 → 第 6 章 |
|---|---|---|
| **服务对象** | 连锁零售商 | 品牌商 |
| **数据口径** | 马上赢均衡模型150版，**只含连锁超市业态** | 同一模型，含 **连锁超市 + 独立小店** |
| **地域粒度** | 全国 + **大区** | **全国**（表里没有区域字段） |
| **内容** | 品类 + 品牌 | 品类 / 品牌 / 集团 / 三级类目趋势 / 分省份额 / TOP20 商品 |
| **典型问题** | 「华南调味品下个季度该重点铺哪些类目？」 | 「全国看我的品类在涨还是跌？」 |

两个看板答案不一样是口径不同，不是 bug。对照见第 6 章实战三。

## 5. 看板一：品类宝（HSM）—— 连锁零售商

### 5.1 看板与入口

| 项 | 值 |
|---|---|
| 看板名 | 品类宝（HSM） |
| 看板 UUID | `d54853b1-85df-4ab3-8cdf-70a5244640e1` |
| 访问链接 | <https://x.brandct.com/projects/3667f682-4080-44a4-8365-49f405936e09/dashboards/d54853b1-85df-4ab3-8cdf-70a5244640e1/view> |

三个页签：品类总览、类目分析（占比变化 / TOP20 SKU）、品牌分析（TOP 品牌趋势 / CR5 / 得失分析）。

### 5.2 用哪些表

`find_explores({searchQuery: "pinleibaohsm"})`，分组标签「品类宝HSM」：

| explore（表名） | 用途 | 本文用于 |
|---|---|---|
| `pinleibaohsm_cls_top` | 四级类目销售额 / 同比 / 占比（占二级类目）/ 象限 | 实战一、实战二第一步 |
| `pinleibaohsm_brand_trend` | 月度趋势（月份 `mon`，时间筛选 `inThePast`） | 实战二第二步 |
| `pinleibaohsm_brand_rate` | 品牌在类目内的份额 | — |
| `pinleibaohsm_brand_quadrant` | 品牌增长-份额四象限 | — |
| `pinleibaohsm_brand_num` | 类目品牌数 | — |

**不要用 `ads_pinleibao_*`。** 搜「品类宝」会先看到 `ads_pinleibao_brand_sales_m` / `ads_pinleibao_brand_sales_q`，分组标签也叫「品类宝」，但字段和时间维度都不同，对不上这块看板。认 `pinleibaohsm_` 前缀。拿不准就 `get_dashboard_tiles` 取一个图表，再 `get_saved_chart` 看 `exploreName`。

### 5.3 维度取值（写筛选前先核对）

| 维度字段 | 取值 |
|---|---|
| `region_name`（区域） | 全国 / 华北地区 / 东北地区 / 华东地区 / 华中地区 / 华南地区 / 西南地区 / 西北地区 |
| `period`（时间窗口） | 年：`2025` ／ 季度：`2026Q1`、`2026Q2`… ／ 半年：`2025H1`、`2026H1` ／ 累计：`2026Q1-Q3`、`YTD2609` ／ 滚动年：`MAT2609` ／ 相对：近3个月 |
| `cls_1` ~ `cls_4` | 一~四级类目，如 `cls_2`=调味品、`cls_4`=酱油 |

- 区域写「华南」查不到，必须「华南地区」。不筛区域不等于全国，看板默认显式传「全国」
- `period` 是对比窗口，不是连续月份。看逐月用趋势表的 `mon`

`get_saved_chart`（`full=true`）能看到看板上图表用了哪些字段。实战一就是从「类目占比及同比变化」抄来的。

### 5.4 实战一：2026Q2、华南地区、调味品

先 `search_field_values` 核对：`period=2026Q2`，`region_name=华南地区`，`cls_2=调味品`。

`run_semantic_metric_query` 的 `metricQuery` 如下。顶层传品牌CT 的 `projectUuid` 和本节看板 UUID。

```json
{
  "exploreName": "pinleibaohsm_cls_top",
  "dimensions": [
    "pinleibaohsm_cls_top_cls_4",
    "pinleibaohsm_cls_top_cls4_yoy_type",
    "pinleibaohsm_cls_top_cls4_growth_type"
  ],
  "metrics": [
    "pinleibaohsm_cls_top_total_cls4_amount",
    "pinleibaohsm_cls_top_total_cls4_amount_last",
    "pinleibaohsm_cls_top_total_cls4_yoy",
    "pinleibaohsm_cls_top_total_cls4_amt_cls2",
    "pinleibaohsm_cls_top_total_last_cls4_amt_cls2",
    "pinleibaohsm_cls_top_total_cls4_growth_cls2"
  ],
  "filters": {
    "dimensions": {
      "and": [
        { "target": { "fieldId": "pinleibaohsm_cls_top_period" },
          "operator": "equals", "values": ["2026Q2"] },
        { "target": { "fieldId": "pinleibaohsm_cls_top_region_name" },
          "operator": "equals", "values": ["华南地区"] },
        { "target": { "fieldId": "pinleibaohsm_cls_top_cls_2" },
          "operator": "equals", "values": ["调味品"] }
      ]
    }
  },
  "sorts": [],
  "limit": 200
}
```

返回 40 个四级类目。按销售额取 TOP 10（同比、占比在原始结果里是小数，`0.0703` 即 +7.03%；下表金额为百万元）：

| 四级类目 | 本期销售额 | 同比 | 占二级类目 | 占比变化 | 象限 |
|---|---:|---:|---:|---:|---|
| 酱油 | 467.8 | -7.4% | 24.75% | -0.42pp | 成熟 |
| 蚝油 | 122.1 | -8.9% | 6.46% | -0.22pp | 成熟 |
| 盐 | 109.8 | -6.2% | 5.81% | -0.02pp | 成熟 |
| 辣椒酱 | 106.9 | -9.1% | 5.65% | -0.20pp | 成熟 |
| 菜谱式复合调味料 | 100.0 | +7.0% | 5.29% | +0.64pp | 明星 |
| 醋 | 82.5 | -6.6% | 4.36% | -0.04pp | 成熟 |
| 鸡精 | 75.9 | -8.4% | 4.02% | -0.11pp | 成熟 |
| 榨菜 | 72.3 | -0.7% | 3.82% | +0.20pp | 明星 |
| 香辛料 | 62.5 | -2.6% | 3.31% | +0.11pp | 明星 |
| 火锅底料 | 61.1 | -2.3% | 3.23% | +0.12pp | 明星 |

TOP10 里 8 个类目同比为负，酱油约占调味品四分之一。菜谱式复合调味料同比 +7.0%、占比 +0.64 个百分点。小类目里浓汤宝 +15.7%、火锅蘸料 +12.4%；海带丝 -21.5%、菌菇酱 -20.9%、料酒 -19.3%。象限由同比和占比变化打标：明星（占比升）、成熟（占比稳）、潜力、衰退。

### 5.5 实战二：过去一年 TOP5 的逐月趋势

窗口用 `MAT2609`（2025-10 ~ 2026-09）。先在 `pinleibaohsm_cls_top` 上取 TOP5，**不要传 sorts**（排序不稳定），`limit` 拉全量后自己排。

```json
{
  "exploreName": "pinleibaohsm_cls_top",
  "dimensions": ["pinleibaohsm_cls_top_cls_4"],
  "metrics": ["pinleibaohsm_cls_top_total_cls4_amount"],
  "filters": {
    "dimensions": {
      "and": [
        { "target": { "fieldId": "pinleibaohsm_cls_top_period" },
          "operator": "equals", "values": ["MAT2609"] },
        { "target": { "fieldId": "pinleibaohsm_cls_top_region_name" },
          "operator": "equals", "values": ["华南地区"] },
        { "target": { "fieldId": "pinleibaohsm_cls_top_cls_2" },
          "operator": "equals", "values": ["调味品"] }
      ]
    }
  },
  "sorts": [],
  "limit": 100
}
```

40 个类目里销售额前五（百万元）：酱油 1950.2、蚝油 509.8、盐 459.5、辣椒酱 459.2、醋 336.6。

再查 `pinleibaohsm_brand_trend`。月份维度是 `mon`（如 `202601`），滚动窗口用 `mon_2_month` 的 `inThePast`。要过去 12 个月时写 `values: [13]`：写 12 会从「今天」往回切，边界月被整月丢掉。

```json
{
  "exploreName": "pinleibaohsm_brand_trend",
  "dimensions": ["pinleibaohsm_brand_trend_mon", "pinleibaohsm_brand_trend_cls_4"],
  "metrics": ["pinleibaohsm_brand_trend_total_cls4_amount"],
  "filters": {
    "dimensions": {
      "and": [
        { "target": { "fieldId": "pinleibaohsm_brand_trend_cls_2" },
          "operator": "equals", "values": ["调味品"] },
        { "target": { "fieldId": "pinleibaohsm_brand_trend_cls_4" },
          "operator": "equals", "values": ["酱油", "蚝油", "盐", "辣椒酱", "醋"] },
        { "target": { "fieldId": "pinleibaohsm_brand_trend_region_name" },
          "operator": "equals", "values": ["华南地区"] },
        { "target": { "fieldId": "pinleibaohsm_brand_trend_mon_2_month" },
          "operator": "inThePast", "values": [13],
          "settings": { "completed": false, "unitOfTime": "months" } }
      ]
    }
  },
  "sorts": [],
  "limit": 500
}
```

2025-10 ~ 2026-09（百万元）：

| 月份 | 酱油 | 蚝油 | 盐 | 辣椒酱 | 醋 |
|---|---:|---:|---:|---:|---:|
| 2025-10 | 168.9 | 45.6 | 39.2 | 39.6 | 28.5 |
| 2025-11 | 158.4 | 40.1 | 39.5 | 37.9 | 28.5 |
| 2025-12 | 167.0 | 40.3 | 42.3 | 39.6 | 30.8 |
| 2026-01 | 161.2 | 38.8 | 39.8 | 38.7 | 28.3 |
| 2026-02 | 169.9 | 49.6 | 33.0 | 40.2 | 30.1 |
| 2026-03 | 162.8 | 40.3 | 38.7 | 41.1 | 28.8 |
| 2026-04 | 152.9 | 39.0 | 35.8 | 35.5 | 27.2 |
| 2026-05 | 159.1 | 41.8 | 36.8 | 36.8 | 28.8 |
| 2026-06 | 155.8 | 41.3 | 37.2 | 34.5 | 26.5 |
| 2026-07 | 169.5 | 45.8 | 39.6 | 41.0 | 28.0 |
| 2026-08 | 169.1 | 45.5 | 39.8 | 39.1 | 26.8 |
| 2026-09 | 155.7 | 41.7 | 37.8 | 35.1 | 24.3 |

酱油这 12 个月加总 1,950,193,234 元，与 MAT2609 的 1,950,193,233.51 元一致。酱油月销约 1.53~1.70 亿；蚝油在 2026-02 到 49.6（春节）；醋从 28.5 降到 24.3，与实战一同比 -6.6% 相符；盐在 2026-02 落到 33.0。

## 6. 看板二：品类洞察 —— 品牌商

### 6.1 看板与入口

| 项 | 值 |
|---|---|
| 看板名 | 品类洞察(MSY150均衡模型） |
| 看板 UUID | `5ad107a4-81d1-4ded-a173-ff41366122b4` |
| 访问链接 | <https://x.brandct.com/projects/3667f682-4080-44a4-8365-49f405936e09/dashboards/5ad107a4-81d1-4ded-a173-ff41366122b4/view> |

页签：总览 → 四级类目（四象限、明细、TOP20 商品）→ 三级类目趋势 → 品牌（TOP15、CR5、得失、品牌下 TOP10）→ 集团 → 大区分省份额。

### 6.2 用哪些表

`find_explores({searchQuery: "cls_insight"})`，分组「品类机会洞察(MSY150均衡模型)看板」，且表名**不要** `_ai` 后缀：

| explore（表名） | 用途 |
|---|---|
| `cls_insight_list` | 四级类目销售额 / 同比 / 占比（实战三） |
| `cls_insight_trend_m` | 品类月度趋势 |
| `cls4_insight_top20_list` | 类目下 TOP20 商品 |
| `brand_cls3_insight_list` / `brand_cls4_insight_list` | 品牌占三 / 四级类目 |
| `group_cls2_insight_list` / `group_cls3_insight_list` / `group_cls4_insight_list` | 集团口径 |
| `province_cls2_insight_list` | 分省份额 |

搜「cls_insight」会同时列出 `_ai` 表（分组「品类洞察_msy150_ai」）。那是另一套副本，对不上这块看板。

和品类宝的差别：

1. **没有区域字段**，只有 `period` 和 `cls_1`~`cls_4`，本来就是全国口径。
2. **图表上的 filters 是空的**，筛选在看板级。照抄图表 JSON 会扫全量，查询必须自己带 `period` + `cls_2`。
3. **必须传正式看板 UUID** `5ad107a4-81d1-4ded-a173-ff41366122b4`。同名还有一张「(核对图表和数据使用)」副本（`17bc978d-09e3-4e2d-8b2e-0643dd0a5731`）。不传 `dashboardUuid` 会在两张里随机选一张。查完核对 `resolvedDashboardContext.dashboardName` 不含「核对」。

### 6.3 实战三：同一问题，换成全国两业态

还是 2026Q2 调味品，表换成 `cls_insight_list`，去掉区域，顶层加上面的 `dashboardUuid`。

```json
{
  "exploreName": "cls_insight_list",
  "dimensions": ["cls_insight_list_cls_4"],
  "metrics": [
    "cls_insight_list_total_cls4_amount",
    "cls_insight_list_total_cls4_yoy",
    "cls_insight_list_total_cls4_amt_cls2",
    "cls_insight_list_total_cls2_yoy"
  ],
  "filters": {
    "dimensions": {
      "and": [
        { "target": { "fieldId": "cls_insight_list_period" },
          "operator": "equals", "values": ["2026Q2"] },
        { "target": { "fieldId": "cls_insight_list_cls_2" },
          "operator": "equals", "values": ["调味品"] }
      ]
    }
  },
  "sorts": [],
  "limit": 200
}
```

同样 40 个四级类目，量级是全国两业态。TOP 10（百万元）。`total_cls2_yoy` 每行相同，调味品总盘同比 **-2.0%**。

| 四级类目 | 本期销售额 | 同比 | 占二级类目 |
|---|---:|---:|---:|
| 酱油 | 5017.8 | -1.6% | 22.02% |
| 醋 | 1413.2 | -2.7% | 6.20% |
| 菜谱式复合调味料 | 1349.6 | +3.0% | 5.92% |
| 火锅底料 | 1220.1 | +1.1% | 5.35% |
| 盐 | 1063.1 | -3.8% | 4.66% |
| 辣椒酱 | 992.5 | -5.7% | 4.35% |
| 黄豆酱/豆瓣酱 | 982.4 | -4.0% | 4.31% |
| 鸡精 | 941.0 | -7.0% | 4.13% |
| 蚝油 | 875.0 | -0.2% | 3.84% |
| 香辛料 | 762.4 | +3.9% | 3.35% |

和实战一对照。这是「地域 × 业态」一起变，差额不能全算作业态差异：

| 类目 | 华南连锁超市 | 全国两业态 | 信号 |
|---|---:|---:|---|
| 酱油 | -7.4% | -1.6% | 大盘跌，独立小店更稳 |
| 料酒 | -19.3% | -8.0% | 华南超市渠道跌得更重 |
| 菜谱式复合调味料 | +7.0% | +3.0% | 两个口径都涨 |
| 浓汤宝 | +15.7% | +14.9% | 两个口径都涨 |
| 鱼露 | +7.2% | +13.4% | 全国更猛 |
| 海带丝 | -21.5% | -21.5% | 两边一样，是全国性下跌 |

## 7. 踩坑

| 现象 | 处理 |
|---|---|
| 筛选后 0 行 | 先 `search_field_values`。区域要「华南地区」 |
| 临时查询被拒 | `get_my_access`：`runMetricQuery` 为 true，表在 `queryable`。否则用 `run_saved_chart` |
| 排序乱 | 不传 `sorts`，拉全量自己排 |
| `inThePast` 少一个月 | 窗口 +1，再裁掉边界月 |
| 和品类宝对不上 | 用 `pinleibaohsm_*`，不用 `ads_pinleibao_*` |
| 和品类洞察对不上 | 不用 `_ai` 表；传正式看板 UUID，看板名不要带「核对」 |
| 品类洞察查出全量 | 自己带 `period` 和 `cls_2` |
| 月初数据空 | 每月 5 号前用上一完整月 |
| 401 | 重建 PAT，端点是 `mcp-x.brandct.com` |
| 链接打不开 | 用工具返回的 `webUrl` |

## 附录：术语

| 术语 | 含义 |
|---|---|
| **HSM** | 大卖场、大超市、连锁小超市，本文称连锁超市业态 |
| **IS** | 独立小店 |
| **MAT** | 滚动 12 个月。MAT2609 = 2025-10 ~ 2026-09 |
| **YTD** | 年初至今。YTD2609 = 2026-01 ~ 2026-09 |
| **explore** | 语义层里的一张表。`dimension` 用来分组和筛选，`metric` 是聚合指标 |
