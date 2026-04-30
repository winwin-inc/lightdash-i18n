# Lightdash MCP 独立镜像：构建与阿里云部署

本文说明如何将 `packages/lightdash-mcp` 构建为独立镜像，并通过 GitHub Actions 推送到阿里云 ACR。

> 关联阅读：[Lightdash MCP 与 Skills 完整指南](../lightdash-mcp.md)、[包级 README](../../packages/lightdash-mcp/README.md)。

---

## 1. 部署形态

- Dockerfile 固定放在：`packages/lightdash-mcp/Dockerfile`
- 构建上下文使用仓库根目录（需要读取 workspace 的 lockfile 与 `packages/common`）
- 运行进程是 MCP HTTP 服务（默认端口 `3333`，端点 `/mcp`，健康检查 `/health`）

---

## 2. 本地构建与运行

### 2.1 构建镜像

```bash
docker build -f packages/lightdash-mcp/Dockerfile -t lightdash-mcp:0.1.0 .
```

开发调试建议加 `--no-cache`（避免吃到旧层）：

```bash
docker build --no-cache -f packages/lightdash-mcp/Dockerfile -t lightdash-mcp:dev .
```

### 2.2 运行镜像

```bash
docker run --rm -p 3333:3333 \
  -e LIGHTDASH_SITE_URL="https://your-lightdash.example.com" \
  -e LIGHTDASH_MCP_HTTP_PORT=3333 \
  lightdash-mcp:0.1.0
# 可选再加：-e LIGHTDASH_PROJECT_UUID="..."（未设时须 MCP 客户端先 set_project 或在工具里传 projectUuid）
```

也可以直接复用本地 `.env`：

```bash
docker run --rm -p 3333:3333 \
  --env-file packages/lightdash-mcp/.env \
  lightdash-mcp:dev
```

### 2.3 可选默认 API key

如果客户端不会在每次请求头里传 `x-api-key`，可在容器中设置：

```bash
-e LIGHTDASH_API_KEY="<optional-default-pat>"
```

### 2.4 本地连通性验证

容器启动后先做健康检查：

```bash
curl http://localhost:3333/health
```

预期返回 `{"ok":true}`（或同等健康响应）。

再验证 MCP 端点可访问：

```bash
curl -i http://localhost:3333/mcp
```

如果你在客户端（Cursor/Claude）里配置了该 URL，且请求头带 `x-api-key`，就可以直接开始调 MCP 工具（见 `packages/lightdash-mcp/README.md`）。

---

## 3. 环境变量（精简后）

| 变量 | 必填 | 说明 |
|------|------|------|
| `LIGHTDASH_SITE_URL` | 是 | Lightdash 站点根 URL（MCP 调 REST 使用） |
| `LIGHTDASH_PROJECT_UUID` | 否 | MCP 默认项目；未设时依赖 `set_project` 或工具参数 `projectUuid`（解析顺序见包 README） |
| `LIGHTDASH_API_KEY` | 否 | 默认兜底 PAT；优先级低于请求头 `x-api-key` 和 tool 参数 `apiKey` |
| `LIGHTDASH_MAX_LIMIT` | 否 | 查询 `limit` 上限 |
| `LIGHTDASH_MCP_HTTP_PORT` | 否 | HTTP 监听端口，默认 `3333` |

---

## 4. GitHub Actions 自动构建

新增工作流：`.github/workflows/build-docker-mcp.yml`

### 4.1 触发条件

- `workflow_dispatch`
- 推送 tag：`mcp-v*`（例如 `mcp-v0.1.0`）

### 4.2 构建与推送逻辑

- 使用 `packages/lightdash-mcp/Dockerfile`
- 推送到阿里云 ACR 的独立仓库 **`winwin/lightdash-mcp`**（与主应用 `winwin/lightdash` 分离）
- 首次使用前请在 ACR 控制台创建该仓库
- tag 规则：
  - **Git tag 触发**（`mcp-v*`）：例如 `mcp-v0.1.0` → 推送 `:0.1.0` 与 **`:latest`**
  - **手动 workflow_dispatch**：仅推送 **`:sha-<commit 前 12 位>`**（不更新 `latest`，避免误覆盖发布线）

### 4.3 需要的仓库 secrets

- `ALIYUN_REGISTRY_USER`
- `ALIYUN_REGISTRY_PASSWORD`

默认 registry 镜像名在 workflow 中设置为：

```text
registry.cn-hangzhou.aliyuncs.com/winwin/lightdash-mcp
```

如需调整，可直接改 workflow 的 `REGISTRY_IMAGE`。

---

## 5. 阿里云 ACR 手工推送（备用）

```bash
docker login registry.cn-hangzhou.aliyuncs.com

IMAGE_VERSION=0.1.0
REGISTRY=registry.cn-hangzhou.aliyuncs.com
NAMESPACE=winwin
REPO=lightdash-mcp

docker tag lightdash-mcp:${IMAGE_VERSION} ${REGISTRY}/${NAMESPACE}/${REPO}:${IMAGE_VERSION}
docker push ${REGISTRY}/${NAMESPACE}/${REPO}:${IMAGE_VERSION}
# 可选：docker tag ... :latest && docker push ... :latest
```

---

## 6. docker-compose 是否必要

本服务单进程、单端口，生产部署通常用 `docker run`/K8s 即可，**不强依赖** `docker-compose`。  
仅在本地希望和其他依赖服务统一编排时，再使用 compose。

## 6.1 要不要提供 docker-compose 文件？

**不是必须。**你现在这个 MCP 服务直接走「构建镜像 + 环境变量运行」就够了。  
只有在以下情况才建议加 compose：

- 你希望团队一条命令本地拉起（统一端口、统一 env-file）
- 你要和反向代理/其他本地服务一起联调

若你需要，我可以再补一个最小 `docker-compose.mcp.yml`（只包含一个 `lightdash-mcp` 服务）。

---

## 7. 常见本地构建错误

- **错误：** `invalid file request packages/common/node_modules/...`
  - 原因：build context 误包含本地 `node_modules`（含 pnpm 链接），BuildKit 读取失败。
  - 处理：确保仓库根 `.dockerignore` 已忽略 `**/node_modules`，然后重试构建。

- **错误：** `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`
  - 原因：Docker Desktop 引擎未启动或不可达。
  - 处理：启动/重启 Docker Desktop 后再执行 `docker build`。

---

## 8. 版本策略

- MCP 独立版本，建议从 `0.1.0` 开始
- `build-docker-mcp.yml` 推荐按 `mcp-vX.Y.Z` 打 tag 触发发布
- MCP 与 skills 版本不强制绑定；skills 可按文档节奏更新

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-30 | 切换为 `packages/lightdash-mcp/Dockerfile` + GitHub Actions（`mcp-image.yml`）方案，精简环境变量并移除 `LIGHTDASH_WEB_*_PATH_TEMPLATE` |
| 2026-04-29 | MCP 镜像改为独立 ACR 仓库 `winwin/lightdash-mcp`；镜像 tag 为 semver 数字 + `latest`（Git tag 仍为 `mcp-v*` 触发）；工作流更名为 `build-docker-mcp.yml`（与 `build-docker-with-i18n.yml` 的 `build-docker-*` 命名一致） |
