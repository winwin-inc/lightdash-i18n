# 本仓看板 YAML 与同步说明

日常 download / upload / lint 的命令和流程见 [cli-standalone-usage.md](./cli-standalone-usage.md)。本文只说明本仓 YAML、权限、以及和官方的差异。

不要用官方 `npx @lightdash/cli` 做日常同步或整仓 lint。

## 本仓 YAML 会带什么

后端已对齐官方 Content as Code 路由 `/api/v1/projects/{id}/code/{spaces,charts,sqlCharts,dashboards}`。导出的看板 YAML 在官方字段之外还有本仓扩展：

- Tab / tile 用 **slug**（不再靠环境本地 UUID）
- `tabs[].filters`：Tab 级筛选
- `tabSlug`：由 Tab 名派生（中文名会变成 `tab-{n}`，重名加 `-1` / `-2`）；upload 时先按 `tabSlug` 对现有 Tab，再退回 `tabUuid`
- `config`：颜色同步（`syncChartTileUuids`）、Tab 筛选开关（`tabFilterEnabled` / `showTabAddFilterButton`）、必填筛选锁 Tab（`lockedTabUuids`）按 slug 跨环境映回
- 公式 / PoP
- `--language-map` 生成的语言映射

对不上的 slug 会丢掉并记 warning，不阻断 upload。不要把手改回环境本地 UUID，也不要用会剥未知字段的工具改 YAML。

导入按 `slug` 匹配。目标环境中已有相同 slug 的图表或看板时，会更新已有内容。目标环境需要有兼容的 dbt explore、字段和指标，否则导入后的图表可能无法正常查询。

## 校验只用本仓 lint

```powershell
lightdash lint --path ./lightdash
```

本仓 schema 显式含 `tabs[].filters` 和本仓 `config` 扩展。

不要用官方 `npx @lightdash/cli lint` 扫整个 `dashboards/`。官方 schema 的 `DashboardTabAsCode` 是 `additionalProperties: false` 且没有 `filters`，带了 Tab 级筛选的 YAML 必红。这不是 YAML 坏了。也不要把 Tab 筛选挪到 `config` 去骗官方 lint。

## 权限

| 角色 | download | upload |
|---|---|---|
| Viewer / Interactive viewer | 否 | 否 |
| Editor | 是 | 是 |
| Developer / Admin / 现有 Service Account | 是 | 是 |
| 自定义角色只勾 `view:ContentAsCode` | 是 | 否 |

只读同步给 agent 时：自定义角色只授 `view:ContentAsCode` + PAT。已落库的旧自定义角色不会自动多出 view/create，需要管理员补 scope。空间权限仍在：进不了的 private space 下不了、也建不进去。跨环境 space ACL 按 email / group name 对齐，对不上会警告并跳过，不会阻断 chart / dashboard upload。

## 默认会请求哪些接口

默认 download 会请求：

- `GET /api/v1/projects/{id}/code/spaces`（404/403 会警告并继续）
- `GET /api/v1/projects/{id}/code/charts`
- `GET /api/v1/projects/{id}/code/sqlCharts`
- `GET /api/v1/projects/{id}/code/dashboards`

旧路径 `/charts/code`、`/dashboards/code` 仍可用，供 MCP / 旧脚本兼容。

本仓还有 `GET/POST /code/virtualViews`。本仓 CLI 默认 download **不会**拉虚拟视图，也没有 `--include-virtual-views`。需要时调 API。

## 同步时会警告、不会中断的情况

- 缺依赖 chart：看板仍会上传，对应 tile 暂时空着；本仓 CLI 会打印 warning。补上 chart 后再 upload 一次即可。
- spaces 失败：警告并跳过，不影响 charts / dashboards。
- SQL chart 下载走 space ACL：Editor 拉不到无权私人目录里的 SQL 图。
- 私人 space 只要调用者有权就会导出（含中文 `spaceName`）。本仓没有「个人默认目录」单独排除。跨环境不想带私人目录时，删掉本地 `lightdash/spaces/*.space.yml` 即可。无权看到的 space 会出现在接口 `skipped` 里，不会写进 `spaces[]`。

## 不要和 `lightdash deploy` 混用

- `download` / `upload`：看板、图表、SQL 图表、space 的 Content as Code。
- `lightdash deploy`：dbt explores / table-groups（数据集多级分组）。

`.lightdash-metadata.json` 是 CLI download 写在本地的，服务端不会生成。提交仓库或做 diff 时按团队约定处理即可。

## 不在范围内

- 组织级 users / groups / roles as-code（不要跑 `download --organization` 或 `upload --organization`）
- agents、定时任务、告警、homepages、Google Sheets
- `--include-all`（更新的官方 CLI 还会请求上面这些未实现端点）
- 官方 `lightdash lint` 整仓门禁

## 和官方 CLI 的差异（只作对照）

官方 CLI 仅作对照，不作为操作命令。

- 官方 `@lightdash/cli@2.58.0` 的 `lint` 不认 `tabs[].filters`，带 Tab 筛选的本仓 YAML 必红
- 官方 `--dashboards` 会把依赖的 saved chart **和** SQL chart 一起下载；本仓 CLI 的 `-d` 只带 saved chart
- 官方默认 download 也不会拉 virtual views；官方需要 `--include-virtual-views`，本仓 CLI 没有该 flag
- 官方 npm CLI 只比对 major 版本（都是 `2.x`），`diagnostics` 成功不代表 download 能用
