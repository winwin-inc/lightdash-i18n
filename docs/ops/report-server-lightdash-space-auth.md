# report-server ⇄ Lightdash 空间授权排查与修复

**状态：排查结论（诊断已定）／report-server 侧修复待开发**

> 「用户已被分配看板、却始终没有空间访问权」的根因记录。
> 本仓（Lightdash）无需改动，修复全部在 `report-server`。
> 按需跳读：**第 1 节**结论、**第 3 节**接口契约、**第 4 节**下次复现照着跑、**第 5 节**改代码。

---

## 1. 一句话结论

> report-server 把「收到过 HTTP 200」固化成 `is_auth=1`，而 Lightdash 的空间共享接口**不校验空间归属、也不校验项目成员资格**，只要能写库就返回 200。于是当 `report_dashboard.space_uuid` 是旧快照、或调用方权限不足时，授权要么「成功地」落到错的空间、要么静默失败；而 `is_auth=1` 又让 `lightdash:space-change`（只看 `is_auth=0`）和 `removeUserSpace`（本地命中即短路）**双双不再纠正** —— 授权状态与实际权限永久脱节。

### 排查中已排除的四条（别再花时间）

| 怀疑 | 结论 |
|---|---|
| 空间没指定 | ❌ `grantUserSpace($mobile, $spaceUuid)` 显式传 `space_uuid`，全链路 `dashboard_uuid → space_id → space_uuid`，从不按名字匹配 |
| 同级重名空间导致串号 | ❌ 同上，按 uuid 精确执行 |
| 用户不是项目成员 | ❌ 后端 `addSpaceAccess` 只有一句 `insert ... onConflict.merge()`，**根本不校验成员资格** |
| 「只能与现有的项目成员共享空间」是报错 | ❌ 它是 `ShareSpaceModal` 的**静态提示文案**，只在「访问类型=Private + 有 `create InviteLink` 权限」时渲染 |

---

## 2. 为什么难查：三层「把失败伪装成成功」

| 层 | 机制 | 后果 |
|---|---|---|
| **建号层** | `createOpenId()` 在 `grantUserProject()` **之前**就 `UPDATE users SET is_auth_project=true`；后者返回值被丢弃 | 一次失败 → 永久早退，永不自愈 |
| **授权层** | `grantUserSpace()` 只要 HTTP 200 就 `updateAuth()`（`is_auth=1`）；而 200 只证明「这条 `(user_uuid, space_uuid)` 写进去了」 | 落到旧/错空间也算成功 |
| **可观测层** | `saveDashboardEmployeeRole()` 里两个调用点返回值都不看；`Assert::notNull` 抛未捕获异常会**中断整个 foreach** | 同批后续看板全部不授权，且日志无告警 |

`is_auth_project` **不是 Lightdash 的字段** —— 本仓所有包与 migration 里都没有，是接入时手工 ALTER 出来的「影子列」。副作用：用标准 migration 重建库后，`SELECT v.is_auth_project` 会直接 SQL 报错。

---

## 3. Lightdash 侧契约速查（改 report-server 前必看）

### 3.1 空间共享接口

`POST /api/v1/projects/{projectUuid}/spaces/{spaceUuid}/share`，body `{userUuid, spaceRole}`
（`spaceRole`：`viewer` | `editor` | `admin`）

`SpaceService.addSpaceUserAccess:497-532` 只做四件事：查空间（不存在→404）、取调用者空间角色、拒绝嵌套空间、查 `manage` 权限（否则 403）。落到 `SpaceModel.addSpaceAccess:1902-1915` 只有一句 `insert ... onConflict.merge()`。

**四条关键结论：**

1. **不校验 `projectUuid` 与空间归属** —— 路径里的 projectUuid 实际未被使用
2. **不校验被共享人是否项目成员** —— `userUuid` 存在就写库
3. **`spaceUuid` 存在就 200** —— 哪怕是旧空间
4. 所以 200 ≠ 用户能在「他现在需要看的那个空间」里看到东西

### 3.2 谁有权 manage 空间（★ 两个坑）

`organizationMemberAbility.ts` 的规则：

| 调用方组织角色 | 可 manage 的空间 |
|---|---|
| editor / interactive_viewer | 仅 `isPrivate: false`（L239-242） |
| editor / interactive_viewer | 私有空间要求该空间 `access` 里自己是 `admin`（L190-198） |
| **admin** | **组织内任意 Space，无 `isPrivate` 条件**（L358-360） |

**坑 1：组织 admin ≠ 项目 admin。** 判定用的是 `organization_memberships.role`，`project_memberships.role = 'admin'`（项目管理员）在这里**不豁免**。「都是管理员」要确认是组织角色。

**坑 2：嵌套空间的 403 排在能力检查之前**（`SpaceService.ts:509-514`）。所以**任何角色、包括组织 admin，都共享不了嵌套空间** —— 这是唯一能绕开「管理员权限」的硬限制。

判断顺序：空间存在？→ 是否嵌套（403）→ 是否有 manage（403）→ 写库（200）。

### 3.3 PAT 的权限 = token 创建者的组织角色

`UserModel.findSessionUserByPersonalAccessToken:899-930` 用 `generateUserAbilityBuilder(row)` 构造 ability，row 来自 token 的 `created_by_user_id`。所以「这把 API key 是管理员」必须落实成：**该 token 的 owner 在 `organization_memberships` 里是 `admin`**。

token 存的是 bcrypt（salt 由 `LIGHTDASH_SECRET` 派生，`utils/hash.ts`），SQL 无法按明文反查，按使用时间定位：

```sql
SELECT pat.personal_access_token_uuid, pat.description, pat.last_used_at,
       u.user_id, e.email, om.role AS org_role
FROM personal_access_tokens pat
JOIN users u ON u.user_id = pat.created_by_user_id
JOIN emails e ON e.user_id = u.user_id
LEFT JOIN organization_memberships om ON om.user_id = u.user_id
ORDER BY pat.last_used_at DESC NULLS LAST;
```

| `org_role` | 推论 |
|---|---|
| `admin` | 私有空间 403 **排除**；若仍失败，只剩「快照陈旧落错空间」或「email 拼错落错人」 |
| `member` / `editor` / `viewer` | 私有空间必然 403；公开空间才可能 200 |

### 3.4 其他接口语义

**项目成员** `POST /projects/{p}/access`（`ProjectModel.ts:1545-1590`）：

| 码 | 语义 | 是否成功 |
|---|---|---|
| 200 | 新插入 | ✅ |
| **409** | `AlreadyExistsError`（唯一约束），已是成员 | ✅ **幂等** |
| **404** | `NotExistsError: Can't find user with email X in the organization` | ❌ 最该告警 |
| 403 | 调用方无 `manage Project` | ❌ |
| 503 | `request()` 的 catch（超时/网络） | ❌ |

**邀请链接** `POST /invite-links` 的 **400 是预期语义**：email 已存在且非 pending → `ParameterError`（`UserService.ts:398-411`）。report-server 正是靠它判断「用户已存在，跳过建号」。

**错误码映射**（`common/src/types/errors.ts`）：`ParameterError` 400 / `ForbiddenError` 403 / `NotExistsError` 404 / `AlreadyExistsError` 409。

---

## 4. 下次复现：5 分钟判别

### 4.1 先看日志（最快）

`request()` 每次都打 `lightDashClientRequest`（含 uri / body / response body），失败额外打 `lightDashRequestError`：

```bash
grep -E "lightDashClientRequest|lightDashRequestError" <日志> | grep "/spaces/" | grep "/share" | tail -20
```

### 4.2 再跑三条 SQL

```sql
-- ① report-server 库：授权标记 + 快照空间
SELECT r.dashboard_id, r.is_auth,
       d.dashboard_uuid, d.space_uuid AS snapshot_space_uuid
FROM report_dashboard_employee_role r
JOIN report_dashboard d ON d.id = r.dashboard_id
JOIN report_employee e ON e.id = r.employee_id
WHERE e.mobile = '<手机号>';
```

```sql
-- ② Lightdash 库：看板现在真实所在的空间
SELECT d.dashboard_uuid, s.space_uuid AS real_space_uuid, s.is_private, s.parent_space_uuid
FROM dashboards d LEFT JOIN spaces s ON s.space_id = d.space_id
WHERE d.dashboard_uuid = '<① 取到的值>';
```

```sql
-- ③ Lightdash 库：该用户实际被共享了哪些空间
SELECT sua.space_uuid, s.name, s.is_private, sua.space_role, sua.created_at
FROM space_user_access sua
LEFT JOIN spaces s ON s.space_uuid = sua.space_uuid
JOIN emails e ON e.user_id = sua.user_id
WHERE e.email = '<手机号>@<LIGHTDASH_ORG_DOMAIN>';
```

### 4.3 判定表

| 现象 | 定性 |
|---|---|
| `snapshot ≠ real` 且 `is_auth = 1` | **快照陈旧 + `is_auth` 锁死**（与调用方权限无关，最可能） |
| `snapshot = real` 且 `is_private = t` | 私有空间 manage 不足 → 查 §3.3 的 `org_role` |
| `snapshot = real`、公开、`is_auth = 1`，但用户没权限 | 授权记到了别人身上 → `getEmail()` 拼的 `{手机号}@{org_domain}` 与 Lightdash 实际 email 不一致 |
| ② 无行 | 空间已删/已合并 → 先跑 `lightdash:space-change` 刷新快照 |

### 4.4 手工复现

```bash
curl -sS -X POST \
  -H "Authorization: ApiKey $LDPAT" -H "Content-Type: application/json" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/spaces/$SPACE_UUID/share" \
  -d "{\"userUuid\":\"$TARGET_USER_UUID\",\"spaceRole\":\"viewer\"}" \
  -w '\nHTTP:%{http_code}\n'
```

200 → 后端接受了，问题在空间/身份；403 → 嵌套 或 私有空间权限不足；404 → `spaceUuid` 不存在。

---

## 5. 修复清单

| 优先级 | 位置 | 改什么 |
|---|---|---|
| P0-A | `LightDashClientServiceImpl::grantUserProject` | 返回结构化结果 + 失败落日志 |
| P0-B | `createLightDashUser` / `createOpenId` | 早退改查 `project_memberships`；`is_auth_project` 后移或废弃 |
| P0-C | `DashboardServiceImpl::saveDashboardEmployeeRole` | 消费返回值、隔离单条失败、失败落 `operator_log` |
| P1 | `grantUserSpace` + `updateAuth` | 返回结构化结果；`is_auth` 改为「快照空间 == 当次授的」派生值 |
| P2 | `getCurrentSpaceUuid` / `removeUserSpace` | 循环追根；撤销不再本地短路 |

影响面已核对：`grantUserProject` 仅 1 个调用点，`LightDashClientService::grantUserSpace` 仅 1 个调用点。

### 5.1 P0-A `grantUserProject` 返回结构化结果

```php
public const PROJECT_ACCESS_ADDED          = 'added';
public const PROJECT_ACCESS_ALREADY_MEMBER = 'already_member';
public const PROJECT_ACCESS_FAILED         = 'failed';

/** @return array{result:string, httpCode:int, message:string} */
public function grantUserProject(string $mobile): array
{
    $email    = $this->getEmail($mobile);
    $response = $this->request('POST', sprintf('projects/%s/access', $this->projectUuid), [
        'email' => $email, 'role' => self::DEFAULT_PROJECT_ROLE, 'sendEmail' => false,
    ]);
    $httpCode = (int) ($response['httpCode'] ?? 0);
    $message  = (string) ($response['message'] ?? $response['error'] ?? '');

    if (200 === $httpCode) {
        return ['result' => self::PROJECT_ACCESS_ADDED, 'httpCode' => $httpCode, 'message' => $message];
    }
    if (409 === $httpCode) {   // 已是项目成员，幂等成功
        return ['result' => self::PROJECT_ACCESS_ALREADY_MEMBER, 'httpCode' => $httpCode, 'message' => $message];
    }
    $this->logger->error('grantUserProjectFailed', ['email' => $email, 'httpCode' => $httpCode, 'message' => $message]);
    return ['result' => self::PROJECT_ACCESS_FAILED, 'httpCode' => $httpCode, 'message' => $message];
}
```

> 现有判定 `'ok' === status || 409 === httpCode` 的**码映射本身是对的**（`config.php` 已配 `http_errors => false`，409 不会被 Guzzle 抛成 503）。错的是语义不可区分 + 调用方丢弃 + 不回查。

### 5.2 P0-B 早退改查事实，`is_auth_project` 后移

```php
private function isProjectMember(int $userId): bool
{
    $project = $this->queryBuilder->from($this->getTableName('projects'))
        ->select('project_id')->where('project_uuid = ?', $this->projectUuid)
        ->query()->fetch(\PDO::FETCH_ASSOC);
    if (empty($project)) return false;

    $row = $this->queryBuilder->from($this->getTableName('project_memberships'))
        ->select('user_id')
        ->where('project_id = ?', $project['project_id'])
        ->where('user_id = ?', $userId)
        ->query()->fetch(\PDO::FETCH_ASSOC);

    return !empty($row);
}
```

```php
$userInfo = $this->findUserByMobile($mobile);
// 早退只看事实
if (Arrays::isNotEmpty($userInfo) && !empty($userInfo['user_id']) && $this->isProjectMember((int) $userInfo['user_id'])) {
    return $userInfo;
}

$result = $this->request('POST', 'invite-links', $data);
if ('ok' === $result['status'] || 400 === $result['httpCode']) {
    $this->createOpenId($mobile, $userName);       // 内部删掉 is_auth_project=true
    $grant = $this->grantUserProject($mobile);
    if (self::PROJECT_ACCESS_FAILED === $grant['result']) {
        return [];                                 // 不置位，留给下次同步重试
    }
    return $userInfo ?? $result['results'];
}
```

`is_auth_project` 更彻底的做法是**废弃该列**，所有读取点换成 `isProjectMember()`。

### 5.3 P0-C 消费返回值并隔离失败

```php
if (Arrays::isNotEmpty($addDashboardIds)) {
    $this->createLightDashUserWithRetry($employee, $addDashboardIds);

    $failedIds = [];
    foreach ($addDashboardIds as $dashboardId) {
        $dashboardInfo = $dashboardList[$dashboardId] ?? null;
        if (null === $dashboardInfo) { continue; }
        try {
            $granted = $this->grantUserSpace($employee, $dashboardInfo);
        } catch (\Throwable $e) {
            $granted = false;                       // 单条失败不得中断整批
            $this->logger->error('grantUserSpaceException', [
                'employee_id' => $employee->getId(), 'dashboard_id' => $dashboardId, 'message' => $e->getMessage(),
            ]);
        }
        if (!$granted) { $failedIds[] = $dashboardId; }
    }
    if (Arrays::isNotEmpty($failedIds)) {
        $this->saveOperatorLog('lightdash', 'grant-space-fail', (string) $employee->getId(), [
            'mobile' => $employee->getMobile(), 'failed_dashboard_ids' => array_values($failedIds),
        ], $employee->getCreateBy() ?? 'admin-job', sprintf('Lightdash空间授权失败(mobile:%s)', $employee->getMobile()));
    }
}
```

关键：`is_auth` 只在 `grantUserSpace` 返回 `true` 时推进，**失败绝不置位**，保留重放机会。

### 5.4 P1 `is_auth` 改成派生值（治本）

```sql
ALTER TABLE report_dashboard_employee_role
    ADD COLUMN auth_space_uuid VARCHAR(64) NULL AFTER is_auth;
```

- `updateAuth` 同时写 `auth_space_uuid = <当次 grant 的 space_uuid>`
- `lightdash:space-change` 的筛选条件改为：

```php
Criteria::create()->whereRaw('is_auth = 0 OR auth_space_uuid IS NULL OR auth_space_uuid <> d.space_uuid')
```

这样「空间移动过」会自动进入重放集合，形成闭环，不再靠人工发现。

另外建议 `spaceRole` 固定 `viewer`：原逻辑按**组织角色**映射 `editor`/`viewer`，而 `createOpenId` 会把 viewer/interactive_viewer 提升为 `member`，两者口径不一致，员工提权后会意外拿到编辑器权限。

### 5.5 P2 两个收尾

```php
// 循环追根，防御环状父子关系（原实现只跳一层，两层以上嵌套必然 403）
public function getCurrentSpaceUuid(string $spaceUuid): string
{
    $spacesTable = $this->getTableName('spaces');
    $current = $spaceUuid;
    for ($depth = 0; $depth < 10; ++$depth) {
        $row = $this->queryBuilder->from($spacesTable)
            ->select('space_uuid', 'parent_space_uuid')
            ->where('space_uuid = ?', $current)
            ->query()->fetch(\PDO::FETCH_ASSOC);
        if (empty($row) || Text::isEmpty($row['parent_space_uuid'])) { return $current; }
        $current = $row['parent_space_uuid'];
    }
    return $current;
}

// 撤销不再本地短路（原实现命中本地即 return true，导致授权长期残留）
public function removeUserSpace(int $employeeId, string $mobile, string $spaceUuid): bool
{
    return $this->removeUserLightSpace($mobile, $spaceUuid);   // 404 视为成功
}
```

---

## 6. 验收

1. 单用户重放：`UPDATE report_dashboard_employee_role SET is_auth = 0 WHERE employee_id=<id> AND dashboard_id=<id>;`
   然后 `./console light-dash-space-change`，确认输出 `result = success`
2. Lightdash 侧确认落库（§4.2 的 SQL ③）
3. 用该员工账号登录，确认目标看板可见
4. **反向验证**：故意传一个不存在的 `spaceUuid` → `operator_log` 出现 `grant-space-fail`、`is_auth` 保持 `0`、日志有 404

---

## 7. 附录

**日志关键字**

| 关键字 | 含义 |
|---|---|
| `lightDashClientRequest` | 每次 API 调用（含 uri / body / response） |
| `lightDashRequestError` | 非 `ok` 响应，含 httpCode |
| `EmailNotFind` | `createOpenId` 找不到 email 行 |
| `create-user-fail`（`operator_log`） | `createLightDashUserWithRetry` 三次失败 |
| `grant-space-fail`（本文新增） | 空间授权失败汇总 |

**相关文档**

- [组织管理员：OIDC 用户开通 API](./org-admin-users-provision.md)
- [OIDC 登录/退出三种方式](./oidc-logout-modes.md)
- [本仓 CLI 使用流程](../cli/cli-standalone-usage.md)
