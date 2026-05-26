# Charts Viewer

查询组合 + ECharts 图表展示。通过 Lightdash 表查询接口获取数据，用 ECharts 渲染。

## 环境变量

在项目根目录或 `packages/charts-viewer` 下创建 `.env.local`（可参考 `.env.example`）：

- `LIGHTDASH_SITE_URL`：Lightdash 实例地址（如 `https://x.brandct.com`）
- `LIGHTDASH_API_KEY`：Lightdash 用户的 Personal Access Token
- `LIGHTDASH_PROJECT_UUID`：默认使用的项目 UUID（前端不提供项目选择时使用）

## 开发

```bash
pnpm install
pnpm dev
```

访问 http://localhost:3999

## 流程

1. 前端请求 `GET /api/config` 获取 projectUuid
2. 选择表（explore）后请求 `GET /api/explores?projectUuid=...`、`GET /api/explores/[id]?projectUuid=...` 获取字段
3. 选择 X 轴（维度）、Y 轴（指标）后请求 `POST /api/query/run` 执行 metric-query
4. 使用返回的 rows/columns 生成 ECharts option 并渲染
