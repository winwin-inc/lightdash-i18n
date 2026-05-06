# lightdash-skills — 仓库内维护说明

本文仅面向在本 **monorepo** 中维护本技能包与 `lightdash-mcp` 的贡献者；对外分发技能时可不包含本文件。

## 打包（Claude Code 对外 zip）

仓库根执行 **`pnpm pack-lightdash-skills`**（脚本 [`scripts/pack-lightdash-skills.mjs`](../../scripts/pack-lightdash-skills.mjs)）。

- **产物**：`dist/lightdash-skills-v<version>.zip`，其中 `<version>` 来自本目录 [`version.json`](./version.json)；解压后顶层目录名为 **`lightdash-skills/`**。
- **内容**：白名单内的 `README.md`、`CLAUDE.md`、`version.json`、`.mcp.json.example`、`.claude/settings.json`、三技能目录下约定文件及 `lightdash-chart-semantics/resources/*.md`（仅 Claude Code 单轨，**不**生成 OpenClaw 等第二包）。
- **不包含**：`MAINTAINERS.md`、`.mcp.json`、`.env*`、`.gitignore`（默认）；中间 staging 目录为 `dist/lightdash-skills-pack/stage/`，发版物通常只取 zip 即可。

## 版本与 MCP 同号

- 技能包版本：[version.json](./version.json)
- 与 MCP npm 包版本一套发版时，与 `packages/lightdash-mcp/package.json` 的 `version` 保持同号即可。

## 仓库根脚本

维护命令在仓库根（脚本 [`scripts/bump-versions.mjs`](../../scripts/bump-versions.mjs)）：

```bash
pnpm bump-mcp-skills -- 0.1.1            # MCP package.json + 本目录 version.json
# 例外：node scripts/bump-versions.mjs skills 0.1.1   # 只改 version.json
# 例外：node scripts/bump-versions.mjs mcp 0.0.3     # 只改 MCP
```

`bump-versions.mjs` 的 `--no-commit`、`--no-tag`、打 `mcp-v*` tag、git push、CI 触发等细节见该脚本内注释及仓库内 **`docs/mcp/`** 下部署文档；已从 `lightdash-mcp/README.md` 对外段落中收束，避免重复罗列命令。

## 工具名与 DEV_TOOL_NAMES

- 工具名以 MCP 服务端注册为准；[`packages/lightdash-mcp/DEV_TOOL_NAMES.md`](../lightdash-mcp/DEV_TOOL_NAMES.md) 由仓库根 **`pnpm list-mcp-tools:write`**（或 `node scripts/list-mcp-tool-names.mjs --write`）根据源码生成，维护者按需执行。
- MCP 连接与完整参数说明：[`packages/lightdash-mcp/README.md`](../lightdash-mcp/README.md)、[`docs/lightdash-mcp.md`](../../docs/lightdash-mcp.md)。

## 更长流程 SOP（仓库文档）

- 完整查询门禁与阶段划分（若仍放在 monorepo）：[`docs/mcp/lightdash-mcp-query-sop.md`](../../docs/mcp/lightdash-mcp-query-sop.md)。  
  技能包内精简门禁见 [`lightdash-insight-router/ROUTER-SOP.md`](./lightdash-insight-router/ROUTER-SOP.md)。
