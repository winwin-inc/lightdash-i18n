# msy-x-cli

`msy-x` 是「马上赢 X 平台」的命令行客户端：一条命令就是一次 MCP 工具调用，在终端里查数、看看板、核对字段值，也可以在脚本和智能体（agent）里以 JSON 输出稳定集成。

- 与平台的关系：`msy-x` 只是一个 **MCP 客户端**，所有请求都走平台内置的 MCP v2 端点 `/api/v1/mcp`。口径（语义层）、看板门控、行级权限全部以服务端为准，CLI 不复制、不绕过任何权限逻辑。
- 只读：当前所有命令都是查询类（`mcp:read`），CLI 不提供任何写操作。
- 多端复用：同一套命令既给人用（表格输出、`webUrl` 直达），也给程序用（非交互环境默认 JSON、稳定退出码）。

## 安装

要求 **Node.js ≥ 20**（仅依赖 Node 与 npm，无需数据库或 Python）。

```bash
# 方式一：npm 源（拿到 npm 账号后）
npm i -g msy-x-cli

# 方式二：tgz 文件地址（首批分发方式，地址由运营/运维提供）
npm i -g https://<host>/msy-x-cli-0.1.0.tgz
```

验证安装：

```bash
msy-x --version    # 输出：msy-x 0.1.0
msy-x --help
```

升级即重新执行一次安装命令（覆盖安装）。

## 登录

```bash
msy-x auth login     # 浏览器授权（OAuth）。自动拉起默认浏览器，阻塞等待到授权完成/拒绝/超时
msy-x auth status    # 查看登录状态（纯本地判断，离线可用）
msy-x auth logout    # 清除本机凭证（幂等，重复执行不报错）
```

- `auth login` 启动后自动打开浏览器完成授权，**命令会一直等到有结果才退出**（默认超时 300 秒）；不会"浏览器已打开就立刻返回"。授权失败不留半截凭证。
- headless / 远程服务器上无法拉起浏览器时，设 `MSY_X_NO_BROWSER=1`，登录会把授权 URL 打到 stderr，复制到本地浏览器打开即可。
- 服务账号 / CI 可用 PAT（个人访问令牌）模式：

  ```bash
  msy-x auth login --token ldpat_xxx        # 或用环境变量 MSY_X_PAT
  ```

`auth status` 输出**单行 JSON**，`logged_in` 恒为首键（豆包等连接器靠它判断状态）：

```json
{"logged_in":true,"site":"x","authMode":"oauth","expiresAt":"2026-11-17T12:00:00.000Z"}
```

未登录时 `logged_in:false`（退出码仍为 0，靠 JSON 内容区分）；本地配置读取出错才退非 0。真实连通性检查用 `msy-x doctor --remote`（发真实请求：`tools/list` 与能力探测）。

凭证保存在本机 `~/.config/msy-x/config.yaml`（Windows：`%APPDATA%\msy-x\`，目录 `0700`、文件 `0600`；共享机器请用 `MSY_X_CONFIG` 指到个人目录）。CLI 不回显任何令牌。

## 命令速查

全局常用选项：`--site <name|url>`（切换站点）、`--project <uuid>`（指定项目）、`--json/--table/--csv`（输出格式）、`--out <path>`（结果落盘）、`--timeout <ms>`（单次调用超时）。每条命令都支持 `--help` 查看参数与示例。

| 命令 | 说明 | 示例 |
|---|---|---|
| `auth login` / `status` / `logout` | 登录 / 状态 / 登出（见上节） | `msy-x auth login` |
| `site` | 查看 / 切换已配置的站点（对应配置里的多站点 profile；临时切换用全局 `--site`） | `msy-x site list` |
| `info` | 站点与版本信息、当前默认项目（一次调用 3 个工具，输出为单个合并 JSON 对象） | `msy-x info` |
| `access` | 我的权限与可查范围（拿不准能不能查时先看这个） | `msy-x access --explores` |
| `project list` | 列出我有权限的项目 | `msy-x project list` |
| `project use <uuid>` | 设置服务端默认项目 | `msy-x project use 3667f682-4080-44a4-8365-49f405936e09` |
| `project show` | 查看当前默认项目及其来源 | `msy-x project show` |
| `search <q>` | 全局搜内容（图表/看板/空间；`--type chart\|dashboard\|space` 收窄） | `msy-x search 品类洞察 --type dashboard` |
| `spaces list` | 列出项目下的空间 | `msy-x spaces list --page-size 50` |
| `spaces find <q>` | 按名称搜空间 | `msy-x spaces find 品类` |
| `dashboards list --space <uuid>` | 列出某空间下的看板（`--space` 必填） | `msy-x dashboards list --space <spaceUuid>` |
| `dashboards find <q>` | 搜看板（结果带 `webUrl` 可直接打开） | `msy-x dashboards find 品类机会洞察` |
| `dashboards tiles <uuid>` | 看板磁贴清单 | `msy-x dashboards tiles <dashboardUuid>` |
| `dashboards run <uuid>` | 跑整板取数（结果大时建议配 `--out`） | `msy-x dashboards run <dashboardUuid> --out board.csv` |
| `dashboards get <uuid>` | 看板定义 JSON | `msy-x dashboards get <dashboardUuid>` |
| `charts list --dashboard <uuid>` | 列出某看板下的图表 | `msy-x charts list --dashboard <dashboardUuid>` |
| `charts find <q>` | 搜图表 | `msy-x charts find 类目` |
| `charts get <uuid>` | 图表定义（`--full` 看字段级配置） | `msy-x charts get <chartUuid> --full` |
| `charts run <uuid>` | 跑已保存图表（没有临时查询权限时的取数方式） | `msy-x charts run <chartUuid> --limit 100 --csv --out top.csv` |
| `explores list` | 列出项目里的数据表（`--search` 按表名过滤） | `msy-x explores list --search pinleibaohsm` |
| `explores show <name>` | 看某张表的详情（维度/指标清单） | `msy-x explores show pinleibaohsm_cls_top` |
| `fields find <q> --explore <t>` | 在指定表里找字段，拿字段 ID | `msy-x fields find 销售额 --explore cls_insight_list` |
| `values <fieldId> --table <t>` | 查维度字段的真实取值（筛选前先核对） | `msy-x values pinleibaohsm_cls_top_region_name --table pinleibaohsm_cls_top --search 华南` |
| `query` | 临时查询：`-e` 指定表，逗号分隔维度/指标，`--filter 字段=值` 可重复 | `msy-x query -e pinleibaohsm_cls_top --dimensions pinleibaohsm_cls_top_cls_4 --metrics pinleibaohsm_cls_top_total_cls4_amount --filter pinleibaohsm_cls_top_period=2026Q2 --filter pinleibaohsm_cls_top_region_name=华南地区 --limit 10` |
| `query --file q.json` | 用 JSON 文件描述查询（`-` 从 stdin 读） | `msy-x query --file q.json --out result.csv` |
| `query flat` | 简单查询的直通模式（对应 vizConfig，排序用 `--sort 字段:desc`） | `msy-x query flat -e cls_insight_list --dimensions pinleibaohsm_cls_top_cls_4 --metrics pinleibaohsm_cls_top_total_cls4_amount --sort pinleibaohsm_cls_top_total_cls4_amount:desc --limit 10` |
| `verified` | 列出已认证内容（站点未启用该功能时原样输出服务端提示并退 0） | `msy-x verified` |
| `docs [topic]` | 平台 MCP 使用文档（如 overview / query_workflow） | `msy-x docs query_workflow` |
| `tools list` / `tools describe <n>` | 列出服务端当前全部工具（新工具自动可见） | `msy-x tools list` |
| `call <tool> --args '<obj>'` | 直通任意 MCP 工具（`--args` 传工具入参 JSON，`--file` 从文件读；兜底通道，新工具无需等 CLI 升级） | `msy-x call search_field_values --args '{"table":"pinleibaohsm_cls_top","fieldId":"pinleibaohsm_cls_top_period"}'` |
| `doctor` | 自检配置、凭证与（`--remote` 时）服务端连通性及能力 | `msy-x doctor --remote` |

## 输出约定

- **stdout 只有数据**：进度、提示、警告、错误一律走 stderr。脚本与 agent 只需解析 stdout。
- 默认格式：终端（TTY）下输出表格；**管道 / 重定向（非 TTY）下默认输出 JSON**。
- 显式指定优先：`--json` / `--table` / `--csv`。`--csv` 仅对数据类命令（`query`、`query flat`、`charts run`、`dashboards run`）有效，其余命令传了会报参数错误。
- `--envelope`：JSON 外包一层 `{ok,tool,data,meta}`，`meta` 含 `site`、`projectUuid`（未指定时为 `null`）与 `durationMs`。
- 返回 XML / Markdown 等非表格文本的工具（如 `find_explores`、`docs`）：JSON 模式输出 `{"text":"…"}`；表格模式原样打印文本并在 stderr 提示「该工具返回非表格文本」。
- 多工具命令（目前仅 `info`）：stdout 输出**单个合并 JSON 对象**（键为工具名）；`--out` 把该对象一次写入文件，stdout 只回 `{"written":"<abs>","calls":3,"bytes":N}`。
- `--out <path>`：完整结果写入文件（JSON/CSV），stdout 只回一条摘要 `{"written":"/abs/path","rows":100,"bytes":5321}`。大结果集建议落盘，避免灌满终端。
- `--page-size` 上限 100：超过会被本地截断到 100，并在 stderr 告警（`--quiet` 关闭）。
- JSON 错误统一为单行：`{"error":{"code":"AUTH_REQUIRED","message":"…","hint":"运行 msy-x auth login 重新登录"}}`。`code` 是稳定英文串（供程序分支），`message`/`hint` 为中文（供人读）。

## 退出码

| 码 | 含义 | 典型场景 |
|---|---|---|
| `0` | 成功（含 0 行结果；`auth status` 未登录也是 0，`verified` 在未启用内容验证的站点也是 0，`doctor` 仅 warn 也是 0） | — |
| `2` | 用法 / 参数 / 本地配置错误 | 非法 flag、坏配置文件、`dashboards list` 缺 `--space` |
| `3` | 未登录 / 凭证失效（401） | 未 `auth login`；token 过期且刷新失败 |
| `4` | 无权限 / 被门控（403） | 越权访问；看板门控（见下） |
| `5` | 服务端 / MCP 错误 | 5xx、工具内部报错 |
| `6` | 网络 / 超时 | 连不上站点、超过 `--timeout` |
| `7` | 结果解析失败 | 响应无结构化内容且解析不了 |

常见错误对照：

- **401（退 3）**：日常调用遇到 401 会自动刷新一次凭证并重试；仍失败则提示重新 `msy-x auth login`。
- **403 / 看板门控（退 4）**：站点开启强制看板模式时，看板类查询可能返回 `dashboard_permission_required`（无权限）、`dashboard_selection_required`（需指定 `--dashboard`）、`dashboard_not_found` 等 `dashboard_*` 状态，CLI 会原样透出服务端中文文案与建议操作（如先 `dashboards find`）。
- **超时（退 6）**：默认单次调用 60 秒（`MSY_X_TIMEOUT_MS` 或 `--timeout` 可调），超时后会提示"查询可能仍在服务端执行"，可加大超时或改用 `--out` 落盘重试。

## 排错

```bash
msy-x doctor                # 本地自检：Node 版本、配置文件与权限位、站点解析、凭证
msy-x doctor --remote       # 加做真实请求：tools/list（工具目录 26 个）与能力探测，验证端到端连通
MSY_X_DEBUG=1 msy-x info    # stderr 打印请求/响应摘要（令牌已自动脱敏）
```

- **登录没弹出浏览器**：headless 环境设 `MSY_X_NO_BROWSER=1`，复制 stderr 里的授权 URL 到本地浏览器完成登录。
- **怀疑配置问题**：检查 `~/.config/msy-x/config.yaml`（或 `MSY_X_CONFIG` 指向的文件）；`msy-x doctor` 能发现坏 YAML 与缺失字段。
- **查询慢 / 超时**：加 `--timeout 300000`（上限 600 秒），或缩小 `--limit`；明细用 `--out result.csv` 落盘。
- **单次查询结果为 0 行**：先用 `msy-x values` 核对维度取值（例如区域是「华南地区」不是「华南」）。

## 环境变量

| 变量 | 作用 |
|---|---|
| `MSY_X_SITE_URL` | 覆盖站点地址（自动拼 `/api/v1/mcp`） |
| `MSY_X_MCP_URL` | 直接覆盖完整 MCP 端点 URL |
| `MSY_X_PAT` | 用 PAT 鉴权（免 `auth login`，CI 常用） |
| `MSY_X_CONFIG` | 指定配置文件路径（默认 `~/.config/msy-x/config.yaml`） |
| `MSY_X_TIMEOUT_MS` | 单次工具调用超时（默认 60000） |
| `MSY_X_NO_BROWSER` | `1` 时不拉浏览器，只打印授权 URL |
| `MSY_X_DEBUG` | `1` 时在 stderr 输出请求/响应摘要（凭证脱敏） |
