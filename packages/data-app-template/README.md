# 数据应用脚手架（手写上传）

本地开发 Vite + React 应用，用 `@lightdash/query-sdk` 查语义层。构建后在产品里上传，即可嵌进看板。不走 AI generate，也不走云端 sandbox。

## 目录

```
lightdash-app.yml
package.json
src/
dist/                 # pnpm build 产物，必须一起上传
```

## 本地开发

在仓库根目录：

```bash
pnpm install
pnpm --filter @lightdash/query-sdk build
cd packages/data-app-template
pnpm build
```

改 `src/App.jsx` 里的 `EXPLORE` / `METRIC` 为项目里真实的 explore 与指标，再 `pnpm build`。

嵌在 Lightdash iframe 里时 SDK 走 postMessage，不需要本地 API Key。单独 `pnpm dev` 需要 `VITE_LIGHTDASH_URL`、`VITE_LIGHTDASH_PROJECT_UUID`、`VITE_LIGHTDASH_API_KEY`。

## 上传

1. 管理员打开 **浏览 → 全部数据应用**
2. 点 **上传应用**，选择本目录（须含 `src/`、`dist/index.html`、`lightdash-app.yml`）
3. 状态为「可使用」后，看板编辑 → 添加图块 → 数据应用

覆盖已有应用：改 `lightdash-app.yml` 的 `slug` 与目标一致，或在列表行菜单选「更新包」。

本期只接受模板依赖（`@lightdash/query-sdk`、React、Vite）。自定义 npm 会被服务端拒绝。脚手架不打进主站 bundle。
