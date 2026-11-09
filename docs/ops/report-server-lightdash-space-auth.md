# report-server ⇄ Lightdash 空间授权排查与修复

**状态：排查结论（诊断已定）／report-server 侧修复待开发**

> 「用户已被分配看板、却始终没有空间访问权」的根因记录。
> 本仓（Lightdash）无需改动，修复全部在 `report-server`。
> 跳读指引：**§2** 结论、**§3–§4** 判定逻辑与对照表（核心）、**§7** 下次复现、**§8** 改代码。

---

## 1. 一句话结论（最新）

> 现有实现**只判断「HTTP 响应」，从不判断「权限状态」**：`grantUserSpace` 只看 body 里的 `"status":"ok"`、连 `httpCode` 都不校验、写完不回查——于是「服务器没报错」被当成「权限已生效」，`is_auth` 就此置 1；而 `is_auth = 1` 正好是唯一补偿任务（每 2 小时的 `light-dash-space-change`，`helm-values.yaml:82`）的**排除条件**，标记一旦与实际权限脱节，就再也没有代码路径能纠正它。
>
> **最可能的真相：走的是「判定通过 → `is_auth=1` → 实际从未授权成功」这条路**，而不是「接口一直报错」。

### 已排除的四条误判（别再花时间）

| 怀疑 | 结论 |
|---|---|
| 空间没指定 | ❌ `grantUserSpace($mobile, $spaceUuid)` 显式传 `space_uuid`；全链路 `dashboard_uuid → space_id → space_uuid`，从不按名字匹配 |
| 同级重名空间串号 | ❌ 同上，按 uuid 精确执行（重名只影响「人肉判断」，不影响授权目标） |
| 用户不是项目成员 | ❌ 后端 `addSpaceAccess` 只有一句 `insert ... onConflict.merge()`，**根本不校验成员资格** |
| 「只能与现有的项目成员共享空间」是报错 | ❌ 它是 `ShareSpaceModal` 的**静态提示文案**，只在「访问类型=Private + 有 `create InviteLink` 权限」时渲染 |

---

## 2. 判定逻辑全景（当前实现）

```
saveDashboardEmployeeRole()                        DashboardServiceImpl.php:279
├─ addDashboardIds = array_diff(new, old)                          :335  ← 只有「新增」才授权
├─ if (isNotEmpty(addDashboardIds))
│   ├─ createLightDashUserWithRetry()      ★返回值丢弃            :355
│   │   └─ createLightDashUser()           ClientImpl:86
│   │       ├─ J0 身份：emails 按 {手机}@{orgDomain} 精确匹配
│   │       ├─ J1 早退：is_auth_project === true                   :96
│   │       ├─ J2 建号：status==='ok' || httpCode===400            :102
│   │       ├─ createOpenId()              ★返回值丢弃 (J3)        :105
│   │       └─ grantUserProject()          ★返回值丢弃 (J4)        :107
│   └─ foreach { grantUserSpace(emp, dash) }   ★返回值丢弃         :363
│       ├─ J6 getCurrentSpaceUuid()  只跳一层 parent               :213
│       ├─ J7 spaceRole = 组织角色 → editor/viewer                 :233
│       └─ J8 POST .../spaces/{uuid}/share → 'ok' === status       :237
└─ J9 if ($result === true) → updateAuth() → is_auth = 1           :440

补偿任务（每 2 小时）
light-dash-space-change                            LightdashSpaceChangeCommand.php:23
├─ J12 Criteria(['is_auth'=>0]) OR dashboard_id IN (moved)         :82
├─ J13 漂移判据：快照≠实时 → 先改快照、再授权（解耦）             :65-72
└─ foreach { DashboardService::grantUserSpace() }                  :127

撤销
├─ J10 removeUserSpace：本地计数命中即 return true（不调 API）     :241
└─ J11 removeUserLightSpace → DELETE → 'ok' === status             :261
```

### 判定点清单

| # | 判定点 | 当前实现 | 位置 |
|---|---|---|---|
| J0 | 用户身份 | `emails` 按 `{mobile}@{orgDomain}` 精确匹配 | `:468` |
| J1 | 建号早退 | `is_auth_project === true` | `:96` |
| J2 | 建号 | `status==='ok' \|\| httpCode===400` | `:102` |
| J3 | 激活结果 | **忽略返回值** | `:105` |
| J4 | 项目授权结果 | **忽略返回值** | `:107` |
| J5 | 项目授权 | `status==='ok' \|\| httpCode===409` | `:172` |
| J6 | 空间归属 | 只跳一层 parent | `:213` |
| J7 | 空间角色 | 组织角色 `developer/admin`→`editor`，否则 `viewer` | `:233` |
| **J8** | **空间授权** | **`'ok' === $result['status']`，完全不看 `httpCode`** | `:237` |
| J9 | 落标记 | `$result === true` → `is_auth = 1` | `:440` |
| J10 | 撤销短路 | 本地计数命中即 `true`，不调 API | `:241` |
| J11 | 撤销 | `'ok' === $result['status']` | `:261` |
| J12 | 补偿筛选 | `is_auth = 0` OR 漂移 | `:82` |
| J13 | 漂移判据 | 快照 ≠ 实时 → 先改快照再授权 | `:65-72` |
| J14 | 空间权限查询 | `getUserSpace()` 遍历 `access[].email` | `:181` |

---

## 3. 判定强度：只有「响应级」，没有「状态级」

| 强度 | 含义 | 当前使用情况 |
|---|---|---|
| ① 响应级 | 服务器有没有报错 | **J2/J5/J8/J11 全部用这个** |
| ② 落库级 | 数据有没有写进去 | 无 |
| ③ 状态级 | 这个人现在是否真的有权限 | 无 |

**状态级查询方法其实已经写好了，只是没有任何授权路径调用它：**

| 方法 | 能力 | 谁在调用 |
|---|---|---|
| `getUserSpace($mobile, $spaceUuid)` `:181` | GET 空间详情 + 遍历 `access[].email` | **无人调用** |
| `getProjectUserAccess($mobile)` `:70` | GET `projects/{p}/user/{uuid}` | 仅外部读取 |
| `getUserAccess($mobile)` `:265` | 同上 | 仅外部读取 |

`grantUserSpace` 拿到 200 就返回，从不回查。这就是「接口调用成功、权限实际不存在」的结构性原因。

---

## 4. 对照表：当前判定 vs 真实结果 ★

| 场景 | 当前判定 | `is_auth` | 真实结果 | 一致? |
|---|---|---|---|---|
| 正常授权 | true | 1 | 有权限 | ✅ |
| 空间不存在（404） | false | 0 | 无权限 | ✅ |
| 调用方无 `manage`（403：私有空间/嵌套） | false | 0 | 无权限 | ✅ |
| 网络超时（catch→503） | false | 0 | 无权限 | ✅ |
| **授权到旧快照空间** | **true** | **1** | 新空间无权限 | ❌ |
| **`user_uuid` 命中了另一个人** | **true** | **1** | 目标人无权限 | ❌ |
| **200 但 body 非标准结构含 `status:ok`** | **true** | **1** | 未知 | ❌ 未校验 `httpCode` |
| **授权成功后 `removeUserSpace` 删了行** | — | **仍 1** | 无权限 | ❌ 无 1→0 路径 |
| **人工设的空间 admin 被再次 upsert** | true | 1 | 被 `merge()` 降级 | ❌ 角色被覆盖 |
| **`createOpenId` 失败** | 忽略 | 1 | 用户未激活 | ❌ J3 |
| **`grantUserProject` 失败** | 忽略 | 1 | 不在项目 | ❌ J4 |
| **看板分配因叶类目过滤被判成删除** | 触发撤销 | 行被删 | 配置还在、无权限 | ❌ |
| 私有空间 + 组织 admin | true | 1 | 有权限 | ✅ |
| 私有空间 + 仅项目 admin | false | 0 | 无权限 | ✅（但无告警） |

**方向正确（不会把 4xx/5xx 当成功），但「成功」的定义太弱**——上表 7 行 ❌ 全部源于「服务器没报错」被当成「权限已生效」。

### 为什么难查：失败被三层包装成成功

| 层 | 机制 | 后果 |
|---|---|---|
| 建号层 | `createOpenId()` 在 `grantUserProject()` **之前**就 `UPDATE users SET is_auth_project=true`；后者返回值被丢弃 | 一次失败 → 永久早退，不自愈 |
| 授权层 | J8 只认 body 里的 `status`；`addSpaceAccess` 不校验空间归属与成员资格，能写库就 200 | 落到旧/错空间也算成功 |
| 可观测层 | `saveDashboardEmployeeRole()` 恒返回 `true`，J3/J4/J8 的返回值全丢弃；`Assert::notNull` 抛未捕获异常会中断整个 foreach | 同批后续看板全不授权，且无告警 |

> `is_auth_project` **不是 Lightdash 的字段**——本仓所有包与 migration 里都没有，是接入时手工 ALTER 出来的「影子列」。副作用：用标准 migration 重建库后，`SELECT v.is_auth_project` 直接 SQL 报错。

---

## 5. Lightdash 侧契约速查（改 report-server 前必看）

### 5.1 空间共享接口

`POST /api/v1/projects/{projectUuid}/spaces/{spaceUuid}/share`，body `{userUuid, spaceRole}`（`viewer|editor|admin`）

`SpaceService.addSpaceUserAccess:497-532` 只做四件事：查空间（不存在→404）、取调用者空间角色、**拒绝嵌套空间（403）**、查 `manage` 权限（否则 403）。落到 `SpaceModel.addSpaceAccess:1902-1915` 只有 `insert ... onConflict.merge()`。

**四条关键结论：** ① 不校验 `projectUuid` 与空间归属；② 不校验被共享人是否项目成员；③ `spaceUuid` 存在就 200；④ **200 只证明 `(user_uuid, space_uuid)` 写进去了，不证明这两个 uuid 是对的。**

### 5.2 谁有权 manage 空间（★ 两个坑）

| 调用方组织角色 | 可 manage 的空间 |
|---|---|
| editor / interactive_viewer | 仅 `isPrivate: false`（L239-242） |
| editor / interactive_viewer | 私有空间要求该空间 `access` 里自己是 `admin`（L190-198） |
| **admin** | **组织内任意 Space，无 `isPrivate` 条件**（L358-360） |

- **坑 1：组织 admin ≠ 项目 admin。** 判定只看 `organization_memberships.role`，`project_memberships.role='admin'` 不豁免。
- **坑 2：嵌套空间的 403 排在能力检查之前**（`SpaceService.ts:509-514`），**任何角色包括组织 admin 都共享不了嵌套空间**。

判断顺序：空间存在？→ 是否嵌套（403）→ 是否有 manage（403）→ upsert（200）。

### 5.3 PAT 的权限 = token 创建者的组织角色

`UserModel.findSessionUserByPersonalAccessToken:899-930` 用 `generateUserAbilityBuilder(row)`，row 来自 token 的 `created_by_user_id`。所以「这把 API key 是管理员」必须落实成：该 token owner 在 `organization_memberships` 里是 `admin`。

token 存 bcrypt（salt 由 `LIGHTDASH_SECRET` 派生），SQL 无法反查，按使用时间定位：

```sql
SELECT pat.personal_access_token_uuid, pat.description, pat.last_used_at,
       u.user_id, e.email, om.role AS org_role
FROM personal_access_tokens pat
JOIN users u ON u.user_id = pat.created_by_user_id
JOIN emails e ON e.user_id = u.user_id
LEFT JOIN organization_memberships om ON om.user_id = u.user_id
ORDER BY pat.last_used_at DESC NULLS LAST;
```

`org_role = admin` → 私有空间 403 排除，只剩「快照陈旧」或「身份错位」。

### 5.4 其他接口语义

**项目成员** `POST /projects/{p}/access`（`ProjectModel.ts:1545-1590`）：

| 码 | 语义 | 成功 |
|---|---|---|
| 200 | 新插入 | ✅ |
| **409** | `AlreadyExistsError`，已是成员 | ✅ **幂等** |
| **404** | `Can't find user with email X in the organization` | ❌ 最该告警 |
| 403 | 调用方无 `manage Project` | ❌ |
| 503 | `request()` 的 catch | ❌ |

**邀请链接** `POST /invite-links` 的 **400 是预期语义**（email 已存在且非 pending，`UserService.ts:398-411`）——report-server 正是靠它判断「用户已存在」。

**错误码**：`ParameterError` 400 / `ForbiddenError` 403 / `NotExistsError` 404 / `AlreadyExistsError` 409。

---

## 6. `is_auth` 的实际语义

DDL 注释（`resources/schema.yaml:399`）写的是「0 未验证，1 验证」，但代码里它只表示一件事：

> **这条记录对应的那次空间共享 API，曾经返回过 body 里带 `"status":"ok"` 的响应。**

它明确**不**代表：现在还有权限 / 授的是看板当前所在的空间 / 授给了这个人。原因是它把**三维状态**（员工 × 看板 × 空间）压成了一维布尔，**没记录授权时用的 `space_uuid`**。

写入/读取全仓仅三处：`updateAuth()` 只写 1（`RepositoryImpl:41`）、`setIsAuth($old ?? 0)` 重建时继承（`ServiceImpl:314`）、`LightdashSpaceChangeCommand:82` 只读 `= 0`。**没有任何 1 → 0 的路径。**

---

## 7. 下次复现：5 分钟判别

### 7.1 看日志（最快，按 user_uuid 定位）

请求体是 `{"userUuid":"<uuid>","spaceRole":"viewer"}` —— 日志里带 uuid、不带手机号：

```bash
grep "<user_uuid>" <report-server日志> \
  | grep -E "lightDashClientRequest|lightdashRequestError|/spaces/" | tail -20
```

三种失败响应一眼分开：

| message | httpCode | 原因 |
|---|---|---|
| `You don't have access to this resource or action` | 403 | 调用方对该私有空间无 `manage`（坑 1） |
| `Can't change user access to a nested space` | 403 | 嵌套空间（坑 2） |
| `Space with spaceUuid xxx does not exist` | 404 | 快照指向已删除/别的环境的空间 |

### 7.2 三条 SQL

```sql
-- ① report-server 库：标记 + 快照空间
SELECT r.dashboard_id, r.is_auth, d.dashboard_uuid, d.space_uuid AS snapshot_space_uuid
FROM report_dashboard_employee_role r
JOIN report_dashboard d ON d.id = r.dashboard_id
JOIN report_employee e ON e.id = r.employee_id
WHERE e.mobile = '<手机号>';
```

```sql
-- ② Lightdash 库：看板当前真实空间
SELECT d.dashboard_uuid, s.space_uuid AS real_space_uuid, s.is_private, s.parent_space_uuid
FROM dashboards d LEFT JOIN spaces s ON s.space_id = d.space_id
WHERE d.dashboard_uuid = '<① 取到的值>';
```

```sql
-- ③ Lightdash 库：用户实际被共享了哪些空间
SELECT sua.space_uuid, s.name, s.is_private, sua.space_role, sua.created_at
FROM space_user_access sua
LEFT JOIN spaces s ON s.space_uuid = sua.space_uuid
JOIN emails e ON e.user_id = sua.user_id
WHERE e.email = '<手机号>@<LIGHTDASH_ORG_DOMAIN>';
```

### 7.3 判定

| 现象 | 定性 |
|---|---|
| **`is_auth=1` 且 ③ 里没有该看板所在空间的记录** | **最可能**：判定通过、标记已置、权限从未生效 → 补偿任务永远跳过 |
| `is_auth=1` 且自己的行是**人工加的**（`created_at` = 手工操作时间） | 同上，可确认「之前一直没有」 |
| `is_auth=0` | 每 2 小时都在重试 → 看日志 httpCode 定因 |
| **查不到该角色行** | 被叶类目过滤判成删除 → `removeUserSpace` 撤销 + 补偿任务看不见 |
| `snapshot ≠ real` | 快照陈旧；若同时 `is_auth=1`，就是 §8-L4 的「一次性漂移信号」丢失 |

> 重名空间（`价格指数` 同时存在 `is_private=f` 与 `is_private=t` 两个根空间）只影响人肉辨认：授权按 uuid 走不会串，但**用授权条数可以反查弹窗是哪一个空间**（`pageSize=5` × 页面数）。

### 7.4 手工复现

```bash
curl -sS -X POST \
  -H "Authorization: ApiKey $LDPAT" -H "Content-Type: application/json" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/spaces/$SPACE_UUID/share" \
  -d "{\"userUuid\":\"$TARGET_USER_UUID\",\"spaceRole\":\"viewer\"}" \
  -w '\nHTTP:%{http_code}\n'
```

---

## 8. 修复逻辑（5 层）

| 层 | 目标 | 关键动作 |
|---|---|---|
| L1 判定统一 | 治「假成功」 | 收敛成一个 `isSuccess()`：以 `httpCode` 为主、body.status 为辅 |
| L2 写后回查 | 治「不知道有没有」 | 用现成的 `getUserSpace()` / `getProjectUserAccess()` 验证 |
| L3 失败传播 | 治「静默」 | 消费返回值、单条异常隔离、落 `operator_log` |
| L4 标记派生 | 治「永久脱节」 | `is_auth` → `auth_space_uuid`；快照更新移到授权成功之后 |
| L5 附带修正 | 清掉三个隐患 | J6 循环追根 / J7 角色口径 / J10 撤销短路 |

影响面已核对：`grantUserProject` 仅 1 个调用点，`LightDashClientService::grantUserSpace` 仅 1 个调用点。

### L1 统一判定

```php
/** @param int[] $alsoOk 额外视为成功的状态码（如 409 幂等） */
private function isSuccess(array $response, array $alsoOk = []): bool
{
    $code = (int) ($response['httpCode'] ?? 0);
    if (in_array($code, $alsoOk, true)) {
        return true;
    }
    return 200 === $code && 'ok' === ($response['status'] ?? null);
}
```

| 位置 | 原判定 | 改为 |
|---|---|---|
| J2 建号 | `status==='ok' \|\| httpCode===400` | `isSuccess($r, [400])` |
| J5 项目 | `status==='ok' \|\| httpCode===409` | `isSuccess($r, [409])` |
| J8 空间 | `'ok' === $r['status']` | `isSuccess($r)` |
| J11 撤销 | `'ok' === $r['status']` | `isSuccess($r)` |

### L2 + L3 空间授权：回查 + 失败落日志

```php
public function grantUserSpace(string $mobile, string $spaceUuid): bool
{
    $userInfo = $this->findUserByMobile($mobile);
    Assert::notNull($userInfo['user_uuid'], '用户UUID不能为空 mobile=' . $mobile);

    $currentSpaceUuid = $this->getCurrentSpaceUuid($spaceUuid);
    $response = $this->request(
        'POST',
        sprintf('projects/%s/spaces/%s/share', $this->projectUuid, $currentSpaceUuid),
        ['userUuid' => $userInfo['user_uuid'], 'spaceRole' => 'viewer']
    );

    if (!$this->isSuccess($response)) {
        $this->logger->error('grantUserSpaceFailed', [
            'mobile' => $mobile, 'spaceUuid' => $currentSpaceUuid,
            'httpCode' => $response['httpCode'] ?? 0, 'message' => $response['message'] ?? '',
        ]);
        return false;
    }

    // 关键：把「曾经 200」升级为「当前确实在访问列表里」
    $verified = $this->getUserSpace($mobile, $currentSpaceUuid);
    if (!$verified) {
        $this->logger->error('grantUserSpaceVerifyFailed', ['mobile' => $mobile, 'spaceUuid' => $currentSpaceUuid]);
    }
    return $verified;
}
```

`grantUserProject` 同步改为结构化返回 + 409 幂等 + 404 告警：

```php
public const PROJECT_ACCESS_ADDED = 'added';
public const PROJECT_ACCESS_ALREADY_MEMBER = 'already_member';
public const PROJECT_ACCESS_FAILED = 'failed';

/** @return array{result:string, httpCode:int, message:string} */
public function grantUserProject(string $mobile): array
{
    $email = $this->getEmail($mobile);
    $response = $this->request('POST', sprintf('projects/%s/access', $this->projectUuid), [
        'email' => $email, 'role' => self::DEFAULT_PROJECT_ROLE, 'sendEmail' => false,
    ]);
    $httpCode = (int) ($response['httpCode'] ?? 0);

    if (200 === $httpCode) return ['result' => self::PROJECT_ACCESS_ADDED, 'httpCode' => $httpCode, 'message' => ''];
    if (409 === $httpCode) return ['result' => self::PROJECT_ACCESS_ALREADY_MEMBER, 'httpCode' => $httpCode, 'message' => ''];

    $this->logger->error('grantUserProjectFailed', ['email' => $email, 'httpCode' => $httpCode]);
    return ['result' => self::PROJECT_ACCESS_FAILED, 'httpCode' => $httpCode, 'message' => (string) ($response['message'] ?? '')];
}
```

调用方（`saveDashboardEmployeeRole:354-366`）必须消费返回值：

```php
if (Arrays::isNotEmpty($addDashboardIds)) {
    $userOk = $this->createLightDashUserWithRetry($employee, $addDashboardIds);

    $failedIds = [];
    foreach ($addDashboardIds as $dashboardId) {
        $dashboardInfo = $dashboardList[$dashboardId] ?? null;
        if (null === $dashboardInfo) { continue; }
        try {
            $granted = $userOk && $this->grantUserSpace($employee, $dashboardInfo);
        } catch (\Throwable $e) {
            $granted = false;                       // 单条失败不中断整批
            $this->logger->error('grantUserSpaceException', ['dashboard_id' => $dashboardId, 'message' => $e->getMessage()]);
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

### L4 标记改派生（治本）

```sql
ALTER TABLE report_dashboard_employee_role
    ADD COLUMN auth_space_uuid VARCHAR(64) NULL AFTER is_auth;
```

| 变化 | 改法 |
|---|---|
| `updateAuth()` | 同时写 `auth_space_uuid = <本次 grant 的 space_uuid>` |
| J9 落标记 | 仅在回查通过的 `true` 时推进 |
| **J13 漂移** | **快照更新必须挪到授权成功之后**，否则「漂移」信号只用一次就丢 |
| J12 补偿筛选 | `is_auth = 0 OR auth_space_uuid IS NULL OR auth_space_uuid <> d.space_uuid` |
| 「已授权」定义 | 从「曾经成功」变成 `auth_space_uuid = d.space_uuid`，可随时重算 |

### L5 三个附带修正

```php
// J6 循环追根，防环（原实现只跳一层，2 层以上嵌套必 403）
public function getCurrentSpaceUuid(string $spaceUuid): string
{
    $table = $this->getTableName('spaces');
    $current = $spaceUuid;
    for ($i = 0; $i < 10; ++$i) {
        $row = $this->queryBuilder->from($table)
            ->select('space_uuid', 'parent_space_uuid')
            ->where('space_uuid = ?', $current)->query()->fetch(\PDO::FETCH_ASSOC);
        if (empty($row) || Text::isEmpty($row['parent_space_uuid'])) { return $current; }
        $current = $row['parent_space_uuid'];
    }
    return $current;
}

// J10 撤销不再本地短路（原实现命中即 return true，把 API 调用跳过了）
public function removeUserSpace(int $employeeId, string $mobile, string $spaceUuid): bool
{
    return $this->removeUserLightSpace($mobile, $spaceUuid);   // 404 视为成功
}
```

> **J7**：`spaceRole` 从**组织角色**推断 `editor/viewer`，与 `createOpenId` 把 viewer 提升为 `member` 的口径冲突，且与「人工设的空间 admin 会被 `merge()` 覆盖」互相打架。建议固定 `viewer`，或从看板配置显式读。

---

## 9. 验收

1. 单用户重放：`UPDATE report_dashboard_employee_role SET is_auth = 0 WHERE employee_id=<id> AND dashboard_id=<id>;`
   然后 `./console light-dash-space-change`，确认输出 `result = success`
2. Lightdash 侧确认落库（§7.2 的 SQL ③）
3. 用该员工账号登录，确认目标看板可见
4. **反向验证**：故意传不存在的 `spaceUuid` → `operator_log` 出现 `grant-space-fail`、`is_auth` 保持 `0`、日志有 404

---

## 10. 附录

**日志关键字**

| 关键字 | 含义 |
|---|---|
| `lightDashClientRequest` | 每次 API 调用（含 uri / body / response） |
| `lightdashRequestError` | 非 `ok` 响应，含 httpCode |
| `EmailNotFind` | `createOpenId` 找不到 email 行 |
| `create-user-fail`（`operator_log`） | `createLightDashUserWithRetry` 三次失败 |
| `grantUserSpaceFailed` / `grantUserSpaceVerifyFailed` / `grant-space-fail`（本文新增） | 空间授权失败与回查失败 |

**相关文档**

- [组织管理员：OIDC 用户开通 API](./org-admin-users-provision.md)
- [OIDC 登录/退出三种方式](./oidc-logout-modes.md)
- [本仓 CLI 使用流程](../cli/cli-standalone-usage.md)
