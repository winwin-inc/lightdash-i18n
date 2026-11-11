# 用户分组（User Groups）现状盘点与上游 3.x 增量评估

> 状态：**已实施（藏在开关后，默认关闭）**——盘点稿，供启用决策与下一轮上游对齐（`2.57.0 → 3.208.0` 窗口，见 [`./v3-upstream-evaluation.md`](./v3-upstream-evaluation.md)）排期参考。
>
> 背景：上游 Lightdash 自 **3.179.0**（#32201，2026-11-06）起移除 `user-groups-enabled` flag、分组全量常开。本仓基线（上游 2.57.0 @ `c2ac5d553a`，见 [`../v2/v2-upgrade-and-migration-guide.md`](../v2/v2-upgrade-and-migration-guide.md) 文首基线表）已随 0.2513 → 2.57 迁移带入完整分组能力，但默认不启用。

---

## 1. 结论（TL;DR）

| 问题 | 答案 |
|------|------|
| fork 现在有没有用户分组？ | **有，三层齐全**（DB / API / UI），是上一轮 0.2513 → 2.57 迁移带入的上游原装实现 |
| 为什么看不到？ | 后端由 `GROUPS_ENABLED=true` 环境变量（或组织级 feature flag）控制，**默认关闭**；上游同期同样藏 flag |
| 怎么开？ | 环境变量 `GROUPS_ENABLED=true` 重启后端即可（见 §3），无需迁移——所有 group 相关 migration 早已随基线入库 |
| 与上游 3.208 的差距？ | 主干无差距；差距集中在 UX 打磨、flag 移除、以及依赖 Role Sets / SCIM / AI agent 的外围集成（见 §4） |

## 2. fork 已具备的能力清单（基线 2.57 原装）

### 2.1 数据层（migration 全部已执行）

| 表 / 迁移 | 说明 |
|-----------|------|
| `groups`（`20230211080037_add_groups_table`） | 组织级分组主表；`20241112140014` 补 updated 列、`20241108145015` 组名唯一 |
| `group_memberships`（同 2023 迁移） | 组成员关系 |
| `group_attributes`（`20240108152115`） | **按组覆盖用户属性**（组优先于组织默认值） |
| `project_group_access`（`20240109124309`） | 组级项目访问与角色 |
| `space_group_access`（`20240405125904`） | 组级 Space 授权（分享） |

> 注意区分：`20260901140000_add_table_groups_to_projects` 是**侧边栏表分组**（projects 表 jsonb 列），与用户分组无关。

### 2.2 后端

| 能力 | 位置 |
|------|------|
| `GroupService`（CRUD、成员、项目授权、按组解析用户属性） | `packages/backend/src/services/GroupService.ts` |
| REST API（TSOA 已注册进 `generated/routes.ts`） | `packages/backend/src/controllers/groupsController.ts` |
| 开关联动 | `packages/backend/src/services/GroupService.ts:57` 挂 `FeatureFlags.UserGroupsEnabled` |

端点一览（`/api/v1`）：`GET/POST /org/groups`、`GET/PATCH/DELETE /groups/:groupUuid`、`GET /groups/:groupUuid/members`、`DELETE /groups/:groupUuid/members/:userUuid`、`POST/PATCH/DELETE /groups/:groupUuid/projects/:projectUuid`。

### 2.3 前端

| 能力 | 位置 |
|------|------|
| 组织设置「用户与分组」面板：分组列表 + 建组弹窗 | `packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/`（`GroupsView`、`CreateGroupModal`） |
| Space 分享弹窗支持选组 | `packages/frontend/src/components/common/ShareSpaceModal/ShareSpaceAddUser.tsx` |
| 项目访问管理的组维度 UI | `packages/frontend/src/features/projectGroupAccess/`（`ProjectGroupAccess`、`AddProjectGroupAccessModal`） |
| 用户属性按组覆盖编辑 | `packages/frontend/src/components/UserSettings/UserAttributesPanel/UserAttributeModal.tsx` |
| 数据 hooks | `useOrganizationGroups` / `useProjectGroupRoles`（`packages/frontend/src/hooks/`） |

## 3. 启用方式与现状开关链

```
packages/backend/src/config/parseConfig.ts
  groups.enabled = process.env.GROUPS_ENABLED === 'true'   # 默认 false
      ↓
FeatureFlagModel.getUserGroupsEnabled（packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.ts:84）
  = lightdashConfig.groups.enabled || 组织级 flag（isFeatureFlagEnabled）
      ↓
GroupService 构造时挂 UserGroupsEnabled → health check / API 门控
```

- 本仓遥测已关，PostHog 通道基本不生效，**实际生效的是 `GROUPS_ENABLED` 环境变量**
- 启用前建议：先在 dev 库验证建组 → 加成员 → 组授权 Space/项目 → 用户属性按组覆盖 四条链路（交测清单可挂到 [`../v2/v2-implemented-features-qa.md`](../v2/v2-implemented-features-qa.md)）

## 4. 上游 2.57.0 → 3.208.0 窗口内增量（fork 缺口）

| 增量 | 上游 PR / 版本 | 对 fork 的建议 |
|------|----------------|----------------|
| 移除 flag、分组常开 | #32201 / 3.179.0；配套 #32210（停读 `GROUPS_ENABLED`）、#32240（n-minus-one 脚本清理） | 若决定启用，可直接对齐「always on」：删 flag 与配置项，改动小 |
| 管理界面排序打磨：组成员按字母排、选择器排序、admin 设置统一排序 | #31312、#31635、#31067 | 小步 UX 跟进，可合并成一个小 PR |
| Space 分享面板显示组内自定义角色成员；禁用继承时保留空组授权 | #30626、#31805 | 小修，跟随 |
| SCIM 组 schema 扩展（组同步） | #28065 | **暂缓**：SCIM 在上游属 EE（`packages/backend/src/ee/`），按既有 EE 口径只标记不解绑 |
| Role Sets 管理界面（org / 项目 / 组三维度） | #27569 | **暂缓**：Role Sets 上轮已明确不进必迁清单，维持 |
| AI agent 按 group 限制可用性、组访问可搜索 | #30899、#32208 | **暂缓**：依赖 agent-identity 体系，随 AI 全家桶口径 |
| 组织用户属性 as code（YAML） | #29620 | 与分组相邻（组属性覆盖），若做 content-as-code 增量可一并评估 |

## 5. 决策建议

1. **短期（不迁移代码）**：有客户需要组织级权限管理时，直接 `GROUPS_ENABLED=true` 试点，先交测四条链路（§3）。
2. **若启用后反馈正面**：对齐上游 3.179 的 always-on 行为（删 flag），同时打包 §4 前三行 UX 增量，预估一个中等工作量的 PR。
3. **下一轮大窗口**（`2.57.0 → 3.208.0`，见 [`../v2/v2-changelog-high-value-backlog.md`](../v2/v2-changelog-high-value-backlog.md) 维护约定）：User Groups 整体**不单独立项**，作为窗口内「低成本对齐项」随批携带。

## 6. 相关文档

- V3 目录索引：[`./README.md`](./README.md)
- 上游 3.x 全量新功能评估：[`./v3-upstream-evaluation.md`](./v3-upstream-evaluation.md)
- 上游对齐基线与迁移指南：[`../v2/v2-upgrade-and-migration-guide.md`](../v2/v2-upgrade-and-migration-guide.md)
- 高价值 backlog 与暂缓口径：[`../v2/v2-changelog-high-value-backlog.md`](../v2/v2-changelog-high-value-backlog.md)
