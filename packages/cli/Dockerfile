# Jenkins CLI 工具镜像（对齐历史 mise + uv + dbt 构建方式）
# 正式发布：打 git tag cli-vX.Y.Z → 推送 winwin/tool:lightdash-cli-X.Y.Z（带版本，不覆盖旧 tag）
# Jenkins 示例：
#   IMAGE=registry-vpc.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-0.2107.7
#
# 与历史 Dockerfile 的差异：不再 npm install 官方 @lightdash/cli，
# 改为安装本仓构建产物（已禁用官方遥测）。

# ---------- 构建本仓 CLI ----------
FROM node:20-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm i -g corepack@latest \
    && corepack enable \
    && corepack prepare pnpm@9.15.5 --activate

WORKDIR /usr/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY .pnpmfile.cjs ./
COPY packages/common/package.json ./packages/common/package.json
COPY packages/warehouses/package.json ./packages/warehouses/package.json
COPY packages/cli/package.json ./packages/cli/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --filter @lightdash/cli...

COPY packages/common ./packages/common
COPY packages/warehouses ./packages/warehouses
COPY packages/cli ./packages/cli

RUN pnpm -F @lightdash/common build \
    && pnpm -F @lightdash/warehouses build \
    && pnpm -F @lightdash/cli build \
    && pnpm --filter @lightdash/cli deploy --prod /deploy

# ---------- 运行时：历史 mise 底座 + dbt + 本仓 CLI ----------
FROM registry.cn-hangzhou.aliyuncs.com/winwin/tool:mise

# 历史镜像用 node@18；本仓 CLI 按 Node 20 构建，运行时用 20 更稳
RUN mise use -g node@20

COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /uvx /bin/

ENV UV_PYTHON_INSTALL_DIR=/uv \
    UV_TOOL_DIR=/uv/tools \
    UV_TOOL_BIN_DIR=/uv/bin \
    UV_DEFAULT_INDEX=http://mirrors.aliyun.com/pypi/simple/ \
    PATH=/uv/bin:$PATH

RUN uv python install 3.11

RUN apt-get update \
    && apt-get -y --no-install-recommends install git ssh \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=bind,source=packages/cli/docker/requirements.txt,target=requirements.txt \
    uv tool install --with-requirements requirements.txt dbt-core==1.9.8

# 替代：npm install -g @lightdash/cli@v${VERSION}
COPY --from=build /deploy /opt/lightdash-cli

RUN printf '%s\n' '#!/bin/sh' 'exec node /opt/lightdash-cli/dist/index.js "$@"' \
        > /usr/local/bin/lightdash \
    && chmod 755 /usr/local/bin/lightdash \
    && chmod -R a+rX /opt/lightdash-cli /uv \
    && (chmod -R a+rX /root/.local 2>/dev/null || true)

# 冒烟：对齐 Jenkins -u 1001:1001
USER 1001:1001
RUN lightdash --version && dbt --version && node -v
USER root
