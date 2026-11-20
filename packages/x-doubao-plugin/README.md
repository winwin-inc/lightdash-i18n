# @lightdash/x-doubao-plugin（最小 demo）

把「马上赢 X 平台 MCP」封装成**豆包插件**（`MCP + Skill` 同包交付），做到：

- 用户安装时**填一次 PAT**，之后无需再配置任何 MCP
- 对话里能**查到字段**（`find_fields`），也能**马上取数**（`run_metric_query` / `x_batch_query`）
- 6 张表取数从「6 次串行往返 + MB 级回灌」压成「1 次调用 + KB 级摘要」

> 状态：可直接跑的 demo，未上架。代理层为本地原型，生产需部署到公网 HTTPS。

---

## 1. 先回答三个问题

| 问题 | 答案 | 落在哪 |
|---|---|---|
| 安装时就能填密码？ | 能。平台读 `com.doubao/auth/<服务键>.json` **自动生成输入框**，用户填一次，之后每次调用由平台注入请求头 | `plugin/com.doubao/auth/x.json` |
| 本地文件能读到数据列？ | **不能，也不该**。插件包里只有「凭据声明」，没有任何数据；字段/数据列都来自 MCP 工具 `find_fields` 的实时返回 | `plugin/skills/*/references/fields.md` |
| 需要时马上取数？ | 能。`run_metric_query`（单次）/ `x_batch_query`（批量并发 + 摘要） | `proxy/` |

关键区别：**密码存在平台侧、通过请求头注入；skill 和脚本永远拿不到它**。所以“让 AI 在对话里问密码”这条路是封死的（规范明令禁止，且密码会永久留在上下文里）。

---

## 2. 目录结构

```text
packages/x-doubao-plugin/
├── plugin/                                   ← ZIP 根目录（上传这个）
│   ├── plugin.json                           根清单 + MCP 展示配置
│   ├── mcp.json                              MCP 连接声明（HTTPS，禁 localhost）
│   ├── com.doubao/
│   │   ├── assets/plugin-icon.png
│   │   ├── auth/x.json                       ← 凭据表单声明（不含真实值）
│   │   └── cli.json                          ← CLI 连接器声明（msy-x 命令行）
│   └── skills/brandct-x-insight/              ← 这个目录本身就是「技能包」根
│       ├── SKILL.md                          技能入口上传时必须在根
│       ├── assets/icon.png                   512×512
│       └── references/
│           ├── fields.md                     字段与取数速查
│           └── cli.md                        CLI 通道速查（命令 / 退出码 / 失败话术）
├── proxy/                                    ← 批量代理（可选，解决 N 次往返）
│   ├── proxy.ts                              透传上游工具 + 额外 x_batch_query
│   ├── upstream.ts                           用注入的 x-api-key 连上游
│   ├── aggregate.ts                          聚合 + 明细落盘
│   ├── mock-upstream.ts                      假上游，本地联调用
│   └── smoke.mjs                             串行 vs 批量对比实验
└── scripts/
    ├── verify.mjs                            插件包自检（发布红线，含 CLI 连接器规则）
    ├── verify-skill.mjs                      技能包自检（根目录 / frontmatter / 图标）
    ├── build-plugin.mjs                      打插件包 ZIP（根含 plugin.json）
    ├── build-skill.mjs                       打技能包 ZIP（根含 SKILL.md）
    └── zip.mjs                               零依赖 ZIP 写入
```

> **两个上传入口，根目录要求不一样**，这是最高频的报错来源：
>
> | 控制台入口 | 拖入什么 | ZIP 根目录必须有 |
> |---|---|---|
> | 插件 → 创建插件 | `dist/x-platform-assistant.zip` | `plugin.json` |
> | 技能 → 上传技能 | `dist/brandct-x-insight.zip`，或直接拖入 `plugin/skills/brandct-x-insight/` 文件夹 | `SKILL.md` |
>
> 把 `plugin/` 整个目录传给「上传技能」会报「文件夹需在下一级包含 SKILL.md 文件」——因为 SKILL.md 在 `skills/<技能名>/` 里，不在下一级。

---

## 3. 两种形态，选一个

### A. 直连（最省事，零代码改动）

`plugin/mcp.json` 已经指向真实端点：

```json
{ "mcpServers": { "x": { "type": "streamable-http", "url": "https://mcp-x.brandct.com/mcp" } } }
```

装完就能用 `get_my_access` / `list_explores` / `find_fields` / `run_metric_query`。
**缺点**：模型仍可能一张张查 → 慢、上下文大。

### B. 走代理（解决慢，推荐）

```
豆包 → 你的代理（公网 HTTPS） → 马上赢 X 平台 MCP
          │ 透传全部工具名（skill 不用改）
          └ 额外提供 x_batch_query：N 个查询并发 + 聚合 + 明细落盘
```

把 `mcp.json` 的 url 换成代理地址即可，其余不变。代理本身只需要一张 PAT（由豆包注入），不需要任何额外密钥管理。

---

## 4. CLI 连接器通道（msy-x）

插件包内现在有**两个通道并存**：MCP 连接器（`mcp.json`，服务键 `x`）与 CLI 连接器（`com.doubao/cli.json`，连接器键 `msy-x`）。CLI 连接器由平台按声明安装并调用 `msy-x` 命令行（Node ≥ 20），子命令即 MCP 工具；`SKILL.md` 的「CLI 通道」小节负责路由（有 CLI 用 CLI，未装则回退 MCP），命令 / 退出码 / 失败话术详见 `references/cli.md`。

### 4.1 `com.doubao/cli.json` 契约

| 字段 | 值 | 说明 |
|---|---|---|
| `install.default` | `npm install -g <公网 tgz 地址>` | 必填；平台按序执行，任一失败即安装失败；也可用 `linux`/`darwin`/`win32` 平台键，但 linux 命中的项只能是 npm 安装命令 |
| `versionCheck` | `msy-x --version` | 输出 `msy-x <semver>` 单行 |
| `statusMatchRegex` | `"logged_in"\s*:\s*true` | 平台用它从 `status` 输出判定登录态（`auth status` 未登录也退 `0`，靠该正则区分） |
| `auth` / `unAuth` | `msy-x auth login` / `msy-x auth logout` | 登录为 OAuth（自动拉浏览器，阻塞至终态）；登出幂等 |
| `status` / `help` | `msy-x auth status` / `msy-x --help` | 状态输出单行 JSON 且 `logged_in` 为首键；help 无副作用 |

> ⚠️ **发布前必须替换占位域名**：`install.default` 当前是占位地址
> `https://static.example.com/msy-x-cli/msy-x-cli-0.1.0.tgz`，
> **必须替换为真实公网 tgz 地址**（HTTPS、无鉴权、可直连，由运维提供托管）后才能提交审核；
> 拿到 npm 账号后改为 `npm install -g msy-x-cli` 即可。
> `verify.mjs` 检测到占位域名会给出 WARN 提醒（不阻断本地自检，但控制台审核过不去）。

约束（均由 `verify.mjs` 强制）：连接器键匹配 `^[a-z0-9-]+$` 且不得与 `mcp.json` 的服务键重名；各命令字段均为非空字符串数组；`statusMatchRegex` 必须可被 `new RegExp` 编译；包内不得含 `.exe`/`.node`/可执行二进制与 `ldpat_`/`Bearer` 明文。

### 4.2 单连接器裁剪（提交审核前按运营要求二选一）

| 裁剪为 | 删除 | 保留 |
|---|---|---|
| **只留 CLI** | `plugin/mcp.json`；`plugin.json` 里 `extensions["com.doubao"].mcpServers` 整段；`com.doubao/auth/x.json`（如不再需要） | `com.doubao/cli.json`、`references/cli.md`、`SKILL.md`「CLI 通道」小节 |
| **只留 MCP** | `plugin/com.doubao/cli.json`；`references/cli.md`；`SKILL.md` 的「CLI 通道」小节及失败处理里的 CLI 分支 | `mcp.json`、`plugin.json` 现有 mcpServers 配置 |

裁剪后分别跑 `node scripts/verify.mjs`（两种形态都必须全绿；只留 MCP 时若 `references/cli.md` 未删干净会出 WARN）与 `node scripts/build-plugin.mjs`（断言会按源目录自适应：删了 `cli.json` 就不再要求 ZIP 内出现它）。

### 4.3 提交问卷字段对照表（平台自检问卷）

| 问卷字段 | 本产品填写 |
|---|---|
| 安装方式 | 命令安装（npm） |
| Runtime 及最低版本 | Node.js ≥ 20 |
| 可执行文件名 | `msy-x` |
| 版本检查 | `msy-x --version`（输出 `msy-x <semver>` 单行） |
| 是否需要登录 | 需要 |
| 登录命令 | `msy-x auth login`（非交互启动、自动拉浏览器、阻塞至终态） |
| 登录状态检查 | `msy-x auth status`（JSON，`logged_in` 首键） |
| 状态正则 | `"logged_in"\s*:\s*true` |
| 登出命令 | `msy-x auth logout` |
| 帮助命令 | `msy-x --help`（无副作用） |
| 远程依赖 | `x.brandct.com`（MCP + OAuth authorize/token/register）、npm 源或 tgz 托管域名 |
| 升级方式 | `npm install -g` 覆盖安装；发版以 npm 版本或 tgz 路径为准 |

---

## 5. 本地跑通

```bash
cd packages/x-doubao-plugin
ln -sfn ../lightdash-mcp/node_modules node_modules   # demo 复用依赖，避免动 workspace lockfile

node proxy/mock-upstream.ts &                          # 假上游 :8790
UPSTREAM_URL=http://127.0.0.1:8790/mcp node proxy/proxy.ts &   # 代理 :8788
node proxy/smoke.mjs                                   # 对比实验
```

实测结果（mock 上游，6 个 explore × 各 400 行）：

| 方式 | 墙钟耗时 | 进入上下文的体积 |
|---|---|---|
| 逐个查 ×6 | 2051 ms | 472.4 KB |
| 批量 ×1 | **416 ms** | **2.6 KB** |

明细 2400 行（483 KB）落盘到 `.data/*.ndjson`，只回 `detailHandle`，**不进上下文**。

> mock 数据不能代表生产耗时。真实数字需要拿 PAT 打 `https://mcp-x.brandct.com/mcp` 实测，再决定是否值得部署代理。

---

## 6. 发布到豆包

### 6.1 只发技能（先验证话术效果，最快）

```bash
node scripts/verify-skill.mjs     # 7 条规则
node scripts/build-skill.mjs      # dist/brandct-x-insight.zip，根含 SKILL.md
```

控制台 → **技能 → 创建技能** → 上传。
注意：**独立技能不带连接器**，用户还得自己在客户端加 MCP、填 PAT。适合先测 skill 的措辞和触发。

### 6.2 发插件（推荐，MCP + 技能一次装好）

1. `node scripts/verify.mjs` —— 必须全绿（规则清单见第 7 节）
2. `node scripts/build-plugin.mjs` —— 产出 `dist/x-platform-assistant.zip`
3. 控制台 → **插件 → 创建插件** → 上传 ZIP → 等自动校验
4. `子能力信息`：连接器传输方式选 `Streamable HTTP`，鉴权选 `API Key / 自定义鉴权`，填**测试 PAT** 供审核实测；CLI 连接器需另附问卷自检材料（对照表见 4.3 节），发布前确认 `cli.json` 占位域名已替换（见 4.1 节警告）
5. `技能信息`：填评测报告（飞书文档链接，对审核开放）+ 5–10 条示例提示词
6. 提交审核（约 3 个工作日）→ 平台运营验收 → 统一发版

企业内部用可以跳过商店：让客户管理员在**企业管理后台**上传插件，凭据也由管理员配一次，员工装上即用、看不到表单。

---

## 7. 自检脚本覆盖的红线

| 规则 | 来源 |
|---|---|
| `plugin.json` 必填、`name` 命名与长度、无 `--` / `..` | 插件总览 §4 |
| `extensions["com.doubao"].mcpServers` 与 `mcp.json` 服务键**逐一对应** | 插件总览 §5.2 |
| `type` 只能是 `streamable-http` / `sse`；**不支持 STDIO** | MCP Server §2.1 |
| URL 必须 HTTPS 绝对地址，禁 `localhost` / 回环 / 账号密码 / 片段 | MCP Server §2.1 |
| 静态凭据文件必须在 `com.doubao/auth/<服务键>.json`，文件名 = 服务键 | MCP Server §3 |
| `credentials[].id` 唯一、字母开头；`secret` 必填 boolean | MCP Server §3.1 |
| `injections[].target` 只能是 `header`；`value` 必须引用已声明 `${id}` | MCP Server §3.2 |
| 注入头不得与 `mcp.json.headers` 重名（大小写不敏感） | MCP Server §3.2 |
| 包内不得含真实密钥 / 令牌（含 `ldpat_` / `Bearer` 明文） | 插件总览 §5.3 + CLI 连接器指南 §4.1 |
| `SKILL.md` frontmatter：`name` / `description` ≤300 字符、`metadata` 全字符串 | 技能规范 §4 |
| 图标 512×512、≤500KB、路径 `./` 开头 | 技能规范 §4.2 |
| `cli.json` 必须位于 `com.doubao/`；`connectors` 非空；连接器键 `^[a-z0-9-]+$` 且不与 mcp.json 服务键重名；`install` 含 `linux` 或 `default` 且平台数组非空（npm 安装）；`auth/status/unAuth/help/versionCheck` 非空字符串数组；`statusMatchRegex` 可编译；带 `cli.json` 必须成对带 `references/cli.md` | CLI 连接器指南 §4.1 + 设计稿 §9.1 |
| 包内不得含 `.exe`/`.node`/可执行二进制（含魔数嗅探） | CLI 连接器指南 §4.1 |
| ZIP ≤16MB、≤1024 条目、单文件 ≤2MB、Skill ≤10、MCP ≤10 | 插件总览 §5.1 |

`verify.mjs` 是**规则子集**，最终仍以控制台校验为准；但它能提前干掉“多套一层目录”“服务键对不上”“localhost URL”这三类最高频的驳回。

---

## 8. 已知限制 / 待实测

- **插件只支持远程 MCP**：客户端手动加的“自定义连接器”支持 STDIO，但插件包发布不支持本地进程。
- **凭据改不了**：客户端只有「我安装的 → 查看/卸载」，没有“编辑凭据”。PAT 失效只能卸载重装重填 —— 这一点已写进 `SKILL.md` 的失败处理。
- **代理多一次 initialize 握手**：每个请求新建上游连接约 +100–300ms，批量场景可接受；高频单查场景应改成连接复用。
- **`x_batch_query` 只做聚合不建语义层**：跨 explore 不能 JOIN，结论层面对比由模型完成。
- **未验证**：`x-api-key` 注入在豆包客户端的实际行为、大结果是否被平台截断、企业版是否开放自定义插件上传。需各拿一个真实租户实测一次。
