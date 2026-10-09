# 马上赢 X 平台 Lightdash MCP 上手指南

任何支持 MCP（Model Context Protocol）的智能体——Claude Code、WorkBuddy、OpenClaw、Codex 等——接上马上赢 X 平台的 Lightdash MCP 后，就能用对话直接查生产 BI 数据（品类宝、集团说数、哪吒AI 等 647+ 张表）。

本文以**品类宝（HSM）**与**品类洞察**两大看板为演示对象——前者服务连锁客户（大区级趋势），后者服务品牌客户（全国趋势、内容更丰富），二者同基于马上赢均衡模型150版。

**实测环境**：Lightdash **2.2.0**（`get_lightdash_version`）／ `https://x.brandct.com` ／ MAT2609（2025-10 ~ 2026-09）。三个实战数字 **2026-10-04** 跑通，**2026-10-08** 复核未变。

## 怎么读

第 1~3 章人人必读（接入 + 通用套路）；第 4 章帮你选看板；之后**两个看板各成独立章节、各自自包含**——连锁客户直接读第 5 章，品牌客户直接读第 6 章，只读自己有权限的那章即可。

## 查数时的看板规则

不传 `dashboardUuid` 时：有关联看板会**自动选中 1 个并查数**。品类宝只关联 1 张，`candidateCount=1`，`source=uniqueExploreContext`；品类洞察关联正式 + 核对共 2 张，`candidateCount=2`，随机选 1 个，完整名单在 `candidates`。**0 个候选**才返回 `dashboard_selection_required`。已知看板请显式传 `dashboardUuid`。

## 1. 原理：一图看懂

```
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

你不需要写 SQL。智能体通过一组标准 MCP 工具（找表、查字段、执行查询）完成「自然语言 → 语义层查询 → 数据返回」全过程。**同一个端点、同一份 PAT、同一套工具**，换任何智能体都不变——变的只是各家添加 MCP server 的配置入口。

---

## 2. 五分钟接入

### 2.1 第一步：拿 PAT（个人访问令牌）

自助创建，不用找专人申请：

1. 浏览器打开 <https://x.brandct.com/generalSettings/personalAccessTokens>（微信扫码登录）
2. 点 `Create new token`（创建新令牌），作用域一般全选（read 为主）
3. 复制生成的令牌——**只显示一次**，丢失只能重建

令牌格式：`ldpat_` 前缀 + 38 位随机串。

### 2.2 第二步：把 MCP server 加进你的智能体

所有智能体统一用这三个值：

| 配置项 | 值 |
|---|---|
| 类型 | 远程 MCP（HTTP / Streamable HTTP） |
| URL | `https://mcp-x.brandct.com/mcp`（另一种写法 `http://mcp.x.brandct.com/mcp`，两个端点均有实测连通记录，任选其一、不要混填） |
| 认证 | 请求头 `x-api-key: <你的PAT>`（等价写法：`Authorization: Bearer <你的PAT>`，两者服务端都接受） |

#### Claude Code（项目根 `.mcp.json`）

```json
{
  "mcpServers": {
    "lightdash": {
      "type": "http",
      "url": "https://mcp-x.brandct.com/mcp",
      "headers": {
        "x-api-key": "ldpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

改完重启 Claude Code 生效（`.mcp.json` 不热加载）。该文件已在 `.gitignore`，**永不提交**。

#### Codex CLI（`~/.codex/config.toml`）

```toml
[mcp_servers.lightdash]
url = "https://mcp-x.brandct.com/mcp"
# Codex 走 Bearer 认证（服务端等价接受）：
# 令牌放环境变量，不要写进配置文件
bearer_token_env_var = "LIGHTDASH_PAT"
```

shell 里 `export LIGHTDASH_PAT=ldpat_xxx` 后启动 Codex。也可用命令行添加：`codex mcp add lightdash --url https://mcp-x.brandct.com/mcp`。不同版本对自定义请求头的支持有差异，以 [Codex 官方 MCP 文档](https://github.com/openai/codex) 为准。

#### OpenClaw（`~/.openclaw/openclaw.json` 的 `mcp.servers` 段）

在配置文件 `mcp` → `servers` 下新增一个条目，同样填 URL + 认证头（结构与上表一致；具体字段名以你安装的 OpenClaw 版本文档为准）。

#### WorkBuddy（内部已实测落地的配置）

WorkBuddy 客户端（官网 <https://www.codebuddy.cn/work/> 下载，微信扫码登录）读用户目录下的 `~/.workbuddy/mcp.json`（注意是**不带点前缀**的 `mcp.json`）。把下面的模板写进去、令牌换成自己的 PAT 即可（公司《WorkBuddy 员工上手指南》全员实测通过的写法）：

```json
{
  "mcpServers": {
    "马上赢X平台": {
      "type": "http",
      "url": "http://mcp.x.brandct.com/mcp",
      "headers": {
        "x-api-key": "<你的 ldpat_xxx>"
      }
    }
  }
}
```

- server 名可直接用中文「马上赢X平台」；需要内部 Lightdash 平台时在 `mcpServers` 里再加一个条目（端点 `http://mcp.lightdash.banmahui.cn/mcp`，令牌独立申请，互不通用）
- 不想改文件也可以走界面：左侧栏 **连接器 → MCP 服务管理 → 配置 MCP**，添加 HTTP 类型服务，同样填 URL + `x-api-key`
- ⚠️ **两个实测坑，缺一不可**：① `mcp.json` 在客户端启动时读取，写完必须**重启 WorkBuddy**（关到系统托盘无图标再开）；② 重启后到 **连接器 → 右上角「自定义连接器」** 找到「马上赢X平台」**逐个点「信任」**——只写配置 + 重启、不点信任，工具照样调不到
- 配置文件含明文令牌，权限收紧为仅本人可读写；泄漏立即到令牌页 revoke

> 其它任何支持 MCP 的智能体（Cherry Studio、Cursor、通义等）同理：找到「添加 MCP server」的入口，选 HTTP 类型，填上面三件套。

### 2.3 第三步：验证连通

对智能体说「调用 lightdash 的 get_lightdash_version」，期望返回 `2.2.0`；或调 `list_projects`，确认列表里出现本文唯一使用的项目：

| 项目 | projectUuid | 说明 |
|---|---|---|
| **品牌CT** | `3667f682-4080-44a4-8365-49f405936e09` | **本文演示与日常查数都用这个** |

> 你的账号可能还能看到其它项目，均与本文无关——查询时固定传上面这个 projectUuid（或 `set_project` 一次），不要切换。

自定义筛选（本文三个实战）还要项目角色至少是**交互式查看者**。连通后让智能体调 `get_my_access`，看品牌CT 的 `effectiveCapabilities.runMetricQuery` 是否为 true。查看者只能跑已保存图表，做不了 Q2 / 区域这类临时筛选。开通渠道见 2.4。

### 2.4 第四步：确认看板权限（重要）

连通成功 ≠ 看板可用。本文演示的两大看板——**品类宝（HSM）**与**品类洞察**——都不随账号默认开通，先用下面任一方式自查：

- **浏览器自查**：打开第 5 / 6 章给出的看板链接（`x.brandct.com/projects/.../dashboards/.../view`），能正常打开即有权限
- **MCP 自查**：让智能体调 `find_dashboards` 搜「品类宝」/「品类洞察」——搜不到对应看板，或查询返回无权限类报错，就是未开通

未开通的话，**联系项目经理或客服 17612234299** 开通后再继续本文的实战。

### 2.5 安全红线

- PAT 不入 git、不贴进 issue / 邮件 / 群聊截图
- 配置文件 `chmod 600`
- 怀疑泄漏：立刻到 PAT 页面 revoke 重建

---

## 3. 接上之后的通用套路：五步法

不管查什么，都走这五步。后面三个实战就是按这个节奏走的。

```text
① get_my_access            看角色和 runMetricQuery；选表时再传 includeExplores=true
② set_project              固定项目上下文（或每次查询带 projectUuid）
③ find_explores / find_fields   找表 → 拿字段 ID（fieldId = 表名_字段名）；表只从 queryable 里选
④ search_field_values      核对维度真实取值（如「华南地区」不是「华南」）
⑤ run_semantic_metric_query  执行查询，拿数据（已知看板同时传 dashboardUuid）
```

`list_projects` 仍可用来确认项目名单；项目 UUID 已知时直接从 ① 进。只要看板原图、不改筛选：`find_dashboards` → `run_saved_chart`。本文三个实战是自定义时间/区域/类目，走 `run_semantic_metric_query`。

### 工具速查表

| 工具 | 一句话用途 |
|---|---|
| `get_my_access` | 看组织/项目角色、有效能力；`includeExplores=true` 才返回可查表 |
| `list_projects` | 列出 PAT 可访问的项目 |
| `set_project` | 设默认项目（后续查询不用重复传） |
| `list_explores` / `find_explores` | 列出 / 关键词搜索数据表（explore） |
| `find_fields` | 查某张表的字段，拿 fieldId |
| `search_field_values` | 查某维度字段的真实取值（写筛选前必做） |
| `run_metric_query` | 简单查询（1~2 维度 + 少量指标 + 单条件筛选） |
| `run_semantic_metric_query` | 完整查询（多条件 and 链 / tableCalculations，本文演示主用） |
| `find_dashboards` / `get_dashboard_tiles` | 搜看板 / 看看板由哪些图表组成 |
| `get_saved_chart`（full） | 读已保存图表的完整查询配置——**学官方口径的捷径** |
| `get_lightdash_version` / `get_site_info` | 连通性验证 |

> 给智能体的提示词建议：「用 lightdash MCP，项目固定品牌CT（3667f682-4080-44a4-8365-49f405936e09），先 get_my_access 再 search_field_values 核对取值再查」。说清楚项目 UUID 能省一轮来回。

---

## 4. 两大看板，选哪个？

> 前置：两大看板均需开通权限（自查方法与开通渠道见 2.4）。

| | 品类宝（HSM）→ 第 5 章 | 品类洞察 → 第 6 章 |
|---|---|---|
| **角色** | 连锁客户 | 品牌客户 |
| **场景** | 品类管理 | 市场研究 |
| **用例** | 查品类宝（HSM）看板 | 查品类洞察看板 |
| **数据口径** | 同为马上赢均衡模型150版，**只含 HSM 业态** | 同为马上赢均衡模型150版，含 **HSM + IS 两业态** |
| **地域粒度** | 全国 + **大区级**趋势 | **全国**（表里没有区域字段） |
| **内容广度** | 品类 + 品牌两条主线 | 更丰富：品类 / 品牌 / 集团 / 三级类目趋势 / 大区分省份额 / TOP20 商品 |
| **典型问题** | 「华南调味品下个季度该重点铺哪些类目？」 | 「全国看我的品类在涨还是跌？哪些子类目有机会？」 |

> HSM、IS、MAT 等术语缩写的含义见文末**附录 A 术语表**。

两个看板答案会不一样是**特性不是 bug**——覆盖业态不同（对照实例见第 6 章实战三）。选错看板 = 口径答错问题。

---

## 5. 看板一：品类宝（HSM）—— 连锁客户

### 5.1 看板与入口

| 项 | 值 |
|---|---|
| 看板名 | 品类宝（HSM） |
| 所在项目 | 品牌CT（生产） |
| 看板 UUID | `d54853b1-85df-4ab3-8cdf-70a5244640e1` |
| 访问链接 | <https://x.brandct.com/projects/3667f682-4080-44a4-8365-49f405936e09/dashboards/d54853b1-85df-4ab3-8cdf-70a5244640e1/view> |

⚠️ MCP 返回的 `webUrl` / `siteBaseUrl` 是 K8s 集群内网地址（`lightdash.default:8080`，公网打不开）——**自己拼链接时把域名换成 `x.brandct.com`**，路径不变。

看板分三个页签：品类总览（大数字 + 品类明细表）、类目分析（占比变化 / TOP20 SKU）、品牌分析（TOP 品牌趋势 / CR5 / 得失分析）。

### 5.2 查数前先过权限门禁

本文实战是临时指标查询。先 `get_my_access({ projectUuid: "3667f682-4080-44a4-8365-49f405936e09", includeExplores: true })`（细节见第 3 章）：`runMetricQuery` 须为 true，`pinleibaohsm_cls_top` / `pinleibaohsm_brand_trend` 须在 `explores.queryable`。

查询顶层同时传 5.1 的 `projectUuid` 和 `dashboardUuid`。不传看板时品类宝会自动选中这一张（规则见文首），仍建议显式传，口径更稳。

### 5.3 看板背后的 7 张专属表

`find_explores({searchQuery: "pinleibaohsm"})` 列出（认 `groupLabel`「品类宝HSM」；`groups` 是路径 key，可能为空，不要当成中文分组名）：

| explore（表名） | 标签 | 用途 | 本文用于 |
|---|---|---|---|
| `pinleibaohsm_cls_top` | 类目分析&TOP商品 | **四级类目销售额 / 同比 / 占比（占二级类目）/ 象限** | 实战一 + 实战二第一步 |
| `pinleibaohsm_brand_trend` | 品牌趋势 | **月度趋势**（月份维度 mon，时间筛选 inThePast） | 实战二第二步 |
| `pinleibaohsm_brand_rate` | 品牌占四级类目 | 品牌在类目内份额 | — |
| `pinleibaohsm_brand_quadrant` | 品牌四象限 | 品牌增长-份额四象限 | — |
| `pinleibaohsm_brand_num` | 品牌数量 | 类目品牌数 | — |
| `pinleibaohsm_cls_line` | 品牌参考线 | 图表参考线 | — |
| `pinleibaohsm_brand_filter` | 筛选器 | 看板筛选器联动 | — |

> ⚠️ **易错点：`ads_pinleibao_*` 不是本看板的表**。`find_explores` 搜「品类宝」时，会先看到 `ads_pinleibao_brand_sales_m` / `ads_pinleibao_brand_sales_q` 两张通用品牌销售表（`ads_` 前缀，`groupLabel` 也叫「品类宝」）——它们**不是**「品类宝（HSM）」看板背后的数据：字段结构、时间维度都不一样（实测其 `period` 维度没有月度值、无看板同款象限指标），用它查出的结果无法与看板对表。
>
> **快速判定**：本看板的表一律是 `pinleibaohsm_` 前缀 + `groupLabel`「品类宝HSM」。拿不准时用 `get_dashboard_tiles`（看板 UUID 见 5.1）任取一个图表 → `get_saved_chart` 看 `exploreName`，以看板实际用的为准。

### 5.4 关键维度取值（写筛选前先核对）

| 维度字段 | 取值 |
|---|---|
| `region_name`（区域） | 全国 / 华北地区 / 东北地区 / 华东地区 / 华中地区 / **华南地区** / 西南地区 / 西北地区 |
| `period`（时间窗口） | 年：2025 ／ 季度：2026Q1、2026Q2… ／ 半年：2025H1、2026H1 ／ 累计：2026Q1-Q3、YTD2609 ／ 滚动年：MAT2609 ／ 相对：近3个月 |
| `cls_1` ~ `cls_4` | 一~四级类目，如 cls_2=调味品、cls_4=酱油 |

两个易错点：

- 区域写「华南」查不到，必须「华南**地区**」；不筛区域 ≠ 全国，看板默认显式传「全国」
- period 是**对比窗口**不是连续时间轴——季度趋势要逐季查或用趋势表的月份维度

### 5.5 学官方口径的捷径

`get_saved_chart`（full=true）能读到看板上任何图表的完整查询 JSON（用哪些字段、怎么筛、怎么算）。不确定某张表怎么用时，先「抄作业」。实战一的查询结构就是从看板图表「类目占比及同比变化」学来的。

### 5.6 实战一：2026 年 Q2、华南地区、调味品的品类趋势

**需求拆解**：二级类目「调味品」在 2026Q2、华南地区的各四级类目表现——销售额、同比、占二级类目比重及变化。

**前置核对**（`search_field_values`）：period 有 `2026Q2` ✓ ／ region_name 是「华南地区」✓ ／ cls_2 是「调味品」✓

**查询**：用 `run_semantic_metric_query`，metricQuery（JSON 字符串）如下——

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

顶层再传 `projectUuid: "3667f682-4080-44a4-8365-49f405936e09"` 和 `dashboardUuid: "d54853b1-85df-4ab3-8cdf-70a5244640e1"`（或事先 `set_project` 后仍传看板 UUID）。

**真实返回**（2026-10-04）：40 个四级类目。按销售额取 TOP 10。原始行级 JSON 未随本仓库提供。

| 四级类目 | 本期销售额（百万） | 销售额同比 | 本期占比（占二级） | 占比变化 | 象限 |
|---|---:|---:|---:|---:|---|
| 酱油 | 467.8 | -7.4% | 24.75% | -0.42pp | 成熟 |
| 蚝油 | 122.1 | -8.9% | 6.46% | -0.22pp | 成熟 |
| 盐 | 109.8 | -6.2% | 5.81% | -0.02pp | 成熟 |
| 辣椒酱 | 106.9 | -9.1% | 5.65% | -0.20pp | 成熟 |
| **菜谱式复合调味料** | **100.0** | **+7.0%** | **5.29%** | **+0.64pp** | **明星** |
| 醋 | 82.5 | -6.6% | 4.36% | -0.04pp | 成熟 |
| 鸡精 | 75.9 | -8.4% | 4.02% | -0.11pp | 成熟 |
| 榨菜 | 72.3 | -0.7% | 3.82% | +0.20pp | 明星 |
| 香辛料 | 62.5 | -2.6% | 3.31% | +0.11pp | 明星 |
| 火锅底料 | 61.1 | -2.3% | 3.23% | +0.12pp | 明星 |

*（原始返回的同比 / 占比是小数，如 0.0703 即 +7.03%；百万由元 ÷ 10⁶ 换算）*

**数据读法**：

- 大盘普跌：TOP10 中 8 个类目同比负增长，酱油（占调味品近 1/4）同比 -7.4%
- 逆势亮点：菜谱式复合调味料同比 +7.0%、占比提升 0.64 个百分点，是华南调味品最猛的增长极；小类目里浓汤宝 +15.7%、火锅蘸料 +12.4%
- 跌幅榜：海带丝 -21.5%、菌菇酱 -20.9%、料酒 -19.3%
- 象限字段（`cls4_yoy_type` / `cls4_growth_type`）由平台按同比与占比变化自动打标：**明星**（占比升）／**成熟**（占比稳）／**潜力**／**衰退**

### 5.7 实战二：调味品 TOP5 四级类目在华南地区、过去一年的月度趋势

**需求拆解**：先确定「过去一年销售额 TOP5 的四级类目」（窗口用 MAT2609 = 2025-10 ~ 2026-09 滚动年），再查这 5 个类目逐月销售额。

#### 第一步：取 TOP5（cls_top 表 + MAT2609 窗口）

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

> ⚠️ **为什么不加 sorts**：该平台 sorts 表现不稳定（可能不按预期降序）。**正确姿势：limit 拉全量 → 智能体手动排序取 TOP**。40 行数据排序对智能体是零成本操作。

返回 40 个类目，手动排序得 TOP5：

| 排名 | 四级类目 | 过去一年销售额（MAT2609，百万元） |
|---|---|---:|
| 1 | 酱油 | 1950.2 |
| 2 | 蚝油 | 509.8 |
| 3 | 盐 | 459.5 |
| 4 | 辣椒酱 | 459.2 |
| 5 | 醋 | 336.6 |

#### 第二步：TOP5 逐月趋势（brand_trend 表 + 月份维度）

月度数据在 `pinleibaohsm_brand_trend`：月份维度 `mon`（如 202601）+ 时间型字段 `mon_2_month`（支持 `inThePast` 滚动窗口筛选）。类目维度同样有 cls_2/cls_4，多值筛选用 `values` 数组：

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

> ⚠️ **inThePast 边界坑（实测）**：窗口按「今天」往回切，不是按已物化的完整月。要 12 个完整月（202510~202609）写 `values: [12]` 常会吞掉边界月、只回 11 个月。**写 13，再按月份裁到目标窗口**。行数不要写死：2026-10-04 回到 65 行（多出 1 个月）；2026-10-08 最新月仍是 202609，同样写 13 只回 60 行（12×5）。以结果里的 `mon` 为准。

**真实返回**（2026-10-08 复核，与 10-04 数字一致；单位：百万元）：

| 月份 | 酱油 | 蚝油 | 盐 | 辣椒酱 | 醋 |
|---|---:|---:|---:|---:|---:|
| 2025-10 | 168.9 | 45.6 | 39.2 | 39.6 | 28.5 |
| 2025-11 | 158.4 | 40.1 | 39.5 | 37.9 | 28.5 |
| 2025-12 | 167.0 | 40.3 | 42.3 | 39.6 | 30.8 |
| 2026-01 | 161.2 | 38.8 | 39.8 | 38.7 | 28.3 |
| 2026-02 | 169.9 | **49.6** | 33.0 | 40.2 | 30.1 |
| 2026-03 | 162.8 | 40.3 | 38.7 | 41.1 | 28.8 |
| 2026-04 | 152.9 | 39.0 | 35.8 | 35.5 | 27.2 |
| 2026-05 | 159.1 | 41.8 | 36.8 | 36.8 | 28.8 |
| 2026-06 | 155.8 | 41.3 | 37.2 | 34.5 | 26.5 |
| 2026-07 | 169.5 | 45.8 | 39.6 | 41.0 | 28.0 |
| 2026-08 | 169.1 | 45.5 | 39.8 | 39.1 | 26.8 |
| 2026-09 | 155.7 | 41.7 | 37.8 | 35.1 | 24.3 |

**交叉验证（让数字可信）**：酱油 12 个月（2025-10~2026-09）求和 = 1,950,193,234 元，与第一步 MAT2609 窗口返回的 1,950,193,233.51 元**分毫不差**——月度明细与滚动年窗口同口径闭环。

**数据读法**：

- 酱油体量约为其余四者之和，月销稳定在 1.53~1.70 亿，季节性弱
- 蚝油明显春节效应：2026-02 冲到 49.6M（月均约 42M），2025-12~2026-01 及 7~8 月亦有双峰
- 醋逐级走弱：28.5M → 24.3M，尾部月份为全年最低，与实战一「同比 -6.6%」互相印证
- 盐在 2026-02 出现全年洼地（33.0M），春节前后波动明显

### 5.8 给智能体的连锁提示词

后续 WorkBuddy 入驻可直接粘贴（这次不做成 skill）：

```text
你是连锁客户的品类管理助手。用马上赢 X 平台 Lightdash MCP 查品类宝（HSM）。
项目 projectUuid=3667f682-4080-44a4-8365-49f405936e09，看板 dashboardUuid=d54853b1-85df-4ab3-8cdf-70a5244640e1。
先 get_my_access(projectUuid, includeExplores=true)：runMetricQuery 必须为 true；表只从 queryable 里选 pinleibaohsm_*（groupLabel=品类宝HSM）。
查数用 run_semantic_metric_query，顶层同时传上面两个 UUID。查完核对 resolvedDashboardContext.dashboardName 是「品类宝（HSM）」。
区域取值必须完整，例如「华南地区」不是「华南」。不要用 ads_pinleibao_*。
```

---

## 6. 看板二：品类洞察 —— 品牌客户

### 6.1 看板与入口

| 项 | 值 |
|---|---|
| 看板名 | 品类洞察(MSY150均衡模型） |
| 所在项目 | 品牌CT（生产） |
| 看板 UUID | `5ad107a4-81d1-4ded-a173-ff41366122b4` |
| 访问链接 | <https://x.brandct.com/projects/3667f682-4080-44a4-8365-49f405936e09/dashboards/5ad107a4-81d1-4ded-a173-ff41366122b4/view> |

（MCP 返回的 `webUrl` 是内网地址，同样要换 `x.brandct.com` 域名——同 5.1 的坑。）

页签内容比品类宝丰富一截：**总览**（大数字 + 明细表）→ **四级类目**（波士顿矩阵四象限 + 数据明细 + TOP20 商品）→ **三级类目趋势**（销售额 / 占比趋势线 + 明细）→ **品牌维度**（TOP15 品牌销售额同比 / 份额变化 / 趋势线 + TOP5 竞争格局 + 品牌得失分析 + 品牌下 TOP10 商品）→ **集团维度**（与品牌维度同构）→ **大区分省份额及份额得失**。

### 6.2 背后的表族

`find_explores({searchQuery: "cls_insight"})` 列出（认 `groupLabel`「品类机会洞察(MSY150均衡模型)看板」）：

| explore（表名） | 标签 | 用途 |
|---|---|---|
| `cls_insight_list` | 品类深度分析(占二级类目) | **四级类目销售额 / 同比 / 占比 / 排名**（实战三主用） |
| `cls_insight_trend_m` | 品类趋势分析 | 品类月度趋势 |
| `cls4_insight_top20_list` | 四级类目下TOP20 | 类目下 TOP20 商品 |
| `brand_cls3_insight_list` / `brand_cls4_insight_list` | 品牌深度分析 | 品牌占三 / 四级类目份额与同比 |
| `group_cls2_insight_list` / `group_cls3_insight_list` / `group_cls4_insight_list` | 集团深度分析 | 集团口径同构分析 |
| `province_cls2_insight_list` | 省份维度下四级占二级 | 大区分省份额视图 |
| `line_chart_list_m_cls` | （趋势线图族） | 三 / 四级类目销售额 / 占比月度趋势线 |

> ⚠️ **易错点：别拿混 `_ai` 后缀表**。搜「cls_insight」会同时列出另一套同构的 `_ai` 后缀表（`groupLabel`「品类洞察_msy150_ai」，如 `cls_insight_list_ai`）——**日常查询一律用不带 `_ai` 后缀的正式表**（上表），才能与看板数字对得上；`_ai` 系列是另一套副本，别因为搜索排名靠前就顺手用了。
>
> **快速判定**：认 `groupLabel`「品类机会洞察(MSY150均衡模型)看板」且表名无 `_ai` 后缀。

### 6.3 与品类宝的三个结构差异（写查询前必看）

1. **没有区域字段**——`cls_insight_list` 只有 `period`（时间）+ `cls_1~cls_4`（类目）两类筛选维度。不是漏了，是这张看板本来就是全国口径。
2. **图表自带 filters 全为空**——品类宝的看板图表在 metricQuery 里写死了默认筛选（如 period=近3个月），这套看板的筛选全靠看板级过滤器传入。**直接照抄图表 JSON 去查会扫全量**，必须自己带上 `period` + `cls_2` 起步。
3. **必须传正式看板 UUID**——不传会随机选 1 个，可能抽到核对副本甚至 0 行（见 6.4）。

### 6.4 实战三：同一问题，换品牌客户视角（全国 HSM+IS）

还是「2026Q2 调味品品类趋势」，这次不用品类宝，改用**品类洞察看板**——品牌客户视角、全国口径（HSM + IS 两业态）。

**不传看板时也会直接出数**（不会先报 `dashboard_selection_required`）。2026-10-08 两次实测都是 `candidateCount=2`，`candidates` 里正式 + 核对都在：一次抽到正式看板有数；另一次抽到核对副本，**rows 为空**——所以不要赌随机。抽到核对时形如：

```json
{
  "source": "randomExploreContext",
  "candidateCount": 2,
  "dashboardUuid": "17bc978d-09e3-4e2d-8b2e-0643dd0a5731",
  "dashboardName": "(核对图表和数据使用) -  品类洞察(MSY150均衡模型）",
  "candidates": [
    { "dashboardUuid": "17bc978d-09e3-4e2d-8b2e-0643dd0a5731", "dashboardName": "(核对图表和数据使用) -  品类洞察(MSY150均衡模型）" },
    { "dashboardUuid": "5ad107a4-81d1-4ded-a173-ff41366122b4", "dashboardName": "品类洞察(MSY150均衡模型）" }
  ]
}
```

`source` 为 `randomExploreContext` 且名字带「核对」时，**不要用这批数（包括 0 行）对正式看板**。顶层传 `dashboardUuid: "5ad107a4-81d1-4ded-a173-ff41366122b4"` 重跑，`source` 应变为 `explicitDashboardUuid`。

**查询**（注意与实战一的三处不同：表名换成 `cls_insight_list`、没有区域条件、顶层多了 dashboardUuid）：

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

顶层参数：`projectUuid: "3667f682-4080-44a4-8365-49f405936e09"` + `dashboardUuid: "5ad107a4-81d1-4ded-a173-ff41366122b4"`。

**真实返回**（2026-10-04）：同样 40 个四级类目，但量级是另一个世界（全国两业态 vs 华南单业态）。TOP 10（完整行级 JSON 未随本仓库提供）：

| 四级类目 | 本期销售额（百万） | 同比 | 占比（占二级） |
|---|---:|---:|---:|
| 酱油 | 5017.8 | -1.6% | 22.02% |
| 醋 | 1413.2 | -2.7% | 6.20% |
| **菜谱式复合调味料** | **1349.6** | **+3.0%** | **5.92%** |
| 火锅底料 | 1220.1 | +1.1% | 5.35% |
| 盐 | 1063.1 | -3.8% | 4.66% |
| 辣椒酱 | 992.5 | -5.7% | 4.35% |
| 黄豆酱/豆瓣酱 | 982.4 | -4.0% | 4.31% |
| 鸡精 | 941.0 | -7.0% | 4.13% |
| 蚝油 | 875.0 | -0.2% | 3.84% |
| 香辛料 | 762.4 | +3.9% | 3.35% |

*（`total_cls2_yoy` 每行相同 = 调味品二级类目总盘同比：全国 HSM+IS 口径 2026Q2 为 **-2.0%**）*

**与实战一对照**（华南 HSM vs 全国 HSM+IS，注意这是「地域 × 业态」双变量对照，差异不能全归因于业态）：

| 类目 | 华南 HSM 同比 | 全国 HSM+IS 同比 | 信号 |
|---|---:|---:|---|
| 酱油 | -7.4% | -1.6% | 大盘跌，但独立小店业态明显更有韧性 |
| 料酒 | -19.3% | -8.0% | 同上，华南超市渠道是重灾区 |
| 菜谱式复合调味料 | +7.0% | +3.0% | **两个口径都涨**——交叉验证的增长明星 |
| 浓汤宝 | +15.7% | +14.9% | 同上 |
| 鱼露 | +7.2% | +13.4% | 同上（全国更猛） |
| 海带丝 | -21.5% | -21.5% | 两口径跌幅几乎一致——全国性衰退，不是渠道问题 |

### 6.5 给智能体的品牌提示词

后续 WorkBuddy 入驻可直接粘贴（这次不做成 skill）：

```text
你是品牌客户的市场研究助手。用马上赢 X 平台 Lightdash MCP 查品类洞察看板。
项目 projectUuid=3667f682-4080-44a4-8365-49f405936e09，正式看板 dashboardUuid=5ad107a4-81d1-4ded-a173-ff41366122b4。
先 get_my_access(projectUuid, includeExplores=true)：runMetricQuery 必须为 true；表只从 queryable 里选 cls_insight_*（groupLabel=品类机会洞察(MSY150均衡模型)看板），不要用 _ai 后缀表。
查数用 run_semantic_metric_query，顶层同时传上面两个 UUID。这张表没有区域字段，必须自己带 period + cls_2。
查完核对 resolvedDashboardContext.dashboardName 是「品类洞察(MSY150均衡模型）」，不含「核对」。不传看板会随机选中 1 个（candidateCount=2），抽到核对副本时口径会偏或 0 行。
```

---

## 7. 踩坑速查表

| 症状 / 场景 | 原因 | 解法 |
|---|---|---|
| 筛选后返回 0 行 | 维度值与库里不一致（「华南」≠「华南地区」） | 先 `search_field_values` 核对再写筛选 |
| webUrl 打不开 | 返回的是集群内网地址 | 域名换成 `x.brandct.com`，路径不变 |
| 排序不对 / 顺序随机 | sorts 表现不稳定 | 不传 sorts，limit 拉全量手动排序 |
| inThePast 12 个月只回 11 个月，或多 1 个月 / 少整月 | 窗口按「今天」切；未物化的当月不会出现 | 写 13，按 `mon` 裁到目标 12 个月，不要假定行数 |
| 数对不上正式看板，或 0 行但 `source=randomExploreContext` | 未传 `dashboardUuid`，随机抽到核对副本（品类洞察常见） | 见文首规则与 6.4；顶层传正式看板 UUID |
| 搜「品类宝」查出的数和看板对不上 | 误用了 `ads_pinleibao_*` 通用表（`groupLabel` 也叫「品类宝」） | 品类宝（HSM）看板认 `pinleibaohsm_*` 前缀 + `groupLabel`「品类宝HSM」（见 5.3 易错点） |
| 查出的数和品类洞察看板对不上 | 误用了 `_ai` 后缀表（`groupLabel`「品类洞察_msy150_ai」） | 一律用不带 `_ai` 后缀的正式表（见 6.2 易错点） |
| 临时查询被拒 / 只能跑已保存图 | `runMetricQuery` 为 false，或表在 `metadataOnly` / `attributeDenied` | `get_my_access(..., includeExplores=true)`；开通交互式查看者后再查 |
| 月初 5 号前查「最近月份」数据缺 / 空 | 数仓每月 5 号前未刷新完整 | 用上一个完整月 / 季窗口（如 9 月数据 10-05 前以 202609 物化完为准） |
| 401 Unauthorized | PAT 过期 / 写错 / 端点配错 | PAT 页面重建；核对 URL 是 `mcp-x.brandct.com` |
| 指标数值「看起来不对」就质疑 | 同名指标口径可能不同 | 先 `get_saved_chart` 看官方图表用什么字段，抄官方口径 |
| 照抄品类洞察看板图表的 JSON 查询，返回全量数据 | 该看板图表自带 filters 全为空，筛选靠看板级过滤器传入 | 查询必须自己带上 `period` + `cls_2`（品类宝图表写死了默认筛选，抄它没事——两套看板习惯不同） |

## 附录 A：术语表

| 术语 | 含义 |
|---|---|
| **MSY150 均衡模型** | 即**马上赢均衡模型150版**，本文两大看板共同的数据底座 |
| **HSM** | Hypermarket / Supermarket / Chained Minimarket，即大卖场、大超市和连锁小超市，中文名**连锁超市业态** |
| **IS** | Independent Store，**独立小店** |
| **MAT** | Moving Annual Total，滚动 12 个月合计。如 MAT2609 = 2025-10 ~ 2026-09 |
| **YTD** | Year To Date，年初至今累计。如 YTD2609 = 2026-01 ~ 2026-09 |
| **PAT** | Personal Access Token，个人访问令牌（`ldpat_` 开头），Lightdash 平台的账号凭证 |
| **MCP** | Model Context Protocol，智能体接入外部工具的开放协议；本文指 Lightdash 暴露的查数工具集 |
| **explore** | Lightdash 中的数据表（语义层封装），查询的对象 |
| **dimension / metric** | 维度（分组与筛选用，如类目、区域、时间）/ 指标（聚合值，如销售额、同比、占比） |

## 附：本文引用的资料

- 公司内部《WorkBuddy 员工上手指南》（按人定制发放）—— WorkBuddy 配置文件路径、实测模板、重启 + 信任两步的来源
- [Codex CLI MCP 配置（config.toml / codex mcp add）](https://github.com/openai/codex)
- [MCP 工具与权限对照](./mcp-tools-permissions.md) · [get_my_access](./mcp-get-my-access.md)
