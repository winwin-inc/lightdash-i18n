# Step 0：底座对齐评估与策略

> 日期：2026-09-01  
> 分支：`feat/v2-upgrade`  
> 对照上游：`D:\workspace_company\lightdash` @ 2.57.x

## 1. 现状对照

| 项 | 当前仓库 | 上游 2.57.x | 差距 |
|---|---|---|---|
| Node | 20.19.0（volta） | >= 24 | 大 |
| pnpm | 9.15.5 | 11.x | 中 |
| TypeScript | 5.5.4（全仓 resolutions） | 7.0.2 | 大 |
| 构建编排 | pnpm -r | Turbo 2.9 | 中 |
| 格式/Lint | prettier + eslint | oxfmt + oxlint | 中 |
| 本地环境实测 | node v20.19.0 / pnpm 9.14.2 | — | — |

## 2. 策略结论（最低水位）

**本阶段不一次性把全仓升到 Node 24 + TS 7 + Turbo + oxfmt。**

原因：全量工具链升级与业务功能移植缠在一起，排错成本过高，违反「主迁移先稳」原则。

**采用「入站适配」最低水位：**

1. 保持当前 Node 20 / pnpm 9 / TS 5.5 / prettier+eslint 作为主站底座。
2. 引入上游独立包（如 `formula`）时，**适配到当前工具链**（TS 5.5、vitest、本地可保留 peggy；lint/format 对齐仓库脚本或包内可选 oxlint）。
3. 经验证 `packages/formula` 的 `tsconfig` 为常规 ES2020/CommonJS，**不依赖 TS 7 专有语法**，可在 TS 5.5 下编译。
4. 全仓 Node 24 / pnpm 11 / TS 7 / Turbo 升级列为 **Step 0b（后续专项）**，在 OSS 核心功能合入并稳定后再做。

## 3. Step 0 交付物

- [x] 本文评估结论
- [x] 根 `package.json` 增加 `engines` 说明与 `formula-*` 脚本
- [x] 根 `tsconfig.json` 增加 `packages/formula` project reference
- [x] 引入并适配 `@lightdash/formula`（Step 1 起点）
- [x] `pnpm -F @lightdash/formula build && test` 通过（382 tests）
- [x] `pnpm-lock.yaml` 已纳入 `packages/formula`

### 适配说明

- TS：`moduleResolution` 从上游 `bundler` 改为 `Node`（与 `module: CommonJS` + TS 5.5 兼容）
- Lint/Format：去掉 oxlint/oxfmt，改用仓库 prettier + eslint
- Scripts：Windows 下用 `node ./node_modules/...` 调用 peggy/vitest（避免 pnpm `.bin` 缺失）
- 工具链：仍保持 Node 20 / pnpm 9 / TS 5.5，不上游 Node24/TS7/Turbo

## 4. Step 0b（后续，不在本窗口强做）

- 升级 Node >= 24、pnpm 11、TypeScript 7
- 引入 Turbo 任务图
- 评估 oxfmt/oxlint 替换或与 eslint 并存
- 更新 CI / Docker / Jenkins 基础镜像

## 5. 风险与回滚

- 若 formula 在 TS 5.5 下出现类型错误：优先改 formula 适配层，不升全仓 TS。
- 若必须升 Node 24：单独 PR，先只改 engines + CI 镜像，再动业务。
