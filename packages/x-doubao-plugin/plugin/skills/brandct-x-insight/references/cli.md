# CLI 通道速查（msy-x）

`msy-x` 是跑在终端里的 MCP 客户端：子命令即 MCP 工具。本文件供技能在「CLI 通道」下使用；
通道选择与失败路由见 `SKILL.md` 的「CLI 通道」小节。命令与 flag 均以 `msy-x <命令> --help` 为准。

## 1. 契约命令（豆包连接器用，agent 也可直接调）

| 命令 | stdout | 退出码 |
|---|---|---|
| `msy-x --version` | `msy-x <semver>` 单行 | `0` |
| `msy-x --help` | 帮助（无副作用） | `0` |
| `msy-x auth login` | `{"logged_in":true,"site":"x","authMode":"oauth","mode":"login"}` | `0` 成功；`2` 本地错误；`3` 授权失败/超时；`6` 网络 |
| `msy-x auth status` | 单行 JSON，`logged_in` 必为首键：`{"logged_in":true,...}` / `{"logged_in":false,...}` | 已登录与未登录**都 `0`**（靠 `logged_in` 区分），本地读失败 `2` |
| `msy-x auth logout` | `{"logged_out":true,"site":"x"}` | 幂等 `0` |

`auth login` 默认 OAuth：自动拉起浏览器授权，阻塞到终态（成功 / 拒绝 / 超时），绝不等待 stdin。
`auth login --token <pat>` 走 PAT（内部站 / CI）。`auth status` 纯本地离线判定，断网不会误报「未登录」。

## 2. 命令表

| 命令 | 作用 | 对应 MCP 工具 |
|---|---|---|
| `msy-x site list` / `site use <name>` | 多站点管理：列出 / 切换当前站点（本地 config，不发请求） | 本地 config |
| `msy-x info` | 站点、版本、当前项目一览。一次顺序调用 3 个工具，stdout 是**单个合并 JSON 对象**（键为工具名：`get_site_info` / `get_lightdash_version` / `get_current_project`，`JSON.parse(stdout)` 可直接解析）；`--out` 把该对象一次写盘，stdout 只回 `{"written":…,"calls":3,"bytes":N}` | `get_site_info` + `get_lightdash_version` + `get_current_project` |
| `msy-x project list` / `project use <uuid>` / `project show` | 项目列表 / 切换（写服务端默认项目）/ 查看 | `list_projects` / `set_project` / `get_current_project` |
| `msy-x access [--explores]` | 我的组织角色与各项目权限（`--explores` 附带每项目可用表） | `get_my_access` |
| `msy-x explores list [--search <q>] [--page <n>] [--page-size <n>]` | 按表名过滤列出的表（**没有 `explores find` 子命令**） | `list_explores` |
| `msy-x explores show <exploreName>` | 查看指定表详情（v2 语义：必填表名，非关键词搜表） | `find_explores` |
| `msy-x fields find <query> --explore <name>` | 在**指定表**内按字段标签搜索字段（`--explore` 必填；fieldId 决定维度 / 指标） | `find_fields` |
| `msy-x values <fieldId> --table <table>` | 看某维度的真实取值（`--table` 必填；`--search <s>` 可选过滤） | `search_field_values` |
| `msy-x search <query> [--type chart\|dashboard\|space]` | 全局搜内容（无 `--type` 走全类型混合搜索） | `find_content` / `find_charts` / `find_dashboards` / `find_spaces` |
| `msy-x spaces list [--page <n>] [--page-size <n>] [--full]` | 列出项目下的 space（**无层级，没有 `--parent`**） | `list_spaces` |
| `msy-x spaces find <query>` | 按关键词搜索 space | `find_spaces` |
| `msy-x dashboards list --space <spaceUuid>` | 列出指定 space 内的看板（`--space` 必填，值是 **spaceUuid**；不知道 uuid 先 `msy-x search <q> --type space`） | `list_dashboards` |
| `msy-x dashboards find <query>` / `tiles <uuid>` / `run <uuid> [--tile <slug>] [--csv]` | 看板：搜索 / 磁贴布局（不执行查询）/ 批量跑磁贴（`--tile` 只过滤展示，服务端仍执行整板） | `find_dashboards` / `get_dashboard_tiles` / `run_dashboard_tiles` |
| `msy-x dashboards get <dashboardUuid>` | 查看**看板定义 JSON**（不是 as-code 导出；`--full` 含过滤、参数、tab 与磁贴原始定义） | `get_dashboard_code` |
| `msy-x charts list --dashboard <uuid>` / `find <q>` / `get <uuid>` / `run <uuid> [--dashboard <uuid>] [--csv]` | 图表：列表（`--dashboard` 必填）/ 搜索 / 详情 / 取数 | `list_charts` / `find_charts` / `get_saved_chart` / `run_saved_chart` |
| `msy-x query -e <explore> --dimensions a,b --metrics x,y [--filter f=v] [--limit N] [--dashboard <uuid>]` | 语义取数（CLI 组装 v2 参数；`--filters-json` 传复杂条件） | `run_semantic_metric_query` |
| `msy-x query --file <path\|->` | 从 Explorer metricQuery JSON **本地翻译**成 v2 参数再发（不是原样透传；v2 不支持的 `sorts` / `tableCalculations` / `customDimensions` 会**丢弃并在 stderr 告警**） | `run_semantic_metric_query` |
| `msy-x query flat --dimensions a --metrics x [--sort f:desc] [--limit N]` | （实验）`run_metric_query` 原始表查询：vizConfig 入参、CSV 返回；依赖服务端判别键修复，未修复的镜像会退 5 并给替代路径 hint | `run_metric_query` |
| `msy-x doctor [--remote] [--json]` | 自检本地配置与凭证；`--remote` 加做真实连通与服务端能力验证 | `initialize` + `tools/list` + 探测 |
| `msy-x tools list [--verbose]` / `describe <name>` | 列出 / 描述可用工具（本地目录；`--verbose` 附输入 schema） | `tools/list` |
| `msy-x call <tool> [--args '<obj>' | --file <path>]` | 逃生口：任意工具透传（新工具无需等 CLI 发版；`--args` 是**工具入参** JSON，全局 `--json` / `--table` 才是输出格式） | 任意 `tools/call` |
| `msy-x docs [topic] [--text]` | 查看 MCP 使用文档（markdown；`--text` 纯文本） | `get_mcp_docs` |

常用全局选项：`--site <name|url>`、`--project <uuid>`、`--json/--table/--csv`、`--envelope`、
`--out <path>`（大结果落盘，stdout 只回摘要）、`--timeout <ms>`、`--dry-run`（只打印将要发送的
`{tool, arguments}`，排障用，不发请求）、`--config <path>`、`--mcp-url <url>`。

## 3. 参数示例（真实表名）

```bash
# 1) 找表：品类宝 HSM 前缀是 pinleibaohsm_（不要用 ads_pinleibao_*）
msy-x explores list --search pinleibaohsm

# 2) 找字段：fieldId 一律以 fields find 返回为准，不要凭记忆拼（--explore 必填）
msy-x fields find 销售额 --explore pinleibaohsm_cls_top

# 3) 取数：2026Q2 华南 · 调味品 · 四级类目销售额（表 pinleibaohsm_cls_top）
msy-x query -e pinleibaohsm_cls_top \
  --dimensions pinleibaohsm_cls_top_cls_4 \
  --metrics pinleibaohsm_cls_top_total_cls4_amount \
  --filter pinleibaohsm_cls_top_period=2026Q2 \
  --filter pinleibaohsm_cls_top_region_name=华南地区 \
  --filter pinleibaohsm_cls_top_cls_2=调味品 \
  --limit 100

# 4) 品类洞察表 cls_insight_list（全国口径、无区域字段），
#    x 站开了看板门控，必须带正式看板 UUID
msy-x query -e cls_insight_list \
  --dimensions cls_insight_list_cls_4 \
  --metrics cls_insight_list_total_cls4_amount,cls_insight_list_total_cls4_yoy \
  --filter cls_insight_list_period=2026Q2 \
  --filter cls_insight_list_cls_2=调味品 \
  --dashboard 5ad107a4-81d1-4ded-a173-ff41366122b4

# 5) 直接跑看板磁贴里的图表
msy-x dashboards tiles 5ad107a4-81d1-4ded-a173-ff41366122b4
msy-x charts run <chartUuid> --dashboard 5ad107a4-81d1-4ded-a173-ff41366122b4 --csv

# 6) 大结果落盘（stdout 只回 {"written":...,"rows":N,"bytes":M}）
msy-x query -e pinleibaohsm_cls_top --dimensions pinleibaohsm_cls_top_cls_4 \
  --metrics pinleibaohsm_cls_top_total_cls4_amount --limit 500 --csv --out /tmp/cls4.csv

# 7) 排障
msy-x doctor --remote
msy-x query -e cls_insight_list --metrics cls_insight_list_total_cls4_amount --dry-run
```

注意：

- `--filter fieldId=value` 多次传即 AND；多值 `a,b` 按 equals；复杂条件用 `--filters-json` 或 `--file`。
- 复刻看板 TOP N 时**不要传 `--sort`**（服务端排序不稳定），`--limit` 拉全量后自行排序。
- 默认不传 `--limit`；用户要明细时才传并明确告知条数。
- `--page-size` 上限 100，超过会被本地截断到 100（stderr 告警，`--quiet` 关闭）。

## 4. 输出契约

- **非 TTY 下 stdout 只有 JSON 数据**：表格颜色、进度、提示、错误全走 stderr；agent 只解析 stdout（`doctor` 同口径：非 TTY 默认 JSON）。
- 默认输出工具返回的**数据体本身**（解析后的 JSON：保留 `pagination` / `results` 等顶层键）；
  工具返回 CSV 文本时（如 `query flat`）输出 `{csv, rows}` 包装。
- 返回 XML / Markdown 等非表格文本的工具（`find_explores` / `find_fields` / `docs`）：
  JSON 模式输出 `{"text":"…"}`；表格模式原样输出文本并在 stderr 提示「该工具返回非表格文本」。
- 结构化内容（`structuredContent`）原样输出；`--envelope` 时包一层 `{ok, tool, data, meta}`，
  `data` 即数据体，`meta` 含 `site` / `projectUuid`（未指定为 `null`）/ `durationMs`。
- 多工具命令（`info`）：stdout 是**单个合并 JSON 对象**（键为工具名，按调用顺序）；
  `--out` 一次写盘不覆盖，stdout 只回 `{"written":…,"calls":3,"bytes":N}`。
- 结果里的 `webUrl` 可直接给用户跳转网页版。
- 错误输出（stderr，单行 JSON）：`{"error":{"code":"…","message":"…","hint":"…"}}`，
  `code` 英文稳定、`message`/`hint` 中文；带附加载荷时多一个 `error.detail`（见 §6 门控）。

## 5. 退出码表

| 码 | 含义 | 典型触发 |
|---|---|---|
| `0` | 成功（含 0 行结果；`auth status` 未登录也 `0`） | — |
| `2` | 用法 / 参数 / 本地配置错误 | 非法 flag、缺必填参数、坏配置文件、`--csv` 用在数据类命令之外 |
| `3` | 未登录 / 401 | 无凭证、access+refresh 均失效（CLI 会先静默刷新一次再重试，仍 401 才退 3） |
| `4` | 无权限 / 被门控 | 403、工具内权限文案、看板门控五类 `dashboard_*` |
| `5` | 服务端 / JSON-RPC 错误 | 5xx、其它 4xx、MCP error、工具内部报错 |
| `6` | 网络 / 超时 | DNS 失败、连接失败、fetch failed、超时（查询可能仍在服务端执行） |
| `7` | 结果解析失败 | 无结构化内容且 CSV 解析失败（`--raw` 可把原始响应打到 stderr） |

## 6. 失败处理话术（agent 照此回复）

| 场景 | 判定 | 话术与动作 |
|---|---|---|
| **未安装** | `msy-x --version` 失败 / 命令不存在 | 「CLI 工具尚未安装。我可以改用 MCP 连接器直接查询；如需 CLI，请按插件说明执行安装命令（npm install -g <tgz 地址>）。」→ 按 SKILL.md 回退 MCP 通道 |
| **未登录** | 退出码 `3`，或 `auth status` 的 `logged_in:false` | 「马上赢 CLI 未登录，正在发起浏览器授权…」→ 跑 `msy-x auth login`；无浏览器环境时把授权 URL 发给用户在本机完成；成功后重试原命令**一次** |
| **无网络** | 退出码 `6` | 「无法连接马上赢 X 平台（网络/超时）。请检查网络后重试；长查询可能仍在服务端执行，可稍后让我重跑。」→ 不要连续重试超过 1 次 |
| **无权限（非门控）** | `code` 为 `FORBIDDEN` | 「当前账号没有该操作的权限」→ 原样转述 stderr 里的中文 message，建议联系管理员 |
| **看板门控（退 `4`）** | `error.code` 为 `dashboard_permission_required` / `dashboard_configuration_required` / `dashboard_selection_required` / `dashboard_not_found` / `dashboard_context_unavailable` | **code 即服务端 status，原样分支**：`selection_required` 时读 `error.detail.candidates`（`dashboardUuid` + `dashboardName`）列出候选让用户指定 `--dashboard <uuid>`；`not_found` 时先 `msy-x dashboards find <q>` 再问用户；`permission_required` 时转述 `error.detail.contact`（客服联系方式）；`configuration_required` 属管理员配置问题，告知约 60 秒生效后重试。**原样转述服务端中文文案**（`error.message` / `error.hint`）；不要改参数反复试探 |

门控 stderr 形状（`detail` 里 `action` / `candidates` / `contact` / `dashboardUrl` / `detail` 为服务端带啥有啥）：

```json
{"error":{"code":"dashboard_selection_required","message":"「cls_insight_list」关联了多个看板，请选一个后重试。","hint":"下一步：…\n- <dashboardUuid> <看板名>\n重试时用 --dashboard <dashboardUuid> …","detail":{"action":"select_dashboard","candidates":[{"dashboardUuid":"…","dashboardName":"…"}]}}}
```

## 7. 安全边界（硬性）

- **绝不要求用户把 PAT 粘贴进对话**。登录走 `msy-x auth login`（浏览器授权）；确需 PAT（内部站 / CI）时，引导用户在自己的终端执行 `msy-x auth login --token`，令牌不经过对话。
- 用户主动粘贴 PAT 时：不使用、不复述，并提醒立即在 x.brandct.com 撤销该令牌。
- 不回显、不落盘任何令牌；只读查询，不执行任何写操作。
