# 马上赢X

面向业务的自助分析平台。连接数据仓库与 dbt 项目，支持探索分析、看板与报表、定时推送等。

## 主要功能

-   **自助分析**：基于 dbt 语义层的探索、维度与指标
-   **看板与报表**：拖拽看板、多种图表、筛选与联动
-   **定时与推送**：看板 / 图表定时跑数、结果推送（邮件等）
-   **权限与协作**：项目 / 空间权限、分享
-   **多语言**：内置中英文

## 仓库结构

TypeScript monorepo（pnpm workspaces）：

-   `packages/frontend`：React 前端
-   `packages/backend`：API 与数据库
-   `packages/common`：共享类型与业务逻辑
-   `packages/warehouses`：数据仓库适配
-   `packages/cli`：dbt 项目管理 CLI
-   `packages/lightdash-mcp`：MCP 查询服务

## 国际化

使用 i18next，翻译文件：

-   `packages/frontend/public/locales/en/translation.json`
-   `packages/frontend/public/locales/zh/translation.json`

新增或修改文案时，中英文 key 需同步更新。`zh-CN` / `zh-Hans` 会映射到 `zh` 目录。

## 版本与发版

-   开发环境：更新小版本号（如 `v0.2109.4`）
-   生产上线：更新次要版本号（如 `v0.2109`）
-   变更记录：[CHANGELOG.md](CHANGELOG.md)

MCP / CLI 工具镜像由独立 workflow 构建（`mcp-v*` / `cli-v*`），不会打主站镜像。

## 分支管理

-   `main`：稳定版本
-   `dev`：开发主分支
-   `feat/xxx`：功能分支（基于 `dev`）

详见 [分支管理](docs/branch-manage.md)。

## 相关文档

-   [Lightdash MCP](docs/lightdash-mcp.md)
-   [本地前端调试线上环境](docs/local-frontend-debug-production.md)
