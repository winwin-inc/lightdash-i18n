# CLAUDE.md

本文件为在本地仓库中编写代码时提供给 Claude Code 的说明。

## 项目概述

本项目为面向业务的自助分析平台，连接数据仓库与 dbt 项目，支持探索分析、看板与报表、定时推送等。TypeScript monorepo，基于 pnpm workspaces。

## 架构

**Monorepo 结构**（pnpm workspaces）：

-   `packages/common/` - 共享工具、类型与业务逻辑
-   `packages/backend/` - Node.js/Express API 服务与数据库层
-   `packages/frontend/` - React 前端，Vite 构建
-   `packages/warehouses/` - 数据仓库适配（BigQuery、Snowflake、Postgres 等）
-   `packages/cli/` - dbt 项目管理命令行
-   `packages/e2e/` - Cypress 端到端测试

**主要技术栈：**

-   Backend: Express.js、Knex.js ORM、PostgreSQL、TSOA（OpenAPI 生成）
-   Frontend: React 19、Mantine v8、Emotion、TanStack Query
-   构建: pnpm workspaces、TypeScript project references、Vite

## 常用开发命令

-   默认认为 dev-server 已启动
-   优先使用包维度的命令做 lint/typecheck/test，速度更快

**代码质量：**

```bash
pnpm -F common lint
pnpm -F backend lint
pnpm -F frontend lint
pnpm -F common typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck
```

**测试：**

```bash
pnpm -F common test
pnpm -F backend test:dev:nowatch # 仅跑有改动的测试
```

**API 生成：**

控制器变更后需重新生成 OpenAPI 规范（TSOA）：

```bash
pnpm generate-api
```

**数据库迁移：**

```bash
# 新建迁移
pnpm -F backend create-migration migration_name_with_underscores

# 执行迁移
pnpm -F backend migrate

# 回滚最近一次迁移
pnpm -F backend rollback-last
```

## 开发流程

1. **包管理**：使用 `pnpm`（v9.15.5+），不要用 npm 或 yarn
2. **TypeScript**：各包使用 TypeScript project references 做类型检查
3. **Lint**：ESLint（Airbnb 配置），包含 `no-floating-promises`
4. **Pre-commit**：Husky + lint-staged 对暂存文件做 lint/format
5. **数据库**：Knex.js 做迁移与查询
6. **API**：TSOA 从 TypeScript 控制器生成 OpenAPI
7. **鉴权**：基于 CASL 的权限，支持多种登录方式

## 各包说明

**Backend（`packages/backend/`）：**

-   Express.js，基于 session 的认证
-   数据库迁移在 `src/database/migrations/`
-   控制器使用 TSOA 装饰器生成 API
-   定时任务使用 node-cron

**Frontend（`packages/frontend/`）：**

-   Vite 开发与构建
-   Mantine v8 组件库与自定义主题
-   Monaco Editor 编辑 SQL
-   TanStack Query 管理服务端状态

**Common（`packages/common/`）：**

-   各包共用的类型与工具
-   CASL 权限逻辑
-   发布为 `@lightdash/common`（包名与代码一致，勿改）

## TypeScript Project References

**注意**：SDK 构建变更后，需依赖 project references 保证 IDE 类型正确：

-   各包已开启 `"composite": true`
-   frontend/backend 在 tsconfig.json 的 `"references"` 中引用 common
-   common 构建产物：ESM（`dist/esm`）、CJS（`dist/cjs`）、Types（`dist/types`）
-   Web worker 引用 common 时使用构建后的 ESM 路径：`@lightdash/common/dist/esm/[module]`

## 关键配置文件

-   `/tsconfig.json` - TypeScript 工程引用
-   `/pnpm-workspace.yaml` - 工作区配置
-   `/.eslintrc.js` - 全局 ESLint
-   `/package.json` - 根脚本与依赖
-   `.env.development.local` - 本地开发环境变量

## 测试相关

-   可用 puppeteer mcp 操作前端页面
-   测试账号：demo@lightdash.com，密码：demo_password!（与 seed 一致）
-   重置库并灌数：`./scripts/reset-db.sh`

## 当前项目状态

-   客户支持类事项在 milestone 184

## Issue 约定

-   bug 使用标签 🐛 bug

## 代码风格

-   不用 duck typing；参数类型明确，不混用多种类型
-   **对象形状尽量严格**：优先用必选字段，仅在确实可选时才用 optional
    -   ✅ 推荐：`{ charts: Chart[] }`（可为空数组）
    -   ❌ 避免：`{ charts?: Chart[] }`（缺省与空难以区分）
-   **缺省值用 null**：可能不存在时用 `T | null`，不用可选属性表示“没有”
    -   ✅ 推荐：`{ createdBy: User | null }`
    -   ❌ 避免：`{ createdBy?: User }`
-   **适合用可选属性的情况**：向后兼容、API 省略有语义、配置项有默认值

## TypeScript 工具

-   **switch 穷举用 `assertUnreachable`**：union 在 switch 中处理时，default 里用 `assertUnreachable`，便于 TS 在漏 case 时报错
    -   ✅ 推荐：`default: return assertUnreachable(value, 'Unknown status');`
    -   ❌ 避免：`default: throw new Error('Unknown status');`
    -   从 common 引入：`import { assertUnreachable } from '@lightdash/common';`

## 开发排错

-   dbt 相关问题时，确认仓库根目录有 python3 venv，且已安装 dbt-core、dbt-postgres

## 本地数据库调试

可用 `psql` 直连本地开发库，例如：

```bash
# 查看表结构
psql -c "\d cached_explores"

# 查项目
psql -c "SELECT project_uuid, name FROM projects LIMIT 5;"
```

## 使用 Personal Access Token 调 API

可用 `curl` 调试本地接口，例如：

```bash
# 列出项目下 space
curl -H "Authorization: ApiKey $LDPAT" "$SITE_URL/api/v1/projects/PROJECT_UUID/spaces"

# 列出组织下的项目
curl -H "Authorization: ApiKey $LDPAT" "$SITE_URL/api/v1/org/projects"

# v2 content API：仅根级 space
curl -H "Authorization: ApiKey $LDPAT" "$SITE_URL/api/v2/content?contentTypes=space&projectUuids=PROJECT_UUID&page=1&pageSize=25"
```
