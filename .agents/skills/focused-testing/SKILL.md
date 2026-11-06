# Skill: 聚焦测试（本仓库 frontend vitest 快速通道）

适用：需要验证 `packages/frontend` 改动时的最小代价测试方式。

## 决策树

1. **改的是纯逻辑/hook（echarts config、utils 等，无 DOM 渲染）**
   ```bash
   cd packages/frontend && timeout 240 npx vitest run <测试文件> --reporter=dot
   ```
   该路径缓存热时 <5s。首次跑新文件先加 `-t "<单个用例名>"` 探路。

2. **改的是组件（需要 jsdom / renderWithProviders）**
   本机 jsdom 缺 `localStorage`（rudder-sdk 在 import 阶段即崩），用仓外精简配置绕过：
   ```bash
   cd packages/frontend && NODE_OPTIONS="--localstorage-file=/tmp/vls.json --max-old-space-size=4096" \
     timeout 240 npx vitest run --config /tmp/vitest.jsdom.config.ts <测试文件> --reporter=dot
   ```
   `/tmp/vitest.jsdom.config.ts` 不存在时重建：
   ```ts
   import { mergeConfig } from 'vite';
   // @ts-ignore
   import base from '<repo>/packages/frontend/vite.config';
   export default mergeConfig(base as any, {
       root: '<repo>/packages/frontend',
       test: {
           globals: true,
           environment: 'jsdom',
           environmentOptions: { jsdom: { url: 'http://localhost:3000/' } },
           setupFiles: ['<repo>/packages/frontend/src/testing/vitest.setup.ts'],
       },
   });
   ```

3. **单用例探路 / 只验证新用例**
   追加 `-t "<describe 或 test 名>"`。注意：含 `waitFor` 轮询 + effect 的用例可能挂起导致整个 run 不退出，**必须包 `timeout`**。

## 禁止

- `pnpm -F frontend test`（全量）作为自检 —— 交给主控收口或 CI。
- 冷缓存直接跑大文件整轮 —— 先单用例探路。
- 无 `timeout` 的验证命令。

## 判定规则

- 单用例 240s 挂起且 CPU 持续 >100%：判定环境问题（Node v26 兼容性），上报主控，改由 CI/标准 Node 验证。既有同类用例同样挂起 = 既有问题，不是本次回归。
- 测试崩溃在 import 阶段（localStorage/ipc）：按上面环境绕过方案处理，1 次不行即上报。
