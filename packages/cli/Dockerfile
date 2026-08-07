# Jenkins CLI 工具镜像（对齐历史 justfile + mise Dockerfile）
# 历史打法：docker build --build-arg VERSION=x.y.z -t .../tool:lightdash-cli-x.y.z
# 现打法：git tag cli-vX.Y.Z → Actions 推送 .../tool:lightdash-cli-X.Y.Z
# Jenkins：
#   IMAGE=registry-vpc.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-0.2107.7
#
# 唯一刻意差异：不用 npm install -g @lightdash/cli（官方包），
# 改为装本仓构建产物（已禁用官方遥测）。

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

# ---------- 运行时：与历史 Dockerfile 对齐 ----------
FROM registry.cn-hangzhou.aliyuncs.com/winwin/tool:mise

ARG VERSION=0.2107.7
LABEL org.opencontainers.image.version="${VERSION}"

RUN mise use -g node@18

COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /uvx /bin/

ENV UV_PYTHON_INSTALL_DIR=/uv \
    UV_TOOL_DIR=/uv/tools \
    UV_TOOL_BIN_DIR=/uv/bin \
    UV_DEFAULT_INDEX=http://mirrors.aliyun.com/pypi/simple/ \
    PATH=/uv/bin:$PATH

RUN uv python install 3.11

RUN apt-get update \
    && apt-get -y --no-install-recommends install \
        git ssh \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=bind,source=packages/cli/docker/requirements.txt,target=requirements.txt \
    uv tool install --with-requirements requirements.txt dbt-core==1.9.8

# 历史：RUN npm install -g @lightdash/cli@v${VERSION}
# 现：安装本仓 CLI（禁用遥测），版本由镜像 tag / ARG VERSION 标识
COPY --from=build /deploy /opt/lightdash-cli

RUN printf '%s\n' '#!/bin/sh' 'exec node /opt/lightdash-cli/dist/index.js "$@"' \
        > /usr/local/bin/lightdash \
    && chmod 755 /usr/local/bin/lightdash \
    && chmod -R a+rX /opt/lightdash-cli /uv \
    && (chmod -R a+rX /root/.local 2>/dev/null || true)

USER 1001:1001
RUN lightdash --version && dbt --version && node -v
USER root
