# 测试纪律（强制）

> 背景：曾经出现 worker 自行运行全量/大文件测试导致单次空转 1-2 小时、内存逼近 OOM、拖垮 dev-server。
> 本规则对所有 agent（含子 agent）生效，优先级高于任务描述中的泛化"跑一下测试"。

## 核心原则：聚焦测试

1. **只运行与本次改动直接相关的测试**：优先单文件；文件很大时用 `-t "用例名"` 只跑目标用例。
2. **禁止作为常规自检运行**：全量 `pnpm test`、跨包递归测试、全量 lint、全量 typecheck —— 这些由主控（parent）在收尾时统一执行。
3. **worker 不做批量验证**。任务描述中如出现"验收含 typecheck/test"，worker 只做代码级自查并在 artifact 标注 `not checked (deferred to parent)`。

## 本仓库已知热点（frontend vitest）

- `packages/frontend/vite.config.ts` 同时承担构建与测试配置，含 legacy/compression/monaco/sentry 等重插件，**冷缓存 transform 极慢**（实测 40min+，且默认 2GB 堆会 OOM）。
- 应对：
  - 复用已跑过的测试文件（缓存热，秒级）；新文件先用 `timeout 240 npx vitest run -t "<单个用例名>"` 探路，成功后再跑整文件。
  - jsdom 用例若因 `localStorage`（rudder-sdk）在 import 阶段崩：加 `NODE_OPTIONS="--localstorage-file=/tmp/vls.json"` 与 jsdom `url` 配置。
  - 堆不足时才升 `--max-old-space-size=4096`，禁止 8192+（机器仅 12GB，会挤压 dev-server）。
- 本机 Node 版本偏新（v26）：个别含 `waitFor`/pivot 重建的用例可能无限挂起。**单用例挂起 240s 即判定为环境问题**，换 CI/标准 Node 验证，不在本地反复重试。

## 命令保险（强制）

- 任何可能超过 60s 的命令必须带 `timeout <秒>`；超过 5 分钟的验证改用 `nohup ... > /tmp/xx.log 2>&1 &` 后台执行并轮询日志。
- 内存/进程监控：验证前 `free -m`；发现可用内存 < 2GB 时停止新验证并上报。

## 空转禁止

1. 环境性失败（OOM/超时/ipc closed）**同类错误最多重试 2 次**，第 3 次必须上报 blocker，禁止第三次蛮试。
2. 不做任务范围外的"顺手"验证/修复；发现范围外问题写入 artifact 交主控决策。
3. 开始编码前先确认 owns 文件与已有上下文，不重复调研他人已完成的结论。
4. 测试挂起时不杀进程重跑同一条命令；先判断是"慢"还是"挂"（CPU 是否在动、日志是否增长）。
