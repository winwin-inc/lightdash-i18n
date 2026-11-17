---
name: brandct-x-insight
description: 查询马上赢 X 平台的 BI 数据（品类、品牌、集团市占等）并生成对比分析；用户提到马上赢、X 平台、品类宝、集团说数、哪吒AI、品类趋势、品牌份额、市占率时使用。
metadata:
  display_name: 马上赢 X 数据洞察
  display_description: 按需查字段、取数并生成对比结论。
  icon: ./assets/icon.png
---

# 马上赢 X 数据洞察

## 输入

用户要看的业务对象（品类 / 品牌 / 集团 / 区域）、时间区间、需要的指标。缺时间区间时先问，不要自己猜。

## CLI 通道（msy-x 命令行）

插件可能同时带两个通道：**CLI 连接器**（`msy-x` 命令行）与 **MCP 连接器**（`x`）。按可用性二选一：

- **何时用 CLI**：环境里已装 `msy-x`（先 `msy-x --version` 探测成功）就用 CLI——非交互终端下 stdout 只输出 JSON（表格只给人看），大结果可 `--out` 落盘，避免长表回灌上下文；命令、参数示例、退出码见 [references/cli.md](references/cli.md)。
- **何时用 MCP 连接器**：`msy-x` 未安装或跑不通时，走下面的 MCP 工具路径（`get_my_access` → `list_explores` / `find_fields` → `run_metric_query`）。
- **CLI 失败处理**：先跑 `msy-x auth status` 看 `logged_in`；为 `false` 时跑 `msy-x auth login` 重新登录，成功后重试原命令一次；仍失败按 references/cli.md 的退出码表向用户解释，不要反复重试。

## 执行步骤

1. MCP 通道：调用 `get_my_access` 确认令牌可用。失败直接走「失败处理」，不要继续。
2. 不确定 explore 与字段时：
   - `list_explores` 找表，**一次调用**，用 `search` 参数过滤
   - `find_fields` 找字段（fieldId 决定 dimension / metric 的取值）
   - **不要逐表试探**，也不要凭记忆拼字段名
3. 取数：调用 `run_metric_query`，**一次把所有需要的 dimension 与 metric 合并传进去**。
   - 需要多张 explore 时，优先在同一 explore 内用不同 metric 组合完成
   - 真的跨 explore 时，按「一次批量」方式调用，不要串行逐表查
   - 默认不传 `limit`；用户要明细时才传，并显式告知条数
4. 按「输出要求」生成结果。

## 输出要求

- 第一行一句话结论，随后表格 + 必要图表
- 表格必须写清：维度、指标、时间范围、数据来源（explore 名称）
- 数值保留 1 位小数；缺失写「—」，不要估算
- 不确定口径时，引用字段 label，不要自行解释业务含义

## 失败处理

- MCP 通道 401 / 403 / 令牌无效：不要重试。回复用户：「马上赢 X 平台的访问令牌已失效。
  请到 插件·技能·伙伴 → 我安装的 → 卸载「马上赢 X 数据洞察」→ 重新安装 →
  重新填写 PAT（在 x.brandct.com → 个人设置 → 访问令牌 中创建）。」
- CLI 通道失败：先 `msy-x auth status` 再按需 `msy-x auth login`（见上方「CLI 通道」），仍失败按 references/cli.md 退出码表处理
- 422 / 字段不存在：用 `find_fields` 重新确认 fieldId 后重试一次；再失败就向用户说明
- 超时或部分失败：返回已完成部分，明确列出失败项，不要补猜数值

## 安全边界

- 只读查询，不执行任何写入
- 不把 PAT 回显给用户，不写入文件，不拼进查询参数
