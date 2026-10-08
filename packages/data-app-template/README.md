# 数据应用脚手架（母版）

这是**母版工程**，不要在这里写业务。用仓库根目录脚本拷一份再改：

```bash
pnpm create-data-app my-sales-kpi
```

会生成 `data-apps/my-sales-kpi/`（不进 pnpm workspace，不打进主站 bundle）。

本地 Vite + React，用 `@lightdash/query-sdk` 查语义层。`pnpm build` 后在产品上传，即可嵌进看板。不走 AI generate，也不走云端 sandbox。

## 角色

| 东西 | 角色 |
|------|------|
| `packages/query-sdk` | 取数库，**不是** dapp。本期不用改、不用配 Key |
| `packages/data-app-template` | 工程母版 |
| `data-apps/<slug>/` | 你的最小 dapp |
| 产品里上传后的 app | 真正可嵌看板的内容 |

`createClient()` 无参数：

1. 嵌看板 / 产品预览：iframe URL 带 `#transport=postMessage`，不用 API Key
2. 本机 `pnpm dev`：才在**该 dapp 目录**配 `.env`（`VITE_LIGHTDASH_URL`、`VITE_LIGHTDASH_PROJECT_UUID`、`VITE_LIGHTDASH_API_KEY`）

## 目录（最小可上传）

```
<slug>/
  lightdash-app.yml
  package.json
  src/main.jsx          # createClient + LightdashProvider
  src/App.jsx
  vite.config.js        # 必须 base: './'
  dist/                 # pnpm build 后必须有 dist/index.html
```

- 依赖白名单：`@lightdash/query-sdk`、React、Vite。自定义 npm 上传会被拒
- `slug`：小写字母/数字/连字符；覆盖已有应用保持同一 slug，或用行菜单「更新包」
- 看板绑的是 `appUuid`：换代码不要删了再传新应用

## 本地开发

仓库根目录：

```bash
pnpm install
pnpm --filter @lightdash/query-sdk build
pnpm create-data-app my-sales-kpi
cd data-apps/my-sales-kpi
pnpm install
# 改 src/App.jsx 的 EXPLORE / METRIC
pnpm build
```

## 上传

选**整个应用目录**（不是 zip、不是仓库根）。实际提交：`lightdash-app.yml` + `src/` + `dist/`。不要传 `node_modules/`、`.git/`。

1. 管理员打开 **浏览 → 全部数据应用**
2. 点 **上传应用**，选择 `data-apps/<slug>/`
3. 状态为「可使用」后，看板编辑 → 添加图块 → 数据应用
