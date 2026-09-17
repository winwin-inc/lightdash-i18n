# msyx-mcp-workbuddy

WorkBuddy **MCP + Skill** 连接器：马上赢X。

```
msyx-mcp-workbuddy/
├── connector-meta.json
├── mcp.json
├── token-schema.json
├── icon.svg                 # 与本仓库前端平台图标一致（logo-icon）
└── skills/
    └── msyx-analyst/
        └── SKILL.md
```

| 项 | 值 |
|----|----|
| source | `msyx-mcp` |
| MCP | `https://mcp-x.brandct.com/mcp`（streamableHttp） |
| 鉴权 | 用户自填 Token：`x-api-key: ${API_KEY}` |

提交时打包本目录，勿写入真实 API Key。