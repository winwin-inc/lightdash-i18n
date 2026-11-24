# msy-x-cli 开发计划

> 状态：**P0–P4 全部完成，0.2.0 已发布并完成真实站点验收**（2026-11-18）。契约以 [设计文档](./msy-x-cli-design.md) 为准，使用说明见 [使用手册](./msy-x-cli-usage.md)；本文只写实施顺序、测试与发布（内部文档，可含内部引用）。
>
> **2026-11-18 追加**：扫码登录（RFC 8628）多副本失效已修——设备码会话从进程内存迁至 Postgres `oauth2_device_codes`（服务端 ≥ 2.7.5），CLI 侧补 `invalid_grant`/404/`interval` NaN 处理与 `doctor --remote` 的 `device-flow` 探测。**0.2.0 发版 tag 需等此修复上线并完成生产扫码验收**。
>
> 已完成：配置/鉴权/MCP 客户端/渲染/35 个命令/doctor/verified/打包脚本/豆包 CLI 连接器；独立审查的 P0+P1（401 映射、门控 detail、text JSON 原样输出、Skill 文档）已修。
> 待办：P4 公网 tgz 与 npm 发布、真实站点验收（OAuth 登录 + `values`/`query flat` 冒烟）、P2 尾巴（见设计稿审查清单）。
>
> 分支：`feat/msy-x-cli`（按 [.agents/rules/branching.md](../../.agents/rules/branching.md)，功能一律功能分支，完成后合 `dev`）。
>
> 产物：`packages/msy-x-cli`（npm `msy-x-cli`，bin `msy-x`）+ `packages/x-doubao-plugin` 的 CLI 连接器包。
>
> **口径修正（2026-11-17，以代码为准）**：v2 真实入参与本计划初稿有差异，已在设计稿 §6.2 重写。要点：`find_*` 用 `searchQueries:[{label}]`（不是 `searchQuery`）；`find_fields` 必填 `table` + `fieldSearchQueries`；`search_field_values` 必填 `table`，无 `limit`；`list_dashboards` 必填 `spaceUuid`；`get/run_saved_chart` 入参是 `savedChartUuid`；`run_metric_query` 只吃 `vizConfig`（顶层扁平参数无效）；`run_semantic_metric_query` 不吃 `metricQuery`，`filters` 形状为 `{dimensions:[{fieldId,operator,values}]}`；`run_saved_chart` 无 `full`；`run_dashboard_tiles` 无磁贴筛选。另：v2 只有看板门控 payload 带 `structuredContent`，其余 25 个是 text JSON（`run_metric_query` 为 CSV、`find_*` 为 XML、`search_field_values` 为 ```json 围栏）——渲染层必须四级探测（设计稿 §7.4）。

---

## 1. 目标与完成判据（DoD）

| # | 判据 | 验证方式 |
|---|---|---|
| 1 | 干净机器 `npm i -g <tgz>` 后 `msy-x --version` / `--help` 可用 | 临时 prefix 装一次 |
| 2 | 真实站点 OAuth 登录成功，配置 `0600`，`auth status` 首键 `logged_in` | `msy-x auth login` → `auth status` |
| 3 | 26 个 MCP 工具全部可达（命令 + `call`） | 映射完整性单测 26/26（2026-11-19 起服务端降到 25 个，`verified` 命令随之下线） |
| 4 | 非 TTY 下默认 JSON、stdout 纯净、退出码符合表 | `msy-x info </dev/null`、`--json` 断言 |
| 5 | 豆包包：`verify.mjs` 全绿，ZIP 含 `com.doubao/cli.json` 且无二进制/凭据 | `node scripts/verify.mjs` |
| 6 | 真实查数链路跑通：`explores find` → `values` → `query` → `dashboards tiles` | 冒烟脚本（见 §5.3） |
| 7 | 文档：README、`docs/cli` 两篇状态同步为「已实施」 | 人工核对 |

---

## 2. 包结构与工程

```text
packages/msy-x-cli/
├── package.json
├── tsconfig.json          # 与 lightdash-mcp 同构：CommonJS / ES2022 / composite / outDir dist
├── .eslintrc.js           # 复制 packages/lightdash-mcp/.eslintrc.js 后按需裁剪
├── .gitignore             # dist / *.tsbuildinfo / dist-msy-x
├── README.md              # 安装、登录、命令速查、退出码（对外，可独立阅读）
├── scripts/
│   └── pack-cli.mjs       # npm pack → dist-msy-x/msy-x-cli-<ver>.tgz + .sha256
└── src/
    ├── index.ts           # shebang + commander 装配 + 顶层错误 → 退出码
    ├── cli/
    │   ├── globalOptions.ts   # --site/--json/--timeout … 解析与冲突校验
    │   ├── output.ts          # 格式判定、TTY 探测、--out 落盘
    │   ├── errors.ts          # CliError { code, message, hint, exitCode }
    │   └── exitCodes.ts       # 退出码常量 + 映射表
    ├── config/
    │   ├── paths.ts           # ~/.config/msy-x、0600/0700、MSY_X_CONFIG
    │   ├── store.ts           # 读写 YAML、原子写、坏文件降级
    │   └── profiles.ts        # site 解析优先级、环境变量覆盖
    ├── auth/
    │   ├── oauth.ts           # 401 → 发现 → DCR → PKCE → 换 token
    │   ├── oauthProvider.ts   # SDK OAuthClientProvider 的本仓实现（存取+回调+拉浏览器）
    │   ├── callbackServer.ts  # 127.0.0.1 单次回环回调 + state 校验 + 超时
    │   ├── pat.ts             # PAT 落盘与出站头
    │   ├── refresh.ts         # refresh.lock + 刷新 + 失效清理
    │   └── revoke.ts          # logout 的尽力 revoke
    ├── mcp/
    │   ├── client.ts          # SDK Client + StreamableHTTPClientTransport 封装
    │   ├── callTool.ts        # tools/call + 超时 + 401 重试一次 + 错误归一
    │   └── toolCatalog.ts     # tools/list 解析、名称/描述/参数展示
    ├── render/
    │   ├── detect.ts          # 选 structuredContent 还是 CSV
    │   ├── table.ts           # ASCII 表格 + 列裁剪 + webUrl 末列
    │   ├── csv.ts             # csv-parse 解析（引号/换行）
    │   └── json.ts            # 原样 / --envelope / 摘要
    ├── commands/
    │   ├── auth.ts  site.ts  doctor.ts  info.ts  project.ts  access.ts
    │   ├── search.ts  spaces.ts  dashboards.ts  charts.ts  explores.ts
    │   ├── fields.ts  values.ts  query.ts  docs.ts  tools.ts  call.ts
    ├── lib/
    │   ├── openBrowser.ts     # win32 start / darwin open / linux xdg-open + MSY_X_NO_BROWSER
    │   ├── redact.ts  version.ts  logger.ts  stdin.ts
    └── __fixtures__/
        ├── toolsList.json     # 26 工具快照（映射完整性测试）
        ├── runSemanticMetricQuery.json
        ├── runMetricQueryCsv.txt
        └── dashboardStrictError.json
```

### 2.1 `package.json` 要点

```jsonc
{
  "name": "msy-x-cli",
  "version": "0.1.1",
  "private": false,
  "bin": { "msy-x": "dist/index.js" },
  "files": ["dist/**/*", "README.md"],
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc --build tsconfig.json --force",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "tsx --test src/**/*.test.ts",
    "lint": "eslint -c ./.eslintrc.js src/**/*.ts",
    "pack:tgz": "pnpm build && node scripts/pack-cli.mjs"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.5",
    "commander": "^9.2.0",
    "csv-parse": "^5.5.6",
    "js-yaml": "^4.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": { "tsx": "^4.19.2", "typescript": "5.5.4" }
}
```

- 依赖版本以 `pnpm install` 后 lockfile 落定为准；`csv-parse` 若引入体积顾虑可先手写 RFC4180 解析（见 §7 风险 3）。
- 根 `tsconfig.json` 的 `references` 加 `{ "path": "./packages/msy-x-cli" }`。
- 根 `package.json` 加 `msy-x-cli-build` / `-typecheck` / `-test` / `-lint` 四条脚本；**不并入** `build`/`test`/`lint` 全量聚合（与 `lightdash-mcp` 现状一致）。
- `pnpm-workspace.yaml` 已含 `packages/*`，无需改动；加依赖后 `pnpm install` 并提交 `pnpm-lock.yaml`。

---

## 3. 模块职责

| 模块 | 只做 | 不负责 |
|---|---|---|
| `cli/*` | 参数解析、格式判定、退出码 | 业务语义、网络 |
| `config/*` | 读写配置、优先级合并、文件权限 | token 刷新 |
| `auth/*` | 登录/登出/状态/刷新/请求头选择 | 工具调用 |
| `mcp/*` | 建连、`tools/list`、`tools/call`、超时与重试 | 渲染、参数校验以外的业务判断 |
| `commands/*` | **纯函数**：`(argv, ctx) → { tool, args }`（`--dry-run` 直接打印该结果） | 直接发请求、直接 print |
| `render/*` | 数据 → table/json/csv | 取数 |

> `commands/*` 的纯函数化是映射完整性测试的前提：单测只断言 `{tool, args}`，不打网络。

---

## 4. 分阶段任务

### 明天开工清单（P0 前 30 分钟）

1. `mkdir packages/msy-x-cli && pnpm init`（手写 `package.json`，不跑交互初始化）。
2. 复制 `packages/lightdash-mcp/{tsconfig.json,.eslintrc.js}` 并按 §2 调整；建 `.gitignore`。
3. 建 `src/index.ts`（shebang + `program.name('msy-x').version(...)`），先让 `msy-x --version` / `--help` 跑通。
4. 建 `src/cli/exitCodes.ts` + `src/cli/errors.ts`（先定契约，后面所有命令都用它）。
5. 根 `tsconfig.json` / `package.json` 挂脚本与 references，`pnpm install`。

### P0 骨架 + 配置 + 鉴权（1–1.5 天）

| # | 任务 | 判据 |
|---|---|---|
| P0-1 | `config/paths.ts` + `store.ts`：目录 `0700`、文件 `0600`、原子写（临时文件 + rename）、坏 YAML 退 `2` 不覆盖原文件 | 单测：权限位、坏文件降级 |
| P0-2 | `config/profiles.ts`：`--site` > `MSY_X_MCP_URL` > `MSY_X_SITE_URL` > `currentSite`；未知 site 报可用列表 | 单测：四级优先级 |
| P0-3 | `auth/callbackServer.ts`：仅 `127.0.0.1`、随机端口、单次、`state` 比对、300s 超时、`server.close()` | 单测：state 不匹配必败、超时清理 |
| P0-4 | `auth/oauthProvider.ts` + `auth/oauth.ts`：接 SDK `auth()`，DCR（`client_name=msy-x-cli`）+ PKCE S256 + 换 token | mock OAuth 服务全链路通过 |
| P0-5 | `auth/refresh.ts`：`refresh.lock`（`O_EXCL` + 30s）、401 静默刷新一次、失败清凭证 | 单测：并发双进程只刷一次 |
| P0-6 | `commands/auth.ts`：`login` / `status` / `logout` 三态契约 | `auth status` 输出首键 `logged_in`、已登录与未登录都退 `0` |
| P0-7 | `lib/openBrowser.ts` + `MSY_X_NO_BROWSER` | 无浏览器环境下打印 URL 且继续等待 |
| P0-8 | `commands/doctor.ts`：本地检查 + `--remote` 打一次 `tools/list` | 真实站点 `doctor --remote` 全绿 |

### P1 MCP 客户端 + 元信息命令（0.5–1 天）

| # | 任务 | 判据 |
|---|---|---|
| P1-1 | `mcp/client.ts`：SDK `Client` + `StreamableHTTPClientTransport`，按 profile 选 `Authorization: Bearer` / `ApiKey` / `x-api-key` | 三种头都能建连 |
| P1-2 | `mcp/callTool.ts`：超时（默认 60s）、JSON-RPC 错误归一、401 重试一次 | 单测：超时退 `6`、401→`3` |
| P1-3 | `commands/tools.ts`：`tools list` / `tools describe` | 26 条名称与 `DEV_TOOL_NAMES.md` 一致 |
| P1-4 | `commands/call.ts`：`--json` / `--file` / `--file -`（仅非 TTY stdin） | 未知工具透传、参数错退 `2` |
| P1-5 | `commands/info.ts` / `project.ts` / `access.ts` | `project use` 后 MCP 端 `get_current_project` 生效（服务端默认项目） |

### P2 任务化命令 + 渲染 + 单测（1–1.5 天）

| # | 任务 | 判据 |
|---|---|---|
| P2-0 | 渲染层扩展：v2 text JSON / ```json 围栏 / XML 三级探测（设计稿 §7.4） | `src/render/detect.ts` | 三种返回都能正确出表；纯 JSON 文本不再被当成 CSV |
| P2-1 | `commands/{search,spaces,dashboards,charts,explores,fields,values,query,docs}.ts` 纯函数 | 映射完整性 26/26，入参名逐条比对设计稿 §6.2 |
| P2-2 | `render/*`：`structuredContent` 优先、CSV 退化、表格裁剪、`webUrl` 末列、`--out` 摘要 | 两类 fixture 渲染正确；坏数据退 `7` |
| P2-3 | 看板门控五类 `status` → 退 `4` + 服务端中文文案 | `dashboardStrictError.json` fixture |
| P2-4 | `query` 组装器（`-e/--dimensions/--metrics/--filter/--sort/--limit`）与 `--file` 透传 | `--dry-run` 输出与设计稿示例逐字一致 |
| P2-5 | 全量 `--help` 示例、`--quiet` / `--verbose` / `--raw` | 手工抽查 5 个命令 |

### P3 豆包连接器包（0.5–1 天）

| # | 任务 | 判据 |
|---|---|---|
| P3-1 | 新增 `plugin/com.doubao/cli.json`（键 `msy-x`） | JSON 合法、键不与 MCP 服务键重名 |
| P3-2 | `plugin/skills/brandct-x-insight/references/cli.md` + `SKILL.md` 增加「CLI 通道」 | 命令/参数/输出/退出码/失败处理齐全 |
| P3-3 | `scripts/verify.mjs` 增规则：`cli.json` 位置与结构、平台键、命令非空、`statusMatchRegex` 可编译、无二进制、无凭据、连接器键不重名 | `node scripts/verify.mjs` 全绿 |
| P3-4 | `scripts/build-plugin.mjs` 打包包含 `cli.json`；`README.md` 补 CLI 章节与"单连接器裁剪"步骤 | `dist/x-platform-assistant.zip` 内可见 `cli.json` |

### P4 发布（已完成脚本与流水线，首次发版待执行）

| # | 任务 | 状态 / 判据 |
|---|---|---|
| P4-1 | `pnpm pack-msyx`（= `pnpm -F msy-x-cli pack:tgz` → `scripts/pack-cli.mjs`）：`npm pack` → `dist-msy-x/msy-x-cli-<ver>.tgz` + `.sha256` | ✅ 已实现；临时 prefix 安装后可执行 |
| P4-2 | 发布流水线 `.github/workflows/release-msy-x-cli.yml`（tag `msyx-v*`） | ✅ 已实现；见下方发版流程 |
| P4-3 | `packages/msy-x-cli/README.md` | ✅ 已实现 |
| P4-4 | 发版：0.1.0 首发布、0.1.1 补 `login`/`logout` 别名、0.2.0 扫码登录 ✅；上线记录见下方 | ✅ 真实站点验收完成（2026-11-18，品牌预发扫码全流程 + 确认页中文化/登录提示验收通过） |

#### 分发基线（来自 `../k8s-config` master 的 `lightdash/lightdash-config.yaml`）

| 项 | 值 | 说明 |
|---|---|---|
| `S3_BUCKET` | `qmgy-report` | 与 lightdash 导出同桶；对象路径前缀区分用途 |
| `CDN_PATH_PREFIX` | `msy-x` | 前端静态资源在 `msy-x/static/<ver>/`，CLI 在 `msy-x/cli/` |
| `CDN_BASE_URL` | `https://img0.banmahui.cn` | 公共 CDN，**匿名可读**（已实测：`msy-x/static/...` 返 200） |
| ⚠️ 不可用 | `https://report-assets.brandct.com` | 同一 k8s 配置里的 `S3_PUBLIC_ENDPOINT`，用于**预签名**下载（私有对象）；豆包 `npm install -g` 无法带签名 |

#### 根脚本一览（`package.json`）

| 脚本 | 作用 |
|---|---|
| `pnpm pack-msyx` | 打包 tgz + sha256：`packages/msy-x-cli/dist-msy-x/msy-x-cli-<ver>.tgz` |
| `pnpm bump-msyx -- <ver>` | 同步 `package.json` 与 `src/lib/version.ts` 的 `CLI_VERSION`，commit，打 `msyx-v<ver>`（`--dry-run` 可用） |
| `pnpm set-msyx-url -- <url>` | 把公网 tgz 地址写进豆包 `cli.json` 的 `install.default` |
| `pnpm msy-x-cli-build` / `-test` / `-lint` / `-typecheck` / `-dev` | 包维度开发命令 |

#### 环境地址（内部信息，不从对外文档引用）

| 环境 | MCP 地址 | 备注 |
|---|---|---|
| 品牌站生产 | `https://x.brandct.com/api/v1/mcp` | 内置 v2，强制看板模式开启 |
| 内部站生产 | `https://lightdash.banmahui.cn/api/v1/mcp` | 内置 v2，不开强制看板模式 |
| 品牌站预发 | `https://x.pre.banmahui.cn/api/v1/mcp` | 内置 v2 |
| 旧版独立包（弃用中） | `https://mcp-x.brandct.com/mcp` / `https://mcp-lightdash.banmahui.cn/mcp` | 会话式 + `x-api-key`；k8s `lightdash-mcp` / `lightdash-internal-mcp` 仍在运行（最新 `mcp-v2.5.8`），退役按去留评估方案 C 走 |

#### 上线记录

| 版本 | 公网 tgz | sha256 | 发布时间 | 变更 |
|---|---|---|---|---|
| 0.1.0 | `https://img0.banmahui.cn/msy-x/cli/msy-x-cli/0.1.0/msy-x-cli-0.1.0.tgz` | `43decbb864aca48ac40eccf22abf5c81361c89dec4d4726b3fd4efc509fead26` | 2026-11-17 | 首个发布：35 命令、OAuth/PAT、doctor、verified |
| 0.1.1 | `https://img0.banmahui.cn/msy-x/cli/msy-x-cli/0.1.1/msy-x-cli-0.1.1.tgz` | `2287f542120768c96b437a562493c7342c2399f43cba57008c19dba0afc05b33` | 2026-11-17 | 顶层 `login`/`logout` 别名；本地凭证命令拒绝 `--dry-run` |
| 0.2.0 | `https://img0.banmahui.cn/msy-x/cli/msy-x-cli/0.2.0/msy-x-cli-0.2.0.tgz` | `6352ea0b9d269f07f771637c24cc6c950d4c7e1cc9db9b4660f02e5deed5420f` | 2026-11-18 | 扫码登录（RFC 8628 设备码）；WSL 无浏览器自动降级；扫码引导与兜底提示文案优化 |

两条均已在公网验证：`curl -sSI` 返回 `200` + `content-type: application/gzip`，且 `npm i -g <url>` 后 `msy-x --version` 正确、`--help` 含 `login`/`logout`。

#### 发版流程（0.1.x 通用）

1. 算好目标 URL（**确定性，可提前拼**）：`https://img0.banmahui.cn/msy-x/cli/msy-x-cli/<ver>/msy-x-cli-<ver>.tgz`
2. `pnpm set-msyx-url -- <URL>`：把地址写进 `packages/x-doubao-plugin/plugin/com.doubao/cli.json`（只改 `install.default`）
3. `pnpm bump-msyx -- <ver>`：同步 `package.json` 与 `src/lib/version.ts` → commit → 打 `msyx-v<ver>` tag（支持 `--dry-run`）
4. `git push && git push origin msyx-v<ver>` 触发流水线，依次：build + `pack:tgz` → **装到临时 prefix 冒烟** → 校验 `cli.json` 指向本 URL（门禁在**上传之前**，避免同版本不可重传的死锁）→ OSS 上传（不覆盖同版本）→ **CDN 匿名 HEAD 冒烟（200 + `application/gzip`）** → GitHub Release → step summary
5. 第 4 步全绿后，重新打豆包 Plugin ZIP（`cd packages/x-doubao-plugin && node scripts/verify.mjs` 必须 **0 警告**）并提审

> 失败处理：门禁/冒烟失败不会留下半成品（OSS 对象未写或已写但 `cli.json` 已提前对齐）；若已上传而后续步骤失败，`cli.json` 无需改（URL 未变），重跑流水线时需先在 OSS 删该版本对象或 bump 新版本——upload 脚本对同版本拒绝覆盖是刻意的。

---

## 5. 测试清单

> 纪律：只跑与改动直接相关的单文件/单用例；不用全量 `test`/`lint` 自检（见 [focused-testing](../../.agents/skills/focused-testing/SKILL.md)）。所有命令带 `timeout`。

### 5.1 单元（`tsx --test`，无网络）

| 文件 | 覆盖 |
|---|---|
| `config/store.test.ts` | `0600/0700`、原子写、坏 YAML 退 `2` 且不破坏原文件 |
| `config/profiles.test.ts` | `--site` > `MSY_X_MCP_URL` > `MSY_X_SITE_URL` > `currentSite`；未知 site |
| `auth/callbackServer.test.ts` | state 不匹配、重复回调、超时关闭、只绑回环 |
| `auth/oauth.test.ts` | mock：401 → 发现 → DCR → PKCE → token；`none` client 无 secret 分支 |
| `auth/refresh.test.ts` | 文件锁并发只刷一次；refresh 失败清凭证并退 `3` |
| `auth/headers.test.ts` | Bearer / `ApiKey` / `x-api-key` 三种头 |
| `mcp/callTool.test.ts` | 超时退 `6`、JSON-RPC 错误退 `5`、401 重试一次 |
| `commands/mapping.test.ts` | fixture 26 条：每条工具至少被一个命令生成；未知工具走 `call` |
| `commands/query.test.ts` | 组装器输出与设计稿示例一致；`--file` 透传不改写 |
| `commands/authStatus.test.ts` | 首键 `logged_in`、true/false 均退 `0`、正则命中 |
| `render/table.test.ts` / `csv.test.ts` | 列裁剪、`webUrl` 末列、引号/换行 CSV、坏数据退 `7` |
| `cli/exitCodes.test.ts` | 401/403/`dashboard_*`/5xx/超时/参数错的映射 |

### 5.2 契约与互操作

- `tools list` 输出与 `packages/lightdash-mcp/DEV_TOOL_NAMES.md` 逐条比对（新增/改名时该测试先红，提示同步）。
- 与 `@modelcontextprotocol/inspector --cli` 用同一 PAT 调同一工具，`--json --raw` 结果结构与 CLI 一致。

### 5.3 冒烟（真实站点，手动）

```bash
timeout 120 msy-x info
timeout 120 msy-x project list
timeout 120 msy-x explores find 品类宝
timeout 120 msy-x values pinleibaohsm_cls_top_period --search 2026Q2
timeout 180 msy-x query -e pinleibaohsm_cls_top \
  --dimensions cls_4 --metrics total_cls4_amount \
  --filter period=2026Q2 --filter region_name=华南地区 --filter cls_2=调味品 --limit 50
timeout 180 msy-x dashboards tiles d54853b1-85df-4ab3-8cdf-70a5244640e1
```

断言：退出码 `0`、stdout 为 JSON（非 TTY）、行数 > 0、`webUrl` 可打开。

### 5.4 安装与非交互

- `npm pack` → `npm i -g --prefix /tmp/msy-x-prefix ./msy-x-cli-0.1.1.tgz` → `/tmp/msy-x-prefix/bin/msy-x --version`。
- `msy-x --help < /dev/null`、`msy-x auth status < /dev/null` 不挂起。
- Windows 手测：`msy-x.cmd` 存在、`cmd /c start` 拉浏览器、回环回调可达、中文 UTF-8 不乱码。

---

## 6. 发布与分发

1. `pnpm -F msy-x-cli pack:tgz` → `dist-msy-x/msy-x-cli-<ver>.tgz` + `.sha256`。
2. 上传公网静态托管（HTTPS、无鉴权、可直连），路径稳定：`/<发布路径>/msy-x-cli-<ver>.tgz`。
3. 回填 `packages/x-doubao-plugin/plugin/com.doubao/cli.json` 的 `install.default`，`verify.mjs` 校验通过后重打 ZIP。
4. 拿到 npm 账号后：`npm publish --access public`，把 `install.default` 改为 `npm install -g msy-x-cli`（一行改动），保留 tgz 作为回退。
5. 版本策略：`0.x` 阶段只保证"命令名与退出码"稳定；参数新增走 minor，破坏性变更走 minor 并在 README 标注。

---

## 7. 风险与回滚

| # | 风险 | 应对 |
|---|---|---|
| 1 | DCR 目前只发 confidential client（必须存 `client_secret`） | 配置 `0600`；未来支持 `none` 时自动不发 secret |
| 2 | refresh 并发导致 refresh token 失效 | `refresh.lock` + 失败只清当前站点凭证 |
| 3 | `csv-parse` 体积/维护性 | 备选：手写 RFC4180 解析（约 40 行）+ 单测；先按依赖实现，超 2MB 再换 |
| 4 | 豆包安装默认走 npm 镜像，镜像缺失 | `install.default` 里显式带 `--registry https://registry.npmjs.org`（指南允许） |
| 5 | Windows 浏览器拉起/编码异常 | 平台分支 + `MSY_X_NO_BROWSER` 降级；文档给出手动 URL |
| 6 | 服务端新增工具导致 CLI 落后 | `call` 兜底 + `tools list` 自动可见；映射测试提示补齐 |
| 7 | 强制看板模式把常用查询拦成 `4` | 错误里原样透出服务端文案与候选看板，文档给 `--dashboard` 用法 |
| 8 | 后端 `type` 判别键被剥离导致 `run_metric_query` / `search_field_values` 二次 parse 失败（设计稿 §10.4） | **已修复**（`mcpToolArgs.withToolDiscriminator` + 回归测试），随主站镜像发布；在 x 站升级前 `query` 走 `run_semantic_metric_query` 主路径、`query flat` 标实验、`values` 失败提示改用 `query --dimensions` |
| 9 | **设备码会话存进程内存**：生产 `replicas: 2` + headless Service，CLI 的 `POST /device` 与手机 `GET /device/activate` 落到不同 pod → 约 50% 报 `Invalid Code` / `invalid_grant`；CLI 与手机无共同 cookie，粘滞会话无效 | **已修复（2.7.5）**：会话改存 Postgres `oauth2_device_codes`（`expires_at` 用 `TIMESTAMPTZ` 与 `now()` 比较），四个端点全部走共享存储；新增 router 层“两实例共享存储”回归测试；`doctor --remote` 增加 `device-flow` 探测；单副本环境（本地 dev / pre）无法复现，验收必须走双副本或该测试 |

**回滚**：卸载 CLI（`npm uninstall -g msy-x-cli`）+ 从 `cli.json` 移除连接器即可；不影响现有 MCP 连接器与站点。

---

## 8. 文档同步规则

1. **改契约（命令名、参数、输出、退出码、`cli.json` 字段）必须同步 [设计稿](./msy-x-cli-design.md)**；只改实施顺序/测试/发布才动本文。
2. 新增 MCP 工具时：更新 `packages/lightdash-mcp/DEV_TOOL_NAMES.md` → 设计稿 §6.2 映射表 → 映射测试 fixture。
3. 状态变更（待开发 → 已实施）时同时改：两篇文首状态行、`docs/README.md` 的 `cli/` 表、`docs/mcp/README.md` 的索引行。
4. 每次移动/新增文档后跑 `docs/README.md` 末尾的链接自检脚本，必须输出 `OK`。
