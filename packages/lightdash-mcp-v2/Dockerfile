FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm i -g corepack@latest && corepack enable && corepack prepare pnpm@9.15.5 --activate

WORKDIR /usr/app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY .pnpmfile.cjs ./
COPY packages/common/package.json ./packages/common/package.json
COPY packages/lightdash-mcp-v2/package.json ./packages/lightdash-mcp-v2/package.json

# 仓库可能未写入 mcp-v2 的 lockfile importer；CI 用非 frozen 安装以保证可构建
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --no-frozen-lockfile --prefer-offline --filter @lightdash/mcp-v2...

FROM deps AS build

COPY packages/common ./packages/common
COPY packages/lightdash-mcp-v2 ./packages/lightdash-mcp-v2

RUN pnpm -F @lightdash/common build && pnpm -F @lightdash/mcp-v2 build
RUN pnpm --filter @lightdash/mcp-v2 deploy --prod /deploy

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /deploy /app

EXPOSE 3333

CMD ["node", "dist/http.js"]
