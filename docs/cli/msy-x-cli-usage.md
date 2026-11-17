# msy-x-cli 使用手册

> 适用版本：0.1.0　｜　运行时：Node.js ≥ 20
>
> 本文是自包含的使用说明，不依赖任何内部文档。命令与接口的完整契约（入参映射、输出结构、退出码定义）由设计文档单独提供。

---

## 1. 安装

```bash
npm i -g https://img0.banmahui.cn/msy-x/cli/msy-x-cli/0.1.0/msy-x-cli-0.1.0.tgz

msy-x --version     # 期望输出单行：msy-x 0.1.0
msy-x --help
```

| 项 | 说明 |
|---|---|
| 包名 / 可执行名 | `msy-x-cli` / `msy-x` |
| 升级 | 用新版本地址再执行一次 `npm i -g`（覆盖安装） |
| 卸载 | `npm uninstall -g msy-x-cli` |
| 完整性校验 | 同目录有 `<tgz>.sha256`：`sha256sum -c msy-x-cli-0.1.0.tgz.sha256` |
| 自定义 npm 源 | 安装命令可加 `--registry https://registry.npmjs.org` |

---

## 2. 登录（两种方式，任选其一）

### 2.1 OAuth（推荐个人使用）

```bash
msy-x auth login
```

流程：CLI 在本机起一个只绑 `127.0.0.1` 的临时回调 → 打开系统默认浏览器 → 你在页面上登录并点「授权」→ CLI 收到回调、换取令牌并保存 → 退出码 `0`。

要点：

- **阻塞式**：进程会一直等到成功 / 拒绝 / 超时（默认 300 秒，可用 `--timeout` 调整），不需要你回终端按回车。
- **无桌面环境**（WSL / SSH / 容器）：

  ```bash
  MSY_X_NO_BROWSER=1 msy-x auth login
  ```

  它会把授权链接打印到 stderr，复制到浏览器打开即可。**必须让该进程留在前台等待**——不要加 `timeout`、不要 Ctrl-C，否则回调端口关闭，本次登录作废。
- 失败不留痕：授权被拒、超时、网络失败都不会写入半截凭证。
- 令牌有效期：access 1 小时、refresh 2 周；日常调用遇 401 会自动刷新一次再重试。

### 2.2 个人访问令牌（PAT：CI、服务账号、回调不通时）

在站点右上角个人设置 → Personal access token → 新建，复制一次性显示的 `ldpat_` 开头的令牌。

```bash
# 写入本地配置（文件权限 0600）
msy-x auth login --token ldpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 或者完全不落盘（CI 推荐）
export MSY_X_PAT=ldpat_...
msy-x info
```

PAT 的权限等于该用户本身，不受 OAuth scope 限制。

### 2.3 查看状态与登出

```bash
msy-x auth status        # 单行 JSON，logged_in 是第一个键；已登录/未登录都退 0
msy-x auth logout        # 吊销并删除本地凭证；可重复执行
msy-x doctor             # 本地自检：Node 版本、配置与权限位、站点解析、凭证状态（不打印令牌）
msy-x doctor --remote    # 追加真实验证：工具名单 + 服务端能力探测
```

`auth status` 只做本地离线判断（凭证存在且未过期，或存在 refresh token），所以断网不会误报「未登录」。

### 2.4 凭证存放位置

```
~/.config/msy-x/config.yaml        # 目录 0700、文件 0600
```

- Windows：`%APPDATA%\msy-x\`
- 可用 `MSY_X_CONFIG=/path/to/config.yaml` 改位置（共享机器建议指到个人目录）
- 任何命令都不会把令牌打到终端；`--verbose` 输出也做脱敏

---

## 3. 站点切换（多环境）

### 3.1 常用站点

| 站点 | MCP 地址 | 默认鉴权 |
|---|---|---|
| 品牌站（默认，代号 `x`） | `https://x.brandct.com/api/v1/mcp` | OAuth |
| 内部站（代号 `inner`） | `https://lightdash.banmahui.cn/api/v1/mcp` | PAT |
| 品牌站预发 | `https://x.pre.banmahui.cn/api/v1/mcp` | OAuth / PAT |
| 旧版独立服务（仅逃生口） | `https://mcp-x.brandct.com/mcp` | `x-api-key` |

### 3.2 切换与临时指定

```bash
msy-x site list                                   # 列出配置里的站点与当前站点
msy-x site show                                   # 当前站点详情
msy-x site use inner                              # 切换当前站点（写入配置）
msy-x site use https://x.pre.banmahui.cn/api/v1/mcp   # 也可以直接给 URL

# 只对单条命令生效，不改配置
msy-x --site https://x.pre.banmahui.cn/api/v1/mcp info
msy-x --mcp-url https://x.pre.banmahui.cn/api/v1/mcp info
```

**凭证按站点隔离**：在品牌站登录不会让内部站也登录；切换后先跑一次 `msy-x auth status` 确认。

### 3.3 环境变量（覆盖配置，不写回）

| 变量 | 作用 |
|---|---|
| `MSY_X_SITE_URL` | 站点根地址（自动拼 `/api/v1/mcp`） |
| `MSY_X_MCP_URL` | 直接给完整 MCP 地址（优先级更高） |
| `MSY_X_PAT` | 用 PAT 鉴权 |
| `MSY_X_ACCESS_TOKEN` | 直接给 OAuth access token（CI 用） |
| `MSY_X_CONFIG` | 配置文件路径 |
| `MSY_X_NO_BROWSER` | `1` 时只打印授权链接 |
| `MSY_X_TIMEOUT_MS` | 单次调用超时（默认 60000，上限 600000） |
| `MSY_X_DEBUG` | `1` 时等价于 `--verbose` |

优先级：`--mcp-url` > `--site <url>` > `--site <名字>` > `MSY_X_MCP_URL` > `MSY_X_SITE_URL` > 配置里的当前站点。

### 3.4 旧版独立服务（不推荐）

```bash
msy-x --mcp-url https://mcp-x.brandct.com/mcp --auth-header x-api-key auth login --token ldpat_...
```

旧版服务按「服务端令牌统一代执行」，权限与审计粒度都弱于新版；能改地址就改。

---

## 4. 项目上下文

服务端按四级顺序解析项目：**命令里显式指定的 `projectUuid` → 用户默认项目 → 组织默认项目 → 部署默认项目**。

```bash
msy-x project list                       # 我可见的项目
msy-x project use 3667f682-4080-44a4-8364-49f405936e09   # 写服务端默认项目（跨设备生效）
msy-x project show                       # 当前默认项目 + 来源（user/organization/server default）

msy-x --project 3667f682-4080-44a4-8364-49f405936e09 access   # 只对本次命令生效
```

自动化场景建议**每条命令都显式带 `--project`**：默认项目可能因项目被删或权限回收而失效。

---

## 5. 常用命令

> 所有命令的 `--help` 都带一条可直接改用的示例。下面的表名来自真实看板：品类宝用 `pinleibaohsm_*`，品类洞察用 `cls_insight_*`。

### 5.1 查数五步

```bash
# ① 找表（过滤键叫 exploreName）
msy-x explores list --search pinleibaohsm

# ② 找字段，拿 fieldId
msy-x fields find 销售额 --explore pinleibaohsm_cls_top

# ③ 核对维度真实取值（区域要写「华南地区」，不是「华南」）
msy-x values pinleibaohsm_cls_top_period --table pinleibaohsm_cls_top --search 2026Q2

# ④ 查数（语义查询，推荐）
msy-x query -e pinleibaohsm_cls_top \
  --dimensions cls_4 \
  --metrics pinleibaohsm_cls_top_total_cls4_amount \
  --filter period=2026Q2 --filter region_name=华南地区 \
  --limit 20

# ④' 也可以用 Explorer 导出的 metricQuery JSON
msy-x query --file metric-query.json
```

注意：

- 品类宝请用 `pinleibaohsm_*`，不要用 `ads_pinleibao_*`（另一套口径）；品类洞察不要用带 `_ai` 后缀的表。
- `values` 需要 `--table`（服务端要求该参数）。
- `query --file` 会在本地把 Explorer 的 `metricQuery` 翻译成服务端入参；`sorts` / `tableCalculations` 等不支持的字段会被丢弃并在 stderr 提示。
- `query flat`（扁平风格）是实验入口，目标站点镜像未升级时会报 `Invalid literal value`，此时改用 `query`。

### 5.2 内容、看板与图表

```bash
msy-x search 品类洞察                        # 混合搜索
msy-x search 品类 --type dashboard           # 只搜看板
msy-x spaces list                            # 空间列表（无层级参数）

msy-x dashboards find 品类洞察
msy-x dashboards tiles 5ad107a4-81d1-4ded-a173-ff41366122b4
msy-x dashboards run 5ad107a4-81d1-4ded-a173-ff41366122b4 --limit 50
msy-x dashboards get d54853b1-85df-4ab3-8cdf-70a5244640e1 --full

msy-x charts list --dashboard d54853b1-85df-4ab3-8cdf-70a5244640e1
msy-x charts get <chartUuid> --full          # chartUuid 先由 charts find 拿到
msy-x charts run <chartUuid> --value-format formatted
```

注意：

- `dashboards list` 的 `--space` 是**必填**的空间 UUID（先 `spaces list`）；不知道空间时用 `search --type dashboard`。
- `dashboards run --tile <slug>` 只是**本地过滤展示**，服务端仍然会跑整块看板。
- `verified` 在站点未启用「内容验证」时原样输出服务端提示并退 `0`。

### 5.3 元信息与透传

```bash
msy-x info                     # 站点 + 版本 + 当前项目（三个工具，输出单个合并 JSON 对象）
msy-x access                   # 组织角色与各项目能力
msy-x access --explores        # 追加可查表名单（体积较大）
msy-x docs query_workflow      # 服务端内置使用文档
msy-x tools list --verbose     # 工具目录（含参数 schema）
msy-x tools describe run_semantic_metric_query

msy-x call get_site_info --args '{}'                     # 任意工具透传
msy-x call run_semantic_metric_query --file query.json
```

`call` 的 `--args` 是**工具入参**；`--json` / `--table` / `--csv` 是**输出格式**，两者互不影响。

---

## 6. 输出、格式与调试

| 选项 | 作用 |
|---|---|
| 默认 | 输出到终端 → ASCII 表格；**通过管道 / 被 agent 调用 → JSON** |
| `--json` / `--table` / `--csv` | 显式指定格式。`--csv` 仅数据类命令支持（`query`、`query flat`、`charts run`、`dashboards run`） |
| `--envelope` | JSON 外层包 `{ok,tool,data,meta:{site,projectUuid,durationMs}}` |
| `--out <path>` | 结果写文件（0600），stdout 只回摘要：单调用 `{"written","rows","bytes"}`，多调用 `{"written","calls","bytes"}` |
| `--verbose` | stderr 打印请求/响应摘要：`→ <工具> <参数>`（脱敏、超 500 字符截断）与 `← <工具> ok rows=N <ms>ms source=<…>` |
| `--raw` | 解析失败时把原始响应打到 stderr |
| `--dry-run` | 只打印将要发送的 `{tool,args}`，不建连、不发请求 |
| `--quiet` | 关闭 stderr 的 `rows: N`、截断告警等提示（不影响 `--verbose`） |

约定：**stdout 只有数据**，提示与错误一律走 stderr。返回非表格文本的工具（文档 markdown、XML 片段）在 JSON 模式下是 `{"text":"…"}`。

---

## 7. 退出码与错误

| 码 | 含义 |
|---|---|
| `0` | 成功（含 0 行；`verified` 站点未启用也算成功） |
| `2` | 用法 / 参数 / 本地配置错误 |
| `3` | 未登录或 401（已自动刷新一次仍失败） |
| `4` | 无权限，或被看板门控 |
| `5` | 服务端 / 协议 / 工具内部错误 |
| `6` | 网络或超时（含 DNS、连接拒绝、非法端口） |
| `7` | 结果解析失败（配合 `--raw` 看原始响应） |

错误统一为 stderr 单行 JSON：

```json
{"error":{"code":"AUTH_REQUIRED","message":"未登录或凭证已失效","hint":"运行 msy-x auth login 重新登录"}}
```

站点开启强制看板模式时，`code` 是服务端原值，并附 `detail`：

```json
{"error":{"code":"dashboard_selection_required",
 "message":"该表关联多张看板，请指定要使用的看板",
 "hint":"重试时传 dashboardUuid\n- d54853b1-… 品类宝（HSM）\n- 5ad107a4-… 品类洞察(MSY150均衡模型）\n重试时用 --dashboard <dashboardUuid> 从上面候选中指定一个",
 "detail":{"action":"select_dashboard",
   "candidates":[{"dashboardUuid":"d54853b1-…","dashboardName":"品类宝（HSM）"}],
   "contact":"请联系客服开通看板访问权限。"}}}
```

五类取值：`dashboard_permission_required`、`dashboard_configuration_required`、`dashboard_selection_required`、`dashboard_not_found`、`dashboard_context_unavailable`，都退 `4`；按 `detail.candidates` 选一个加 `--dashboard` 重试即可。

---

## 8. 排错

| 现象 | 原因与处理 |
|---|---|
| `AUTH_REQUIRED`（退 3） | 未登录或凭证过期：`msy-x auth login`；CI 里用 `MSY_X_PAT` |
| 浏览器打开授权页后 CLI 一直等 | 本机回环回调没通：WSL 里确认 Windows 能访问 `127.0.0.1:<端口>`；或改用 PAT；不要用 `timeout` 跑登录 |
| `FORBIDDEN`（退 4） | 该用户在该项目无权限，或 OAuth 令牌缺 `mcp:read`：用 `msy-x access` 看能力，或换 PAT |
| `dashboard_*`（退 4） | 站点开了强制看板模式：按 `detail.candidates` 加 `--dashboard` |
| 参数写了却没生效 | MCP 会**静默丢弃未知键**：用 `--verbose`（或 `--dry-run`）看实际发出的 `args`，键名以 `msy-x tools describe <tool>` 为准 |
| `Invalid literal value, expected "run_metric_query"` | 目标站点镜像缺少对应修复：改用 `query`（语义查询），或升级站点；`msy-x doctor --remote` 会明确报这一项 |
| 超时（退 6） | 慢查询：`--timeout 300000`；大结果用 `--out` 落盘 |
| 结果刷屏 | `--limit` + `--out`；agent 场景优先 `--json` |
| 表格列被截断 | 单列上限 40 字符；需要全量请用 `--json` 或 `--out` |

---

## 9. 给脚本与智能体的三条约定

1. **非 TTY 默认 JSON**，可直接 `JSON.parse(stdout)`；
2. 用**退出码**（0/2/3/4/5/6/7）加 stderr 的 `error.code` 做分支，不要匹配中文文案；
3. 大结果用 `--out`，stdout 只留摘要，避免明细灌进上下文。

豆包 CLI 连接器使用的就是这份二进制与同一套命令，平台只需五条：`install`、`versionCheck`、`auth login`、`auth status`、`auth logout`（外加 `help`）。
