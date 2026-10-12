# @lightdash/mcp-v2 更新日志

> **状态：开发中（WIP）**
>
> 对应独立产品线 **lightdash-mcp-v2**（源码目录 `packages/lightdash-mcp-v2`，包名 `@lightdash/mcp-v2`）：protocol 2026-07-28 sessionless / legacy:stateless 兼容。
> 与 monorepo 既有 `@lightdash/mcp`（见 [`CHANGELOG-mcp.md`](CHANGELOG-mcp.md)）分离追踪。主站 [`CHANGELOG.md`](CHANGELOG.md) 不含本产品线条目。

## v2.2.4 (2026-10-10)

-   **新功能**
    -   支持 `LIGHTDASH_PUBLIC_SITE_URL`（含配置与测试）

## v2.2.2 ~ v2.2.3 (2026-10-09)

-   **新功能**
    -   看板上下文处理：多候选时支持随机选用
    -   增强查询权限处理：explore 查询权限拒绝路径及相关测试
-   **文档**
    -   更新 `get_my_access` 相关说明

## v2.2.0 (2026-10-08)

-   **新功能**
    -   接入 `get_my_access` 工具使用说明；调整项目工具数量

## v2.1.6 ~ v2.1.7 (2026-09-22)

-   **调优**
    -   增强 Keycloak JWT 验证与换票日志记录
-   **文档**
    -   扫码后 500 错误处理：配置要求与运维验收步骤
    -   新接入强调仅配置 URL + OAuth，移除 API Key 相关说明

## v2.1.5 (2026-09-20)

-   **新功能**
    -   OAuth 受保护资源元数据（Protected Resource Metadata）构建及测试

## v2.1.3 ~ v2.1.4 (2026-09-18)

-   **新功能**
    -   Keycloak OAuth 鉴权及短期 PAT 交换
    -   缺失环境变量检测及单元测试
-   **文档**
    -   MCP v2 运维部署（K8s / Docker）；协议与传输说明及快速接入指南

## v2.0.0 ~ v2.1.2 (2026-09-16)

-   **新功能**
    -   新增 `lightdash-mcp-v2` 包：HTTP 服务、工具注册、`DEV_TOOL_NAMES` 与基础配置（sessionless / legacy:stateless 兼容）
    -   升至 2.1.0：无状态兼容模式协议描述；查询 `offset` 支持；`LIGHTDASH_MCP_LOG_LEVEL`
    -   UTF-8 字符集支持（2.1.2）
-   **文档**
    -   v2 说明及与 v1（`@lightdash/mcp`）差异对比；Dockerfile 路径调整；项目选择及错误提示说明