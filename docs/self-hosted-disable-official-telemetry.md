# 自托管：关闭官方遥测与无关外发

## 1. 背景

自托管场景下，Lightdash 官方 SaaS 用的 RudderStack / PostHog / Intercom / Headway / Pylon 对业务无价值，且可能：

- 向公网发送使用元数据（合规风险）
- 在内网环境卡住（例如 CLI `await` 官方 analytics 导致 Jenkins 部署挂起）

因此本 fork **硬关闭** 上述官方外发；仅保留可自配的 Sentry（有 DSN 才启用）。

## 2. 范围

| 能力 | 处理 | 说明 |
|------|------|------|
| RudderStack（前端 + 后端） | 硬关 | `writeKey` / `dataPlaneUrl` 恒为 `undefined`，忽略 env |
| PostHog | 硬关 | 配置恒为 `undefined` |
| Intercom | 硬关 | `appId` 恒为空，前端不 boot |
| Pylon | 硬关 | `appId` 恒为空，不加载 widget |
| Headway | 硬关 | CSP 不再放行相关域名 |
| CLI `analytics.lightdash.com` | 已关 | `packages/cli` track 空实现；见 CLI 镜像 |
| `track.sh` / `install.sh` | 已关 | 安装脚本不再上报 |
| Sentry | **保留自配** | 仅当配置 `SENTRY_*_DSN` 时启用 |

实现策略：**配置硬关 + SDK 空转**，不删除全库 `analytics.track(...)` 调用（调用点过多，合上游成本高）。无 key 时发送层直接 return / 不 `load` SDK。

## 3. 关键代码

- 后端配置：[`packages/backend/src/config/parseConfig.ts`](../packages/backend/src/config/parseConfig.ts)
- 后端 Analytics：[`packages/backend/src/analytics/LightdashAnalytics.ts`](../packages/backend/src/analytics/LightdashAnalytics.ts)（无 `writeKey` 时 `track`/`identify` 早退）
- App 初始化 / CSP：[`packages/backend/src/App.ts`](../packages/backend/src/App.ts)
- 前端 Tracking：[`packages/frontend/src/providers/Tracking/TrackingProvider.tsx`](../packages/frontend/src/providers/Tracking/TrackingProvider.tsx)
- 前端第三方：[`packages/frontend/src/providers/ThirdPartyServicesProvider.tsx`](../packages/frontend/src/providers/ThirdPartyServicesProvider.tsx)
- CLI：[`packages/cli/src/analytics/analytics.ts`](../packages/cli/src/analytics/analytics.ts)

## 4. CLI 工具镜像（Jenkins）

主站镜像 **不会** 自动更新 Jenkins 用的 CLI 工具镜像。

| 项 | 值 |
|----|-----|
| Git tag | `cli-vX.Y.Z`（触发 [`.github/workflows/build-docker-cli.yml`](../.github/workflows/build-docker-cli.yml)） |
| ACR 镜像 | `registry.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-X.Y.Z` |
| Jenkins 示例 | `IMAGE=registry-vpc.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-0.2107.7` |

Dockerfile 基于历史 `winwin/tool:mise` + dbt 1.9.8 + hologres/odps，CLI 使用本仓产物（已关遥测）。详见 [`packages/cli/Dockerfile`](../packages/cli/Dockerfile)。

## 5. 主站发版与验证

1. 合并含本改动的分支并发主站镜像（如 `pnpm bump-version`）
2. 部署后检查：
   - 浏览器 Network：无 `analytics.lightdash.com` / `rudderlabs` / `posthog` / `intercom` / `headway` / `usepylon`
   - `GET /api/v1/health`：`rudder` 无有效 key、`posthog` 为空、`intercom.appId` 为空
   - 登录 / 看板 / explore 正常；帮助菜单无官方客服弹窗
3. Jenkins 继续使用已验证的 `lightdash-cli-*` 镜像做 `dbt` + `lightdash deploy`

## 6. 环境变量说明

以下变量在自托管 **硬关后无效**，compose / `.env` 示例中已注释，生产也无需再配：

- `RUDDERSTACK_WRITE_KEY` / `RUDDERSTACK_DATA_PLANE_URL` / `RUDDERSTACK_ANALYTICS_DISABLED`
- `POSTHOG_PROJECT_API_KEY` / `POSTHOG_FE_API_HOST` / `POSTHOG_BE_API_HOST`
- `INTERCOM_APP_ID` / `INTERCOM_APP_BASE`
- `PYLON_APP_ID` / `PYLON_IDENTITY_VERIFICATION_SECRET`

仍可按需配置（自用排错）：

- `SENTRY_DSN` / `SENTRY_BE_DSN` / `SENTRY_FE_DSN` 等

## 7. 不做的事

- 不删除后端大量 `this.analytics.track(...)` 调用
- 不强制从依赖中移除 `rudder-sdk-js` / `@rudderstack/rudder-sdk-node`（未 load 则不上报）
- 不关闭已自配的 Sentry
