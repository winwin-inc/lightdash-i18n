FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm i -g corepack@latest && corepack enable && corepack prepare pnpm@9.15.5 --activate

WORKDIR /usr/app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY .pnpmfile.cjs ./
COPY packages/common/package.json ./packages/common/package.json
COPY packages/lightdash-mcp/package.json ./packages/lightdash-mcp/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --filter @lightdash/mcp...

FROM deps AS build

COPY packages/common ./packages/common
COPY packages/lightdash-mcp ./packages/lightdash-mcp

RUN pnpm -F @lightdash/common build && pnpm -F @lightdash/mcp build
RUN pnpm --filter @lightdash/mcp deploy --prod /deploy

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /deploy /app

EXPOSE 3333

CMD ["node", "dist/http.js"]
