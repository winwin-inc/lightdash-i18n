# Jenkins CLI 工具镜像：以既有 lightdash-cli（含 dbt + hologres）为底座，仅覆盖本仓新编译的 CLI。
# 正式发布：打 git tag cli-vX.Y.Z 触发 .github/workflows/build-docker-cli.yml
# Jenkins 建议固定使用：
#   IMAGE=registry-vpc.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli

ARG BASE_IMAGE=registry.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-0.2091.2

FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm i -g corepack@latest \
    && corepack enable \
    && corepack prepare pnpm@9.15.5 --activate

WORKDIR /usr/app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY .pnpmfile.cjs ./
COPY packages/common/package.json ./packages/common/package.json
COPY packages/warehouses/package.json ./packages/warehouses/package.json
COPY packages/cli/package.json ./packages/cli/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --filter @lightdash/cli...

FROM deps AS build

COPY packages/common ./packages/common
COPY packages/warehouses ./packages/warehouses
COPY packages/cli ./packages/cli

RUN pnpm -F @lightdash/common build \
    && pnpm -F @lightdash/warehouses build \
    && pnpm -F @lightdash/cli build

RUN pnpm --filter @lightdash/cli deploy --prod /deploy

FROM ${BASE_IMAGE} AS runtime

# 覆盖旧 CLI；保留底座中的 dbt / hologres 等工具
COPY --from=build /deploy /opt/lightdash-cli

RUN printf '%s\n' '#!/bin/sh' 'exec node /opt/lightdash-cli/dist/index.js "$@"' \
        > /usr/local/bin/lightdash \
    && chmod 755 /usr/local/bin/lightdash \
    && chmod -R a+rX /opt/lightdash-cli

# 冒烟：确保非 root（Jenkins -u 1001:1001）可用
USER 1001:1001
RUN lightdash --version && dbt --version && node -v
USER root
