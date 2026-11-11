---
name: focused-testing
description: 聚焦测试纪律：只跑与改动直接相关的单文件/单用例测试。提供本仓库 frontend vitest 冷启动慢、jsdom 缺 localStorage 等问题的快速验证命令与绕过方案；禁止全量 test 自检。需要验证 packages/frontend 或其他包改动时使用。
---

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

## 排障路径：跨层行为不一致 bug

编辑页/看板表现不一致这类横跨多层（面板 → hook 重建 → merge utils → 渲染层）的问题：
优先写**全链路纯函数复现测试**（把保存形态的 series 直接喂给 expected+merge+render
纯函数链，断言最终输出），两轮即可钉死丢失点；不要逐层静态追踪源码，分叉多且互相
矛盾，耗时数倍。复现测试随后可直接转正式回归用例。

## 判定规则

- 单用例 240s 挂起且 CPU 持续 >100%：判定环境问题（Node v26 兼容性），上报主控，改由 CI/标准 Node 验证。既有同类用例同样挂起 = 既有问题，不是本次回归。
- 测试崩溃在 import 阶段（localStorage/ipc）：按上面环境绕过方案处理，1 次不行即上报。
- **全文件挂起结案规则**：`-t` 单用例探路已通过 + 全文件运行挂起（症状：collect 0ms / no tests / run 不退出）= 环境问题结案，禁止重试全文件（同类最多加堆重试 1 次）。hook+waitFor、组件渲染类重件测试文件**只允许** `-t` 单用例验证。
- `tsc` core dump（Exit 134/SIGABRT，内存不足）：`NODE_OPTIONS="--max-old-space-size=8192" npx tsc --project tsconfig.json --noEmit --skipLibCheck` 重试 1 次，成功即结案。
- 组件测试 collect 0ms：jsdom 缺 localStorage，直接用上面绕过配置，不要反复跑默认配置。
