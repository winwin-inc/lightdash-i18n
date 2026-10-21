# MCP 服务上线流程文档

| 项 | 内容 |
|---|---|
| 状态 | **草稿 v0.2**（待确认项见 [§11](#11-待确认事项tbd)） |
| 主题 | MCP 服务（`packages/lightdash-mcp*`）从打 tag → 镜像 → 集群发布的**端到端上线流程**，含配置清单、关联关系、权限模型、验收与回滚 |
| 涉及系统 | **admin 后台**（看板配置与授权数据源）、**Lightdash**（主站 + MCP 服务）、**GitHub Actions**（构建镜像）、**Jenkins**（发布到集群）、k8s-config（部署清单） |
| 部署目标 | **2 个预发 + 2 个线上**：预发·内部、预发·外部品牌CT、线上·内部、线上·外部品牌CT（见 [§3.3](#33-四套部署目标)） |

> 说明：本文只描述「**MCP 服务怎么上线**」，不区分包版本代次，也不涉及客户端接入用法。
> **鉴权细节不在本文展开**（Keycloak / OAuth 配置见 `feat/mcp-v2` 分支的 `docs/mcp/lightdash-mcp-v2-keycloak-oauth.md`），本文只保留发布时必须核对的项。

---

## 1. 一页速览

```
① 打 tag（mcp-v*）→ ② GitHub Actions 构建并推送镜像 → ③ Jenkins 发布（写入 tag / apply 清单）
→ ④ 滚动更新 Pod → ⑤ 验证 /health、鉴权、权限与口径
```

**发布顺序：先主站（Lightdash，含换票路由），后 MCP 服务。**
主站未先发版时，MCP 换票会 401/500。

---

## 2. 系统与职责

| 系统 | 在 MCP 上线中的职责 | 仓库 / 位置 |
|---|---|---|
| **Lightdash 主站** | 提供 REST + `POST /api/v1/mcp/token-exchange` 换票路由；看板权限与行级 `sql_filter` 的执行方 | `packages/backend`、`packages/common` |
| **Lightdash MCP 服务** | 独立进程，把 REST 能力以 MCP 协议暴露给 Cursor / Claude Code 等客户端 | `packages/lightdash-mcp*`、`Dockerfile` |
| **GitHub Actions** | 打 tag 触发构建镜像并推送到阿里云镜像仓 | `.github/workflows/build-docker-mcp.yml` |
| **Jenkins** | 发布：更新镜像 tag / 应用 k8s-config 清单，滚动更新集群 | [jenkins.banmahui.cn](https://jenkins.banmahui.cn/)，入口见 [§3.2](#32-jenkins-发布关键) |
| **k8s-config** | 部署清单：Deployment / Service / ConfigMap / SopsSecret / ApisixRoute | `msy/ops/k8s-config`（分支 `pre` / `master`） |
| **admin 后台** | 看板配置与**用户看板授权**的数据源；MCP 侧白名单最终以它为准 | `winwin-report`（JSON-RPC）+ brand-fe 管理后台 |
| **dbt（hologres_analytices）** | 看板口径与行级权限的**唯一来源**（`meta.sql_filter`） | `models/marts/*/schema_*.yml` |
| **Keycloak / Apisix** | 登录与验签、对外域名与证书、限流 | 外部平台 |

---

## 3. 发布流程

```mermaid
flowchart TD
  dev[开发提 tag: mcp-vX.Y.Z] --> gha["GitHub Actions<br/>build-docker-mcp.yml"]
  gha -->|"winwin/lightdash-mcp:X.Y.Z + :latest"| reg[(阿里云镜像仓)]
  dev2[主站 tag: vX.Y.Z] --> gha2["GitHub Actions<br/>build-docker-with-i18n.yml"]
  gha2 -->|"winwin/lightdash:X.Y.Z"| reg2[(阿里云镜像仓)]
  reg --> k8scfg["k8s-config<br/>pre / master 分支<br/>lightdash-mcp/ 或 lightdash-internal-mcp/ 镜像 tag"]
  reg2 --> k8scfg2["k8s-config<br/>lightdash/ 或 lightdash-internal/ 镜像 tag"]
  k8scfg --> jenkins["Jenkins 发布（写入 tag）<br/>data-platform/lightdash-mcp（线上·外部）<br/>预发布data-platform/lightdash-mcp（预发·外部）<br/>内部线 job 见 §3.2"]
  k8scfg2 --> jenkins
  jenkins --> rollout["kubectl apply / rollout<br/>Deployment: lightdash-mcp / lightdash-internal-mcp"]
  rollout --> check["验证：/health、鉴权、list_projects、看板与口径"]
```

### 3.1 tag 与镜像规则

| 组件 | tag 规则 | 触发 workflow | 镜像 |
|---|---|---|---|
| MCP 服务 | `mcp-vX.Y.Z` | `.github/workflows/build-docker-mcp.yml` | `registry.cn-hangzhou.aliyuncs.com/winwin/lightdash-mcp` → 推 `:X.Y.Z` 与 `:latest` |
| Lightdash 主站 | `vX.Y.Z`（排除 `mcp-v*` / `cli-v*`） | `.github/workflows/build-docker-with-i18n.yml` | `registry.cn-hangzhou.aliyuncs.com/winwin/lightdash` |

- 非 tag 构建会推 `sha-<12位>` 镜像，仅供调试，**不能上线**。
- 集群清单用的是 **VPC 镜像仓** `registry-vpc.cn-hangzhou.aliyuncs.com/...`，需确认 tag 已同步/可见。
- MCP 包版本由 `pnpm bump-mcp -- X.Y.Z`（`scripts/bump-versions.mjs`）写入 `packages/lightdash-mcp*/package.json`，tag 需与之对应。

### 3.2 Jenkins 发布（关键）

**入口：** [https://jenkins.banmahui.cn/](https://jenkins.banmahui.cn/)

| 环境 | Jenkins 目录 | job 链接 | 对应 k8s-config |
|---|---|---|---|
| 线上·外部品牌CT | `data-platform` | https://jenkins.banmahui.cn/job/data-platform/job/lightdash-mcp/ | `master` 分支 `lightdash-mcp/` |
| 预发·外部品牌CT | `预发布data-platform` | https://jenkins.banmahui.cn/job/%E9%A2%84%E5%8F%91%E5%B8%83data-platform/job/lightdash-mcp/ | `pre` 分支 `lightdash-mcp/` |
| 线上·内部 | `data-platform` | 待确认（疑为 `…/job/data-platform/job/lightdash-mc`） | `master` 分支 `lightdash-internal-mcp/` |
| 预发·内部 | `预发布data-platform` | 待确认（疑为 `…/job/预发布data-platform/job/lightdash-mc`） | `pre` 分支 `lightdash-internal-mcp/` |

（预发布目录 URL 编码形式：`%E9%A2%84%E5%8F%91%E5%B8%83data-platform`）

**步骤：**

1. 确认 GitHub Actions 已把 `mcp-vX.Y.Z` 镜像推上（`winwin/lightdash-mcp:X.Y.Z`）。
2. 打开对应环境、对应线的 job，**写入 tag**（镜像版本号）→ 构建。
3. job 拉取 k8s-config 对应分支并 apply / 更新 Deployment 镜像后滚动更新。
4. 观察 Pod 滚动更新与 `/health`。
5. 失败时用上一版 tag 再发一次即可回滚（见 [§9](#9-回滚)）。

> 📷 **待补图 A**：Jenkins job 页面（填 tag / 构建按钮位置）
> `![Jenkins job](./images/jenkins-job.png)`

本地等价操作（不经过 Jenkins）：

```bash
cd k8s-config && git checkout pre        # 或 master
# 编辑 lightdash-mcp/lightdash-mcp.yml（或 lightdash-internal-mcp/lightdash-internal-mcp.yml）的 image tag
./utils/k8s-apply lightdash-mcp          # 内部按分支自动选 namespace：prod / tars-pre
kubectl -n pre rollout status deploy/lightdash-mcp
```

### 3.3 四套部署目标

| | 线上·外部品牌CT | 预发·外部品牌CT | 线上·内部 | 预发·内部 |
|---|---|---|---|---|
| 客户端 URL | `https://mcp-x.brandct.com/mcp` | `https://mcp-x.pre.banmahui.cn/mcp` | `https://mcp-lightdash.banmahui.cn/mcp` | `https://mcp-lightdash.pre.banmahui.cn/mcp` |
| Apisix hosts | `mcp-x.brandct.com`、`mcp.x.brandct.com` | `mcp-x.pre.banmahui.cn`、`mcp.x.pre.banmahui.cn` | `mcp-lightdash.banmahui.cn`、`mcp.lightdash.banmahui.cn` | `mcp-lightdash.pre.banmahui.cn`（`mcp.lightdash.pre…`） |
| K8s 目录 | `lightdash-mcp/` | `lightdash-mcp/` | `lightdash-internal-mcp/` | `lightdash-internal-mcp/` |
| Deployment | `lightdash-mcp` | `lightdash-mcp` | `lightdash-internal-mcp` | `lightdash-internal-mcp` |
| namespace | `prod` | `tars-pre` | `prod` | `tars-pre` |
| 集群内主站 | `http://lightdash.default:8080` | `http://lightdash:8080` | `http://lightdash-internal.default:8080` | `http://lightdash-internal:8080` |
| 主站清单 | `lightdash/` | `lightdash/` | `lightdash-internal/` | `lightdash-internal/` |
| 默认项目 | `LIGHTDASH_PROJECT_UUID`（品牌账号项目） | 同左 | `LIGHTDASH_PROJECT_UUID`（POS DB 项目） | 同左 |

> 域名一律**优先用连字符形式**（`mcp-x…` / `mcp-lightdash…`），点分旧名（`mcp.x…`）可能与通配证书不匹配。

---

## 4. 配置清单

### 4.1 MCP 服务（k8s-config：ConfigMap + SopsSecret）

| 变量 | 放哪 | 必填 | 说明 |
|---|---|---|---|
| `PORT` / `LIGHTDASH_MCP_HTTP_PORT` | ConfigMap | 否 | 监听端口，默认 `3333`；两者都设以前者为准 |
| `LIGHTDASH_SITE_URL` | ConfigMap | 是 | 集群内主站根（MCP 调 REST + 换票） |
| `LIGHTDASH_PUBLIC_SITE_URL` | ConfigMap | 否 | 浏览器打开用的公网根（拼 webUrl 用） |
| `LIGHTDASH_PROJECT_UUID` | ConfigMap | 建议 | 单项目入口的默认项目 |
| `LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET` | **Secret** | 是 | 与主站同名密钥一致；**勿**写进 ConfigMap |
| `LIGHTDASH_MAX_LIMIT` / `LIGHTDASH_MCP_LOG_LEVEL` | ConfigMap | 否 | limit 上限（默认 5000）/ 日志级别（默认 `info`） |
| OAuth 相关（`KEYCLOAK_REALM_URL` / `MCP_PUBLIC_URL` / `MCP_OAUTH_AUDIENCE` / `OAUTH_REQUIRED_SCOPES`） | ConfigMap | 按部署方式 | **本文不展开**，见 `feat/mcp-v2` 分支的 Keycloak 专题文档；本次若不走 OAuth 则不需要 |

**已废弃、勿再配**：`LIGHTDASH_API_KEY`、`MCP_OAUTH_ENABLED`、`OAUTH_INTROSPECT_URL`、`OAUTH_RESOURCE_METADATA_URL`。

### 4.2 Lightdash 主站

| 变量 | 放哪 | 必填 | 说明 |
|---|---|---|---|
| `LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET` | Secret（Sops） | 是 | 换票共享密钥；未配或不一致 → 换票 401 |
| `LIGHTDASH_MCP_PAT_TTL_SECONDS` | ConfigMap | 否 | 短期 PAT TTL，默认 `3600` |
| `LIGHTDASH_MCP_PAT_TTL_MAX_SECONDS` | ConfigMap | 否 | 上限，默认 `86400` |
| `ADMIN_API_HOST` / `ADMIN_API_KEY` | Secret/ConfigMap | **客户使用模式必需** | 看板白名单 RPC（见 [§6](#6-权限模型必读)） |
| `MCP_ENABLED` | — | **否** | 只管主站 EE 内置 `/api/v1/mcp`，与本服务无关 |

### 4.3 上线前必须补齐的已知缺口

| # | 缺口 | 影响 | 处理 |
|---|---|---|---|
| 1 | 生产（`master`）`lightdash-mcp` 仍为 `0.0.2`，**缺** OAuth 变量（`KEYCLOAK_REALM_URL` / `MCP_PUBLIC_URL` / `OAUTH_REQUIRED_SCOPES`） | 若本次走 OAuth，则无法登录 | 按 `feat/mcp-v2` 分支的 Keycloak 专题文档补齐；不走 OAuth 可跳过 |
| 2 | 生产 `lightdash-mcp` / `lightdash-internal-mcp` **缺** SopsSecret（预发已有 `lightdash-mcp-secret`） | 换票 401 | 新建 Secret 并挂 `secretRef` |
| 3 | 生产 Apisix `limit-req` 仍按 `key: http_x_api_key` | 若客户端不带该 header → 限流误伤全员 429 | 改为 `remote_addr` 或去掉插件 |
| 4 | 内部平台 MCP（`lightdash-internal-mcp`）预发/生产清单均未做 OAuth 改造 | 内部线无法用 OAuth 接入 | 同 #1 |
| 5 | 生产 Deployment 未挂 `secretRef` | 密钥不生效 | Deployment `envFrom` 增加 `secretRef` |

---

## 5. 关联关系

### 5.1 全链路

```mermaid
flowchart TD
  subgraph admin[admin 后台]
    cfg["看板配置<br/>dashboard_name / short_name / dashboard_uuid<br/>project_uuid / space_uuid / categories"]
    auth["用户看板授权<br/>（授权后落到项目角色 interactive_viewer）"]
  end
  subgraph dbt[数据侧]
    yml["hologres_analytices schema_*.yml<br/>meta.sql_filter:<br/>${lightdash.user.dashboardSlug} / ${lightdash.user.email}"]
    dim[("dim_ld_employee_categories<br/>category / email / short_name")]
  end
  subgraph ld[Lightdash 主站]
    proj[("projects.is_client_use<br/>客户使用模式（界面开启）")]
    role[("project_memberships.role<br/>viewer / interactive_viewer")]
    rpc["Admin RPC<br/>findAllDashboardByMobile(mobile)"]
    ctx["DashboardService<br/>getDashboardContexts /<br/>getAllowedDashboardUuidsForViewer"]
  end
  subgraph mcp[MCP 服务]
    resolver["dashboardContextResolver<br/>反查关联看板 → 权限过滤 → 选一个"]
  end

  cfg -->|short_name = 看板 slug| yml
  auth -->|白名单数据| rpc
  yml --> dim
  proj --> ctx
  role --> ctx
  rpc --> ctx
  ctx -->|"GET /dashboards/context"| resolver
  resolver -->|dashboardUuid| ctx
  ctx -->|dashboardUuid → dashboardSlug| yml
```

> 📷 **待补图 B**：admin 后台「看板配置 / 用户授权」界面
> `![admin 后台看板配置](./images/admin-dashboard-config.png)`

> 📷 **待补图 C**：dbt `sql_filter` 与看板的对应关系（截图或标注图）
> `![sql_filter 关联](./images/sql-filter-relation.png)`

### 5.2 关联主键：`short_name`

| 环节 | 系统 | 关联键 | 落点 |
|---|---|---|---|
| ① 看板登记 | admin 后台（brand-fe「马上赢X看板管理」） | `short_name` ↔ `dashboard_uuid` ↔ `project_uuid` / `space_uuid` ↔ `categories` | `BiDashboard.DashboardInfo` / `LightdashUserInfo` |
| ② 行级口径 | dbt（hologres_analytices） | `meta.sql_filter` 中的 `${lightdash.user.dashboardSlug}`、`${lightdash.user.email}` | `models/marts/*/schema_*.yml` |
| ③ 权限映射 | Lightdash 主站 | `projects.is_client_use` + 项目角色 + Admin RPC 白名单 | `DashboardService.getAllowedDashboardUuidsForViewer` |
| ④ 关系映射 | Lightdash 主站 | explore ↔ dashboard（看板磁贴里的图表） | `GET /api/v1/projects/:projectUuid/dashboards/context` |
| ⑤ 消费 | MCP 服务 | `dashboardUuid` → `dashboardSlug` → `lightdash.user` 上下文 | `dashboardContextResolver` |

dbt 侧典型写法：

```sql
${lightdash.user.dashboardSlug} = 'NA' or
EXISTS (
  SELECT 1
  FROM marts.dim_ld_employee_categories
  WHERE category = ${TABLE}.cls_2
    AND email = ${lightdash.user.email}
    AND short_name = ${lightdash.user.dashboardSlug}
)
```

- `dim_ld_employee_categories` 实际来源：`public.dim_lightdash_dashboard_employee_categories`。
- `short_name` = 看板 slug，与 admin 后台看板配置的 `short_name` 一一对应。
- `category` 对应 explore 上的类目维度（如 `${TABLE}.cls_2`）；`email` = 用户主邮箱。

### 5.3 两种「关联」

| 关联 | 方向 | 用途 | 载体 |
|---|---|---|---|
| **图表关联**（结构） | dashboard → chart → explore | 反查「哪些看板用了这张表 / 这个图表」 | 看板磁贴 `tiles[].properties.savedChartUuid` |
| **口径关联**（数据） | explore → dashboard（`sql_filter` 依赖 `dashboardSlug`） | 决定查询必须带哪个看板上下文 | dbt `meta.sql_filter` |

MCP 侧判断「口径关联」的方式：读编译后的 explore，检查 base table 的 `sqlWhere` / `uncompiledSqlWhere` 是否含 `dashboardSlug`。

### 5.4 口径一致性的三个必要条件

| 条件 | 满足方式 | 不满足的后果 |
|---|---|---|
| ① 上下文带对 | 查询带 `dashboardUuid`（显式传入 > MCP 反查自动选） | `dashboardSlug` 取默认 `'NA'` → `sql_filter` 首个分支为真 → **不按类目过滤，返回全量** |
| ② 候选不为空 | 该 explore/图表至少关联 1 个当前用户可见的看板 | MCP 返回 `dashboard_selection_required`（0 候选）或空结果 |
| ③ 候选在白名单内 | 客户使用模式 + viewer/interactive_viewer + RPC 命中 | 候选被过滤 → 与看板 UI 行数不一致 |

> ⚠️ 条件 ① 是**口径风险**而非报错：MCP 不带看板上下文查数会拿到比看板更宽的数据。建议客户侧默认显式传 `dashboardUuid`，或使用 `run_dashboard_tiles`（内部走 `/query/dashboard-chart`，天然带看板上下文）。

### 5.5 MCP 侧看板上下文解析流程

```mermaid
flowchart TD
  q[查询请求] --> hasUuid{"已传 dashboardUuid?"}
  hasUuid -->|是| use[后端解析 dashboardSlug → 注入 lightdash.user]
  hasUuid -->|否| need{"explore 依赖 dashboardSlug?"}
  need -->|否| plain[普通查询]
  need -->|是| rev["GET /dashboards/context<br/>(exploreName / chartUuid)"]
  rev --> perm["权限过滤：CASL + Space ∩ 客户白名单"]
  perm --> n{"候选数"}
  n -->|0| empty[返回空列表 / dashboard_selection_required]
  n -->|≥1| pick[选用 1 个（多候选随机 / 排序，需与运维约定一致）]
  pick --> use
  use --> res["返回结果 + resolvedDashboardContext（含 candidates）"]
```

---

## 6. 权限模型（必读）

### 6.1 三个必要条件

| 条件 | 字段 | 开启 / 说明 |
|---|---|---|
| ① 客户使用模式 | `projects.is_client_use`（项目级） | **在界面开启**（项目设置页开关）→ 落库 `projects.is_client_use`。**不开启则看板白名单整套逻辑不生效**，只走 CASL |
| ② 项目角色受限 | `project_memberships.role ∈ {viewer, interactive_viewer}` | 其他角色（editor/developer/admin）不收窄 |
| ③ Admin RPC 可用 | `ADMIN_API_HOST` + `ADMIN_API_KEY` | 未配置 → 不收窄（只 CASL）；RPC 失败 → 空集合 → **一张看板都看不到** |

> 条件 ① 的界面开关：
> 📷 **待补图 D**：客户使用模式开关位置（项目设置页）
> `![客户使用模式开关](./images/client-use-switch.png)`

> 当前 admin 后台做看板授权时，落库为**交互式查看者**（`interactive_viewer`），用户在组织内的角色是**成员**（`member`）。
> 组织角色「成员」本身**不产生**项目角色；项目角色必须由后台授权写入，否则条件 ② 不成立。

### 6.2 看板可见性判定顺序

```mermaid
flowchart TD
  req[看板 / 空间 / 搜索 / explore 列表请求] --> casl["CASL + Space 权限<br/>没有 view Dashboard 的丢掉"]
  casl --> cu{"项目 is_client_use?"}
  cu -->|否| vis[返回可见集合]
  cu -->|是| role{"项目角色 viewer / interactive_viewer?"}
  role -->|否| vis
  role -->|是| rpc{"ADMIN_API 已配置?"}
  rpc -->|否| vis
  rpc -->|是| mail["从主邮箱前缀取 mobile"]
  mail --> call["findAllDashboardByMobile(mobile)"]
  call --> inter["与关联看板取交集"]
  inter --> vis
```

该过滤在主站多个服务统一生效（`DashboardService`、`SpaceService`、`ProjectService`、`SearchService`、`ContentService`、`PinningService`）；**MCP 调用这些 REST 接口时天然继承**。

### 6.3 MCP 工具最低角色（组织角色 = 成员时）

| 工具组 | 最低项目角色 | 说明 |
|---|---|---|
| `get_site_info` / `get_lightdash_version` / `get_mcp_docs` / `get_my_access` | 无（认证即可） | `get_my_access` 返回组织角色 + 各项目有效能力 |
| `list_projects` / `list_spaces` / `find_content` / `find_dashboards` / `list_dashboards` / `find_charts` / `get_saved_chart` / `get_dashboard_tiles` / `list_charts` / `run_saved_chart` / `run_dashboard_tiles` / `list_explores` / `find_explores` / `find_fields` / `search_field_values` / `list_verified_content` | **查看者 viewer** | 客户使用模式下 explore / 看板列表已按白名单收窄 |
| `run_metric_query` / `run_semantic_metric_query` | **交互式查看者 interactive_viewer** | 需要 `view Explore` |
| `get_dashboard_code` | 编辑者 editor | `view ContentAsCode` |

### 6.4 上线前必须对客户讲清的三条

1. **只有客户使用模式的项目才会做看板级权限隔离**，普通项目下 viewer 能看到全项目看板。
2. **能不能查数取决于项目角色**：查看者只能看，交互式查看者才能 `run_*_query`。
3. **不传看板上下文时口径会变宽**（见 [§5.4](#54-口径一致性的三个必要条件)）。

---

## 7. 上线前置条件（Checklist）

### 7.1 代码与镜像

- [ ] MCP 包版本已 bump（`pnpm bump-mcp -- X.Y.Z`），与 tag `mcp-vX.Y.Z` 一致
- [ ] GitHub Actions `build-docker-mcp.yml` 构建成功，镜像仓出现 `:X.Y.Z` 与 `:latest`
- [ ] VPC 镜像仓（`registry-vpc…`）可见同一 tag
- [ ] 主站若本次有改动，已先发布并含 `POST /api/v1/mcp/token-exchange`

### 7.2 MCP 服务配置

- [ ] ConfigMap：`LIGHTDASH_SITE_URL` / `LIGHTDASH_PROJECT_UUID` / 公网根地址正确
- [ ] Secret：`LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET` 与主站一致
- [ ] Deployment 已挂 `secretRef`
- [ ] 无 `LIGHTDASH_API_KEY` 等废弃变量

### 7.3 主站

- [ ] 换票路由已上线（不依赖 `MCP_ENABLED`）
- [ ] 主站 Secret 含 `LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET`
- [ ] `ADMIN_API_HOST` / `ADMIN_API_KEY` 已配置（客户使用模式项目）
- [ ] 目标项目**已在界面开启客户使用模式**（`projects.is_client_use = true`）

### 7.4 网关

- [ ] 证书覆盖实际主机名（优先连字符域名）
- [ ] Apisix 限流不再依赖 `http_x_api_key`

### 7.5 数据与账号

- [ ] 客户账号在 admin 后台已授权看板，且**主邮箱**与登录邮箱一致
- [ ] 用户已加入组织，项目角色为 viewer / interactive_viewer
- [ ] dbt `sql_filter` 用的 `short_name` 与 admin 后台看板配置一致

---

## 8. 验收清单

### 8.1 基础设施

| # | 检查 | 期望 |
|---|---|---|
| 1 | `GET /health` | `ok=true`、`package=@lightdash/mcp*` |
| 2 | 客户端接入 | 未认证被拒；认证后可调 `list_projects` |
| 3 | 换票密钥 | 主站与 MCP 一致 |
| 4 | 镜像 | Pod 运行的镜像 tag = 本次发布 tag |
| 5 | Apisix 限流 | 不依赖 `http_x_api_key` |

### 8.2 业务与权限（用客户账号跑）

| # | 场景 | 期望 |
|---|---|---|
| 1 | 客户账号接入 MCP | 登录成功并调 `list_projects` 成功 |
| 2 | `get_my_access`（带 `projectUuid` + `includeExplores=true`） | 组织角色=成员；项目角色=interactive_viewer；`queryable` 含目标看板所用 explore |
| 3 | `list_dashboards` | 只返回**已授权**看板（白名单生效） |
| 4 | `find_explores` / `list_explores` | 只返回白名单看板用到的表 |
| 5 | `run_dashboard_tiles` | 数据与看板 UI 一致（自动带看板上下文） |
| 6 | `run_semantic_metric_query` 不带 `dashboardUuid`（explore 依赖 `dashboardSlug`） | 返回 `resolvedDashboardContext` + `candidates`；0 候选返回 `dashboard_selection_required` |
| 7 | 同一查询带 `dashboardUuid` 重试 | 行数与看板 UI 一致 |
| 8 | 未授权账号 | 看不到授权看板；`run_metric_query` 拒绝非 `queryable` 表 |

> 📷 **待补图 E**：客户端接入与查询效果截图（MCP 问数 vs 看板 UI）
> `![客户端接入效果](./images/mcp-client-usage.png)`

### 8.3 关联关系专项

| # | 场景 | 期望 |
|---|---|---|
| 1 | 看板 A（`short_name=A`）的图表经 MCP 查数 | `lightdash.user.dashboardSlug = A` 生效，行数与看板一致 |
| 2 | 同一 explore 关联多个看板 | 返回 `candidates`（已按权限过滤）；显式传 `dashboardUuid` 可复现指定看板口径 |
| 3 | dbt 改名 / 新增 `short_name` | 与 admin 后台看板配置、RPC 白名单三处对齐，否则看板与 MCP 数据不一致 |

---

## 9. 回滚

| 场景 | 操作 |
|---|---|
| MCP 服务异常 | 用上一版 tag 走同一 Jenkins 发布流程（或 `rollout undo`）；客户端 URL 不变，无需改配置 |
| 主站换票异常 | 先回滚主站；MCP 侧表现为登录后调用 500/401 |
| 口径异常 | 回滚 dbt 版本；或让调用方显式传 `dashboardUuid` 绕过自动反查 |
| 权限异常（该看的不该看 / 该不该看的看不到） | 先查客户使用模式开关、项目角色、`ADMIN_API_*`、用户主邮箱；确需临时放宽才把 `is_client_use` 置 false（**放宽，慎用，需同步安全**） |

---

## 10. 排障速查

| 现象 | 常见原因 | 排查 |
|---|---|---|
| 客户端连不上 / 证书错误 | 主机名与证书不匹配 | 用连字符域名；`curl -I https://…/mcp` |
| 401（未带凭证） | 正常（未认证） | 看响应头提示 |
| 401（验签失败） | 公网根 URL 与 audience 不一致；JWT `iss/aud` 不匹配 | 见 `feat/mcp-v2` 分支的 Keycloak 专题文档 |
| 500（登录后） | 换票失败：密钥不一致 / 主站未发版 / Secret 未挂载 | 主站日志 `McpTokenExchangeService`；比对两处密钥；检查 Deployment `secretRef` |
| 能登录但查不到数 | 项目角色是 viewer（不是 interactive_viewer） | `get_my_access` 看能力 |
| 能查但看不到目标看板 | 未开启客户使用模式 / RPC 未配置 / 邮箱前缀取不到 mobile | 查项目开关、`ADMIN_API_*`、用户主邮箱 |
| 看板有数据 MCP 没数据（或相反） | 未带 `dashboardUuid` → `sql_filter` 走 `'NA'` 分支 | 显式传 `dashboardUuid`，或用 `run_dashboard_tiles` |
| MCP 与看板行数不一致 | `short_name` 三处（admin 后台 / dbt / RPC 白名单）不对齐 | 逐一对齐 |
| Pod 起来但 `/health` 503 | 必填环境变量缺失 | 日志会列出 `missingEnv`；改 ConfigMap/Secret 后重建 Pod |
| 429 频繁 | Apisix `limit-req` 仍按 `http_x_api_key` | 改 `remote_addr` 或去掉插件 |

---

## 11. 待确认事项（TBD）

1. **Jenkins job 参数形态**：已确认外部品牌CT线两个入口（生产 `data-platform/lightdash-mcp`、预发 `预发布data-platform/lightdash-mcp`）；还需确认：① job 是「参数化填 tag」还是「拉 k8s-config 分支自动 apply」？② **内部线**对应哪个 job（是否为 `lightdash-mc`）？③ 主站 Lightdash 的发布 job 在同一目录下的哪个名字？
2. **上线时间与负责人**：发布窗口、各环节责任人（[§2](#2-系统与职责) 待补）。
3. **admin 后台授权写入路径**：admin 后台把授权落成「交互式查看者」的具体接口/服务是哪个？与 Lightdash 侧 `findAllDashboardByMobile` 是否同一套数据源？
4. **组织角色 vs 项目角色**：客户账号是否统一「组织=成员 + 项目=交互式查看者」？
5. **口径风险处置**：是否对「依赖 dashboardSlug 且未传 dashboardUuid」的查询强制先选看板（返回 `dashboard_selection_required` 而非直接跑数）？
6. **多候选策略**：目前多候选时随机选用——是否改为确定性排序（按 name→slug→uuid）以便复现？
7. **客户账号开通**：走 `POST /api/v1/org/admin/users/provision(/batch)`（OIDC 绑定）还是旧邀请流程？
8. **可观测性**：MCP 是否接日志/告警（当前仅 stderr）；主站换票成功率是否需要看板。
9. **客户使用模式开关的界面位置**：需补图 D 并在正文标注入口路径（当前仅确认「界面开启」，落库 `projects.is_client_use`）。

---

## 12. 附录

### 12.1 待补图片清单

| 编号 | 内容 | 建议位置 | 文件名 |
|---|---|---|---|
| A | Jenkins job 页面（填 tag / 构建按钮） | [§3.2](#32-jenkins-发布关键) | `images/jenkins-job.png` |
| B | admin 后台「看板配置 / 用户授权」界面 | [§5.1](#51-全链路) | `images/admin-dashboard-config.png` |
| C | dbt `sql_filter` 与看板对应关系标注 | [§5.1](#51-全链路) | `images/sql-filter-relation.png` |
| D | 客户使用模式开关（界面位置） | [§6.1](#61-三个必要条件) | `images/client-use-switch.png` |
| E | 客户端接入与查询效果（MCP vs 看板 UI） | [§8.2](#82-业务与权限用客户账号跑) | `images/mcp-client-usage.png` |
| F | 四套部署目标域名与入口总览 | [§3.3](#33-四套部署目标) | `images/mcp-endpoints-overview.png` |

> 图片统一放在 `docs/mcp/images/`，补图后请同步本清单状态。

### 12.2 关键接口

| 接口 | 用途 |
|---|---|
| `POST /api/v1/mcp/token-exchange` | MCP → 主站换票（共享密钥 + email → 短期 PAT） |
| `GET /api/v1/projects/:projectUuid/dashboards/context` | 反查 explore/chart 关联看板（已带权限过滤） |
| `POST /api/v1/org/admin/users/provision(/batch)` | 组织管理员开通 OIDC 用户 |
| `GET {MCP_PUBLIC_URL}/.well-known/oauth-protected-resource` | OAuth 受保护资源元数据 |
| `GET /health` | MCP 健康检查 |

### 12.3 关键路径

| 路径 | 说明 |
|---|---|
| `packages/lightdash-mcp/`（v2：`packages/lightdash-mcp-v2/`） | MCP 服务源码与 Dockerfile |
| `.github/workflows/build-docker-mcp.yml` | MCP 镜像构建（tag `mcp-v*`） |
| `.github/workflows/build-docker-with-i18n.yml` | 主站镜像构建（tag `v*`） |
| `scripts/bump-versions.mjs` | `pnpm bump-mcp -- X.Y.Z` |
| `k8s-config/lightdash-mcp/`、`lightdash-internal-mcp/` | MCP 部署清单（分支 `pre` / `master`） |
| `k8s-config/lightdash/`、`lightdash-internal/` | 主站部署清单与 Secret |
| `packages/backend/src/services/McpTokenExchangeService.ts` | 换票服务 |
| `packages/backend/src/services/DashboardService/DashboardService.ts` | 看板白名单与关联看板 |

### 12.4 相关仓库

| 仓库 | 作用 |
|---|---|
| `lightdash-i18n`（本仓） | MCP 服务 + Lightdash 主站 |
| `k8s-config` | 部署清单 / Secret / Apisix |
| `brand-fe` | admin 后台前端（看板配置与授权界面） |
| `winwin-report` | admin 后台服务（`findAllDashboardByMobile` 等 JSON-RPC） |
| `hologres_analytices` | dbt 语义层与 `meta.sql_filter`（看板口径与行级权限） |

---

*文档版本：v0.2（草稿）· 维护人：待填*
