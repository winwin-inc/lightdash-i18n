# lightdash-skills — 仓库内维护说明

本文仅面向在本 **monorepo** 中维护本技能包与 `lightdash-mcp` 的贡献者；对外分发技能时可不包含本文件。

## 版本

技能包**不单独维护版本号**。MCP 发版以 `packages/lightdash-mcp/package.json` 为准；仓库根执行：

```bash
pnpm bump-mcp -- 0.4.4
```

细节（`--no-commit` / `--no-tag`、`mcp-v*` tag、CI）见 [`scripts/bump-versions.mjs`](../../scripts/bump-versions.mjs) 与 **`docs/mcp/`**。

## 工具名与 DEV_TOOL_NAMES

- 工具名以 MCP 服务端注册为准；[`packages/lightdash-mcp/DEV_TOOL_NAMES.md`](../lightdash-mcp/DEV_TOOL_NAMES.md) 由仓库根 **`pnpm list-mcp-tools -- --write`**（或 `node scripts/list-mcp-tool-names.mjs --write`）根据源码生成，维护者按需执行。
- MCP 连接与完整参数说明：[`packages/lightdash-mcp/README.md`](../lightdash-mcp/README.md)、[`docs/mcp/README.md`](../../docs/mcp/README.md)。

## 查询 SOP

技能包内门禁见 [`lightdash-insight-router/ROUTER-SOP.md`](./lightdash-insight-router/ROUTER-SOP.md)。  
仓库 MCP 文档索引：[`docs/mcp/README.md`](../../docs/mcp/README.md)。
