# MCP 线上地址一览

> **状态：已实施（2026-11-10）**。本文是当前两套 MCP 服务（主站内置 v2 与独立包 v1）在预发/生产的实际地址速查。接入方式见 [内置 MCP 上手指南](./mcp-v2-guide.md)（推荐）与 [独立包上线](./mcp-standalone-launch.md)；两套能力对照见 [独立包退役评估](./lightdash-mcp-retirement-evaluation.md)。

## 生产

### 外部品牌站（x.brandct.com）

| 服务 | 客户端连接地址 | 认证 | 强制看板模式 |
|---|---|---|---|
| **内置 v2（推荐）** | `https://x.brandct.com/api/v1/mcp` | PAT（`Authorization: ApiKey`）或主站 OAuth（scope `mcp:read`） | 开启（`MCP_DASHBOARD_STRICT=true`，需镜像 ≥ 2.7.1） |
| 独立包 v1（存量） | `https://mcp-x.brandct.com/mcp` | PAT（`x-api-key`） | 开启 |

- 内置健康检查：`GET https://x.brandct.com/api/v1/mcp/health`；独立包：`GET https://mcp-x.brandct.com/health`
- v1 默认项目：品牌账号项目（`3667f682-…`）；内置走四级项目回退（显式传参 > 用户默认 > 组织默认 > 部署默认）

### 内部站（lightdash.banmahui.cn）

| 服务 | 客户端连接地址 | 认证 | 强制看板模式 |
|---|---|---|---|
| **内置 v2（推荐）** | `https://lightdash.banmahui.cn/api/v1/mcp` | PAT 或主站 OAuth | 不开启（内部约定） |
| 独立包 v1（存量） | `https://mcp-lightdash.banmahui.cn/mcp` | PAT（`x-api-key`） | 不开启 |

- v1 默认项目：POS DB 项目（`07aa0ab7-…`）
- 内部人员/团队日常使用直接走内置 v2，无需额外部署与域名

## 预发

| 服务 | 地址 |
|---|---|
| 内置 v2（外部品牌预发） | `https://x.pre.banmahui.cn/api/v1/mcp` |
| 独立包 v1（外部品牌预发） | `https://mcp-x.pre.banmahui.cn/mcp` |
| 独立包 v1（内部预发） | `https://mcp-lightdash.pre.banmahui.cn/mcp` |

## 说明

- **两套并存**：v1 独立包仍在运行（k8s `lightdash-mcp` / `lightdash-internal-mcp`，含强制看板模式）；v2.7.1 起主站内置 MCP 具备同等权限管控（预检文案/看板门控/行级口径/clientUse 诊断），验收见 [内置部署指南 §7](./mcp-builtin-deploy.md)。灰度稳定后退役 v1（届时同步清理 k8s-config 中两处 ConfigMap 与 Apisix 路由）。
- 域名备注：`mcp.x.brandct.com` 与 `mcp-x.brandct.com` 均可解析（Apisix 双 host），证书匹配以连字符域名为准。
