# 本仓看板 YAML 与同步说明

命令、安装、更新见 [cli-standalone-usage.md](./cli-standalone-usage.md)。本文只写 YAML、权限、以及和官方的差异。

## YAML

后端走 `/api/v1/projects/{id}/code/{spaces,charts,sqlCharts,dashboards}`。看板 YAML 在官方字段之外还有：

- Tab / tile 用 **slug**（不要手抄环境本地 UUID）
- `tabs[].filters`：Tab 级筛选
- `tabSlug`：由 Tab 名派生（中文名会变成 `tab-{n}`，重名加 `-1` / `-2`）；upload 先按 `tabSlug`，再退回 `tabUuid`
- `config`：颜色同步、Tab 筛选开关、必填筛选锁 Tab（`lockedTabUuids` 按 slug 映回）
- 公式 / PoP、`--language-map`

导入按 `slug` 匹配。目标环境要有兼容的 dbt explore / 字段 / 指标。对不上的 slug 会丢掉并 warning，不阻断 upload。不要用会剥未知字段的工具改 YAML。

download 有时会写出 `config: null`。本仓 lint 要求 `config` 是 object，要绿就删掉该字段或改成 `{}`。不要为了过官方 lint 去剥 `tab.filters`。

## 权限

| 角色 | download | upload |
|---|---|---|
| Viewer / Interactive viewer | 否 | 否 |
| Editor | 是 | 是 |
| Developer / Admin / 现有 Service Account | 是 | 是 |
| 自定义角色只勾 `view:ContentAsCode` | 是 | 否 |

只读同步：自定义角色只授 `view:ContentAsCode` + PAT。已落库的旧自定义角色不会自动多出 view/create。空间权限仍在：进不了的 private space 下不了、也建不进去。跨环境 space ACL 按 email / group name 对齐，对不上警告并跳过。

## 同步时会警告、不会中断

- 缺依赖 chart：看板仍上传，对应 tile 暂时空着。补上 chart 再 upload。
- spaces 失败：跳过，不影响 charts / dashboards。
- SQL chart 走 space ACL：无权私人目录里的 SQL 图拉不到。
- 私人 space 只要调用者有权就会导出。跨环境不想带时，删掉本地 `spaces/*.space.yml`。无权看到的 space 在接口 `skipped` 里，不会写进 YAML。

## 范围

- `download` / `upload`：看板、图表、SQL 图表、space。`lightdash deploy` 是 dbt explores / table-groups，不要混用。
- 默认 download 会打 `/code/spaces`（404/403 警告继续）、`/code/charts`、`/code/sqlCharts`、`/code/dashboards`。旧路径 `/charts/code`、`/dashboards/code` 仍给 MCP / 旧脚本用。
- 本仓有 `/code/virtualViews`，CLI 默认不拉，也没有 `--include-virtual-views`。
- 不做：组织级 users / groups / roles as-code、agents、定时任务、告警、homepages、`--include-all`、官方 lint 整仓门禁。
- `.lightdash-metadata.json` 是 CLI 写在本地的，服务端不会生成。

官方 CLI 仅作对照，不要当操作命令：官方 `lint` 不认 `tabs[].filters`；官方较新版本 `-d` 也会带 SQL 图，本仓现在同样会带（upload 仍靠本地 `*.sql.yml`，先 download 再 `--include-charts`）。
