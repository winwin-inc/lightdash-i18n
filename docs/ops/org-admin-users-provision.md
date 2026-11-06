# 组织管理员：OIDC 用户开通 API

运维/管理员通过 API **预开通（provision）** 组织用户，并绑定 OIDC 身份（`openid_identities`），使后续 OIDC 登录能按 `issuer + subject` 匹配到已开通账号。

> 实现参考：`packages/common/src/types/organizationUserProvision.ts`、`packages/backend/src/routers/organizationRouter.ts`、`packages/backend/src/services/UserService.ts`（`provisionOrganizationUser` / `provisionOrganizationUsers`）。

## 请求方式

> **两个端点均为 `POST`**（单个开通与批量开通）。请使用 HTTP **POST**，不要用 GET。

| 请求方式 | 路径 |
|---------|------|
| **`POST`** | `/api/v1/org/admin/users/provision` |
| **`POST`** | `/api/v1/org/admin/users/provision/batch` |

---

## 1. 概述

| 项 | 说明 |
|----|------|
| **请求方式** | **`POST`**（单个与批量端点均为 POST） |
| 用途 | 幂等创建/更新组织用户，并绑定 GENERIC_OIDC 身份 |
| 调用方 | 运维脚本、IdP 同步、内部管理后台 |
| 行为 | 按邮箱查找用户；不存在则创建 pending 用户；存在则更新资料；再按 OIDC `issuer` + `subject` 绑定身份 |
| Issuer | **服务端**从 OIDC 配置发现（`AUTH_OIDC_*`），**请求体不传 issuer** |

典型流程：

```
Admin/PAT  →  POST /api/v1/org/admin/users/provision
           →  校验权限（可管理 OrganizationMemberProfile）
           →  解析并校验 body（含必填 subject）
           →  发现 OIDC issuer
           →  按 email 创建/更新用户
           →  写入 openid_identities(issuer, subject, email, …)
           →  用户下次 OIDC 登录用 sub 匹配绑定
```

---


## Hardening（pre-prod）

| 项 | 行为 |
|----|------|
| **鉴权** | 非组织 admin（无 `manage` `OrganizationMemberProfile`）→ **HTTP 403** |
| **Last-admin** | 更新路径显式改 `role` 时，若目标为组织唯一 admin → **403**（`Organization must have at least one admin`），与 `OrganizationService.updateMember` 一致 |
| **Lookup key** | **`email`**（`trim().toLowerCase()`）为查找键；不存在则创建，存在则更新 |
| **可选字段（更新）** | 省略 `isActive` / `isSetupComplete` / `verifyEmail` / `invalidateInvite` / 姓名时 **保持原值**（不会强制默认 `true`） |
| **可选字段（创建）** | 上述布尔字段省略默认 `true`；`firstName` / `lastName` / `subject` 必填 |
| **审计** | 成功后 `user.provisioned`（actor、target email/uuid、created、role、openidLinked、inviteInvalidated）；显式设 `role` 时另报 `permission.updated` |

---

## 2. 为什么 `subject` 必填

`subject` 对应 OIDC 令牌中的 **`sub`（Subject）**，是 IdP 侧稳定用户标识。

服务端用 **`issuer`（配置发现）+ `subject`（请求传入）** 写入/查找 `openid_identities`。若缺少或为空 `subject`：

1. 类型校验 `isProvisionOrganizationUser` 失败（`subject` 必须为 `string`）
2. 或解析阶段抛出 `ParameterError: subject is required`（`trim()` 后为空）
3. **无法创建身份绑定** → 用户虽可能被创建，但 OIDC 登录时无法按 `sub` 匹配到该账号

因此 **`subject` 为必填**，与 `email`、`firstName`、`lastName` 同级。

---

## 3. 鉴权与前置条件

路由中间件（顺序）：

1. `allowApiKeyAuthentication` — 支持 Personal Access Token（API Key）
2. `isAuthenticated` — 必须已登录（Session Cookie 或 PAT）
3. `unauthorisedInDemo` — Demo 模式不可用

业务权限（`assertCanManageOrganizationMembers`）：

- 调用者必须属于某个组织（有 `organizationUuid`）
- 须具备对该组织 `OrganizationMemberProfile` 的 **`manage`** 能力（通常为组织 **admin**）
- 开通目标组织 = 调用者当前组织（不可跨组织开通）

服务端 OIDC 配置（`resolveOidcIssuer`）：

- 需已配置 `AUTH_OIDC_CLIENT_ID` 与 `AUTH_OIDC_METADATA_DOCUMENT_URL`（metadata document endpoint）
- 未配置时返回参数错误，提示设置上述环境变量

请求头示例：

```http
Authorization: ApiKey <your-personal-access-token>
Content-Type: application/json
```

或使用已登录 Session Cookie。

---

## 4. 端点

基路径：`/api/v1` + `organizationRouter` 挂载在 `/org`。

| 方法 | 路径 | 说明 |
|------|------|------|
| **`POST`** | `/api/v1/org/admin/users/provision` | 单个用户开通 |
| **`POST`** | `/api/v1/org/admin/users/provision/batch` | 批量开通（逐条独立处理） |

> **请求方式：两个端点均为 POST。**

成功时 HTTP **200**，响应 envelope：

```json
{
  "status": "ok",
  "results": { ... }
}
```

批量时 `results` 为数组。

---

## 5. 请求字段（`ProvisionOrganizationUser`）

与 `organizationUserProvision.ts` 字段名一致。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `email` | `string` | **是** | — | 用户邮箱；服务端 `trim().toLowerCase()`，空串报错 |
| `firstName` | `string` | **是** | — | 名；`trim()` |
| `lastName` | `string` | **是** | — | 姓；`trim()` |
| `subject` | `string` | **是** | — | 外部 OIDC subject / `user_id`（即 IdP `sub`）；`trim()` 后不可为空 |
| `isActive` | `boolean` | 否 | 创建默认 `true`；**更新省略则保持原值** | 是否允许登录 |
| `isSetupComplete` | `boolean` | 否 | 创建默认 `true`；**更新省略则保持原值** | 是否标记引导完成 |
| `verifyEmail` | `boolean` | 否 | 创建默认 `true`；**更新省略则不重新验证** | 是否尝试将邮箱标为已验证 |
| `role` | `OrganizationMemberRole` | 否 | 见下 | 组织角色；非法值拒绝 |
| `invalidateInvite` | `boolean` | 否 | 创建默认 `true`；**更新省略则不动邀请** | 是否删除该用户未用完的邀请链接 |

### 5.1 `role` 取值与默认

合法值（`OrganizationMemberRole`）：

- `member`
- `viewer`
- `interactive_viewer`
- `editor`
- `developer`
- `admin`

默认策略：

- **创建**时未传 `role` → 使用 `member`
- **更新**已有用户时：仅当请求**显式传入** `role` 才改角色；省略则保持原角色

### 5.2 批量请求体（`ProvisionOrganizationUsersBatch`）

```typescript
{
  users: ProvisionOrganizationUser[];
}
```

约束：

- `users` 必须为非空数组
- 长度上限：`PROVISION_ORGANIZATION_USERS_BATCH_MAX` = **100**
- 每条独立 try/catch：单条失败不影响其他条；失败项返回 `{ email, ok: false, error }`

---

## 6. 响应字段

### 6.1 单条成功（`ProvisionOrganizationUserResult`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `userUuid` | `string` | 用户 UUID |
| `email` | `string` | 规范化后的邮箱 |
| `created` | `boolean` | 本次是否新建用户 |
| `openidLinked` | `boolean` | 本次是否**新创建**了 OIDC 身份绑定（已存在且属同一用户则为 `false`） |
| `inviteInvalidated` | `boolean` | 是否实际删除了邀请链接（`invalidateInvite` 为 true 且确有删除） |
| `isActive` | `boolean` | 更新后的激活状态 |

单条完整响应示例：

```json
{
  "status": "ok",
  "results": {
    "userUuid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "email": "alice@example.com",
    "created": true,
    "openidLinked": true,
    "inviteInvalidated": false,
    "isActive": true
  }
}
```

### 6.2 批量结果项（`ProvisionOrganizationUserBatchItemResult`）

成功：

```json
{
  "ok": true,
  "userUuid": "...",
  "email": "alice@example.com",
  "created": true,
  "openidLinked": true,
  "inviteInvalidated": false,
  "isActive": true
}
```

失败：

```json
{
  "ok": false,
  "email": "bob@example.com",
  "error": "subject is required"
}
```

---

## 7. 服务端行为摘要

1. **按 email 查找**
   - 已在本组织 → 更新资料（及可选 role）
   - 存在但无组织 → `joinOrg` 加入当前组织
   - 邮箱已被**其他组织**占用 → 参数错误
   - 不存在 → `createPendingUser` 创建（`created: true`）
2. **更新** `firstName` / `lastName` / `isActive` / `isSetupComplete`
3. **`verifyEmail === true`** 时尝试验证邮箱
4. **OIDC 绑定**：用发现的 `issuer` + 请求 `subject` 查身份
   - 已绑定且 `userUuid` 相同 → 不重复创建（`openidLinked: false`）
   - 已绑定到**其他用户** → `AlreadyExistsError`
   - 不存在 → `createIdentity`（`openidLinked: true`），`issuerType = GENERIC_OIDC`
5. **`invalidateInvite === true`** 时按 `userUuid` 删除邀请链接

---

## 8. 错误说明

| 场景 | 典型信息 / 类型 |
|------|-----------------|
| 缺少/类型不对：`email`、`firstName`、`lastName`、`subject` | `Invalid provision body: email, firstName, lastName, and subject are required; role must be a valid organization member role when provided` |
| `subject` 为空字符串（仅空白） | `subject is required` |
| `email` 去空白后为空 | `email is required` |
| `role` 非法 | `Invalid role: ...` 或上述 Invalid provision body |
| 无组织 / 无 manage 权限 | `ForbiddenError` |
| non-admin / no manage | ForbiddenError (HTTP 403) |
| update role on sole org admin | ForbiddenError: Organization must have at least one admin (HTTP 403) |
| Demo 模式 | 未授权（`unauthorisedInDemo`） |
| 未配置 OIDC | `OIDC is not configured. Set AUTH_OIDC_CLIENT_ID and AUTH_OIDC_METADATA_DOCUMENT_URL.` |
| Issuer 发现失败 | `Failed to resolve OIDC issuer from metadata document: ...` |
| 邮箱属于其他组织 | `Email is already used by a user in another organization` |
| subject 已绑其他用户 | `OpenID identity (issuer, subject) is already bound to another user` |
| 批量 body 非法 | `Invalid batch body: expected { users: ProvisionOrganizationUser[] }` |
| 批量 `users` 为空 | `users array must not be empty` |
| 批量超过 100 | `Batch size exceeds maximum of 100` |

单条接口错误走全局错误处理（非 200）；批量接口 HTTP 仍为 200，失败写在对应 `results[]` 项的 `ok: false`。

---

## 9. curl 示例

将 `BASE` 与 `TOKEN` 换成实际值。

### 9.1 单个开通（最小必填）

```bash
BASE="https://lightdash.example.com"
TOKEN="your-pat-token"

curl -sS -X POST "$BASE/api/v1/org/admin/users/provision" \
  -H "Authorization: ApiKey $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "firstName": "Alice",
    "lastName": "Zhang",
    "subject": "oidc-sub-alice-001"
  }'
```

### 9.2 单个开通（含可选字段）

```bash
curl -sS -X POST "$BASE/api/v1/org/admin/users/provision" \
  -H "Authorization: ApiKey $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@example.com",
    "firstName": "Bob",
    "lastName": "Li",
    "subject": "oidc-sub-bob-002",
    "role": "editor",
    "isActive": true,
    "isSetupComplete": true,
    "verifyEmail": true,
    "invalidateInvite": true
  }'
```

### 9.3 缺少 subject（应失败）

```bash
curl -sS -X POST "$BASE/api/v1/org/admin/users/provision" \
  -H "Authorization: ApiKey $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "carol@example.com",
    "firstName": "Carol",
    "lastName": "Wang"
  }'
```

预期：参数错误（body 校验要求 `subject` 为 string）。

### 9.4 批量开通

```bash
curl -sS -X POST "$BASE/api/v1/org/admin/users/provision/batch" \
  -H "Authorization: ApiKey $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "users": [
      {
        "email": "alice@example.com",
        "firstName": "Alice",
        "lastName": "Zhang",
        "subject": "oidc-sub-alice-001",
        "role": "member"
      },
      {
        "email": "dave@example.com",
        "firstName": "Dave",
        "lastName": "Chen",
        "subject": "oidc-sub-dave-003",
        "role": "viewer"
      }
    ]
  }'
```

---

## 10. 类型速查（源码）

```typescript
// packages/common/src/types/organizationUserProvision.ts

export type ProvisionOrganizationUser = {
    email: string;
    firstName?: string;          // required on create; omit on update keeps old
    lastName?: string;           // required on create; omit on update keeps old
    /** External OIDC subject / user_id */
    subject: string;
    isActive?: boolean;          // create default true; update omit keeps previous
    isSetupComplete?: boolean;   // create default true; update omit keeps previous
    verifyEmail?: boolean;       // create default true; update omit skips
    role?: OrganizationMemberRole;
    invalidateInvite?: boolean;  // create default true; update omit leaves invites
};

export const PROVISION_ORGANIZATION_USERS_BATCH_MAX = 100;
```

路由：

```text
POST /api/v1/org/admin/users/provision
POST /api/v1/org/admin/users/provision/batch
```