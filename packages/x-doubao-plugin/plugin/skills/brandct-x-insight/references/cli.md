# CLI 通道速查（msy-x）

`msy-x` 是跑在终端里的 MCP 客户端：子命令即 MCP 工具，输出结构与 MCP 的 `structuredContent` 一致。
本文件供技能在「CLI 通道」下使用；通道选择与失败路由见 `SKILL.md` 的「CLI 通道」小节。

## 1. 契约命令（豆包连接器用，agent 也可直接调）

| 命令 | stdout | 退出码 |
|---|---|---|
| `msy-x --version` | `msy-x <semver>` 单行 | `0` |
| `msy-x --help` | 帮助（无副作用） | `0` |
| `msy-x auth login` | `{"logged_in":true,"site":"x","authMode":"oauth","mode":"login"}` | `0` 成功；`2` 本地错误；`3` 授权失败/超时；`6` 网络 |
| `msy-x auth status` | 单行 JSON，`logged_in` 必为首键：`{"logged_in":true,...}` / `{"logged_in":false,...}` | 已登录与未登录**都 `0`**（靠 `logged_in` 区分），本地读失败 `2` |
| `msy-x auth logout` | `{"logged_out":true,"site":"x"}` | 幂等 `0` |

`auth login` 默认 OAuth：自动拉起浏览器授权，阻塞到终态（成功 / 拒绝 / 超时），绝不等待 stdin。
`auth status` 纯本地离线判定，断网不会误报「未登录」。

## 2. 命令表

| 命令 | 作用 | 对应 MCP 工具 |
|---|---|---|
| `msy-x site list` / `site use <name>` | 多站点管理：列出 / 切换当前站点（子命令以 `msy-x site --help` 为准） | 本地 config，不调服务端 |
| `msy-x info` | 站点、版本、当前项目一览 | `get_site_info` + `get_lightdash_version` + `get_current_project` |
| `msy-x project list` / `project use <uuid>` / `project show` | 项目列表 / 切换（写服务端默认项目）/ 查看 | `list_projects` / `set_project` / `get_current_project` |
| `msy-x access [--explores]` | 我的令牌、项目与可见范围 | `get_my_access` |
| `msy-x explores list [--search <q>]` / `explores find <q>` | 找表 | `list_explores` / `find_explores` |
| `msy-x fields find <q> [--explore <name>]` | 找字段（fieldId 决定维度 / 指标） | `find_fields` |
| `msy-x values <fieldId> [--search <s>]` | 看某维度的真实取值（核对口径用） | `search_field_values` |
| `msy-x search <q> [--type chart\|dashboard\|space]` | 全局搜内容（无 `--type` 走全类型） | `find_content` / `find_charts` / `find_dashboards` / `find_spaces` |
| `msy-x spaces list [--parent <slug>]` / `spaces find <q>` | 空间层级浏览 / 搜索 | `list_spaces` / `find_spaces` |
| `msy-x dashboards list [--space <slug>]` / `find <q>` / `tiles <uuid>` / `run <uuid>` / `code <uuid>` | 看板：列表 / 搜索 / 磁贴 / 批量跑 / 导出 as-code | `list_dashboards` / `find_dashboards` / `get_dashboard_tiles` / `run_dashboard_tiles` / `get_dashboard_code` |
| `msy-x charts list --dashboard <uuid>` / `find <q>` / `get <uuid>` / `run <uuid> [--csv]` | 图表：列表 / 搜索 / 详情 / 取数 | `list_charts` / `find_charts` / `get_saved_chart` / `run_saved_chart` |
| `msy-x query -e <explore> --dimensions a,b --metrics x,y` | 语义取数（CLI 组装 metricQuery） | `run_semantic_metric_query` |
| `msy-x query --file q.json` / `query flat …` | metricQuery 原样透传 / 扁平参数 | 同上 / `run_metric_query` |
| `msy-x tools list / describe <name>` | 列出 / 描述可用工具（本地目录） | `tools/list` |
| `msy-x call <tool> [--json '<obj>' \| --file <path>]` | 逃生口：任意工具透传（新工具无需等 CLI 发版） | 任意 `tools/call` |

常用全局选项：`--site <name|url>`、`--project <uuid>`、`--json/--table/--csv`、`--out <path>`（大结果落盘，stdout 只回摘要）、`--limit N`、`--timeout <ms>`、`--dry-run`（只打印将要发送的 `{tool, arguments}`，排障用）。

## 3. 参数示例（真实表名）

```bash
# 1) 找表：品类宝 HSM 前缀是 pinleibaohsm_（不要用 ads_pinleibao_*）
msy-x explores list --search pinleibaohsm

# 2) 找字段：fieldId 一律以 find_fields 返回为准，不要凭记忆拼
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

# 6) 大结果落盘（stdout 只回 {"written":...,"rows":N}）
msy-x query -e pinleibaohsm_cls_top --dimensions pinleibaohsm_cls_top_cls_4 \
  --metrics pinleibaohsm_cls_top_total_cls4_amount --limit 500 --csv --out /tmp/cls4.csv
```

注意：

- `--filter fieldId=value` 多次传即 AND；多值 `a,b` 按 equals；复杂条件用 `--filters-json` 或 `--file`。
- 复刻看板 TOP N 时**不要传 `--sort`**（服务端排序不稳定），`--limit` 拉全量后自行排序。
- 默认不传 `--limit`；用户要明细时才传并明确告知条数。

## 4. 输出契约

- **非 TTY 下 stdout 只有 JSON 数据**：表格颜色、进度、提示、错误全走 stderr；agent 只解析 stdout。
- 默认原样输出工具的 `structuredContent`；`--envelope` 时包一层 `{ok, tool, data, meta}`。
- 结果里的 `webUrl` 可直接给用户跳转网页版。
- 错误输出（stderr，单行 JSON）：`{"error":{"code":"AUTH_REQUIRED","message":"…","hint":"…"}}`，`code` 英文稳定、`message`/`hint` 中文。

## 5. 退出码表

| 码 | 含义 | 典型触发 |
|---|---|---|
| `0` | 成功（含 0 行结果；`auth status` 未登录也 `0`） | — |
| `2` | 用法 / 参数 / 本地配置错误 | 非法 flag、坏配置文件、`--csv` 用在数据类命令之外 |
| `3` | 未登录 / 401 | 无凭证、access+refresh 均失效 |
| `4` | 无权限 / 被门控 | 403；看板门控五类 `dashboard_*` |
| `5` | 服务端 / JSON-RPC 错误 | 5xx、MCP error、工具内部报错 |
| `6` | 网络 / 超时 | DNS 失败、连接失败、超时（查询可能仍在服务端执行） |
| `7` | 结果解析失败 | 无结构化内容且 CSV 解析失败（`--raw` 可把原始响应打到 stderr） |

## 6. 失败处理话术（agent 照此回复）

| 场景 | 判定 | 话术与动作 |
|---|---|---|
| **未安装** | `msy-x --version` 失败 / 命令不存在 | 「CLI 工具尚未安装。我可以改用 MCP 连接器直接查询；如需 CLI，请按插件说明执行安装命令（npm install -g <tgz 地址>）。」→ 按 SKILL.md 回退 MCP 通道 |
| **未登录** | 退出码 `3`，或 `auth status` 的 `logged_in:false` | 「马上赢 CLI 未登录，正在发起浏览器授权…」→ 跑 `msy-x auth login`；无浏览器环境时把授权 URL 发给用户在本机完成；成功后重试原命令**一次** |
| **无网络** | 退出码 `6` | 「无法连接马上赢 X 平台（网络/超时）。请检查网络后重试；长查询可能仍在服务端执行，可稍后让我重跑。」→ 不要连续重试超过 1 次 |
| **看板门控（退 `4`）** | `code` 为 `dashboard_permission_required` / `dashboard_configuration_required` / `dashboard_selection_required` / `dashboard_not_found` / `dashboard_context_unavailable` | **原样转述服务端中文文案**（含联系人与 `MCP_DASHBOARD_CONTACT`）；`dashboard_selection_required` 时列出候选看板（UUID + 名称）让用户指定 `--dashboard`；`dashboard_not_found` 时先 `msy-x dashboards find <q>` 再问用户；不要改参数反复试探 |

## 7. 安全边界（硬性）

- **绝不要求用户把 PAT 粘贴进对话**。登录走 `msy-x auth login`（浏览器授权）；确需 PAT（内部站 / CI）时，引导用户在自己的终端执行 `msy-x auth login --token`，令牌不经过对话。
- 用户主动粘贴 PAT 时：不使用、不复述，并提醒立即在 x.brandct.com 撤销该令牌。
- 不回显、不落盘任何令牌；只读查询，不执行任何写操作。
