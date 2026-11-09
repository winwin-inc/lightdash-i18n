# 空间授权判断的代码增强（PHP）

**状态：待开发**

> 目标：把「授权看板」这条链路的判断从「服务器没报错就算成功」改成「这个人现在真的有权限才算成功」。
> 只涉及两个文件：`src/service/LightDashClientServiceImpl.php`、`src/service/DashboardServiceImpl.php`，
> 外加一个命令 `src/application/command/LightdashSpaceChangeCommand.php`。

---

## 核心思路（三句话）

1. **判断标准**：看 HTTP 状态码（`httpCode`），不看响应体里那个 `"status":"ok"`。
2. **成功的定义**：写完立刻回查「这个人是不是在这个空间的访问列表里」，在才算成功。
3. **失败必须留痕**：不置 `is_auth`、写操作日志、单条失败不中断同批。

---

## 改动清单

| # | 文件 | 方法 | 一句话 |
|---|---|---|---|
| 1 | ClientImpl | `isSuccess()` | 新增：统一响应判定 |
| 2 | ClientImpl | `grantUserSpace()` | **核心**：改判 httpCode + 写完回查 |
| 3 | ClientImpl | `getUserSpace()` | 加固：用 httpCode + email 忽略大小写 |
| 4 | ServiceImpl | `grantUserSpace()` | 只有回查通过才置 `is_auth` |
| 5 | RepositoryImpl | `updateAuth()` | 多记一列「授权时的空间」 |
| 6 | ServiceImpl | `saveDashboardEmployeeRole()` | 消费返回值、失败落 `operator_log` |
| 7 | ClientImpl | `createLightDashUser()` | 早退改查「是否真在项目成员表」 |
| 8 | ClientImpl | `isProjectMember()` | 新增：查 `project_memberships` |
| 9 | ClientImpl | `grantUserProject()` | 200/409 才成功，失败记日志 |
| 10 | ClientImpl | `createOpenId()` | 删掉 `is_auth_project` 的写入 |
| 11 | ClientImpl | `removeUserLightSpace()` | 404 视为成功 |
| 12 | Command | `light-dash-space-change` | 授权失败要回滚快照，否则不再重试 |

---

## 1. 新增统一判定

现有代码里三个方法用了三套标准，先收敛：

```php
/**
 * 统一响应判定：以 httpCode 为准，body.status 只做辅助。
 *
 * @param array $response request() 的返回值
 * @param int[] $alsoOk   额外视为成功的状态码（如 409 幂等、400 预期语义）
 */
private function isSuccess(array $response, array $alsoOk = []): bool
{
    $httpCode = (int) ($response['httpCode'] ?? 0);

    if (in_array($httpCode, $alsoOk, true)) {
        return true;
    }

    return 200 === $httpCode && 'ok' === ($response['status'] ?? null);
}
```

---

## 2. `grantUserSpace()` —— 核心改动

### 现状

```php
public function grantUserSpace(string $mobile, string $spaceUuid): bool
{
    $userInfo = $this->findUserByMobile($mobile);
    Assert::notNull($userInfo['user_uuid'], '用户UUID不能为空 mobile='.$mobile);
    // 获取父的空间权限
    $currentSpaceUuid = $this->getCurrentSpaceUuid($spaceUuid);
    $shareUri = sprintf('projects/%s/spaces/%s/share', $this->projectUuid, $currentSpaceUuid);
    $organizateionMember = $this->getOrganizateionMember($userInfo['user_id']);
    $spaceRequest = [
        'userUuid' => $userInfo['user_uuid'],
        'spaceRole' => in_array($organizateionMember['role'], ['developer', 'admin'], true) ? 'editor' : 'viewer',
    ];
    $result = $this->request('POST', $shareUri, $spaceRequest);

    return 'ok' === $result['status'];   // ← 只看响应体，不看状态码，也不回查
}
```

### 问题

| 问题 | 后果 |
|---|---|
| 只看 `$result['status']` | 任何带 `"status":"ok"` 的响应都算成功，哪怕 HTTP 是 4xx |
| 不校验 `httpCode` | `request()` 明明算了 `httpCode` 却没用 |
| 不回查 | 接口只要空间存在就返回成功，**不校验授给了谁、授到哪个空间** |
| 失败信息全丢 | 上层拿不到原因，日志里也没有 |

### 改为

```php
public function grantUserSpace(string $mobile, string $spaceUuid): bool
{
    // ① 身份：先确认这个人存在
    $userInfo = $this->findUserByMobile($mobile);
    if (Arrays::isEmpty($userInfo) || empty($userInfo['user_uuid'])) {
        $this->logger->error('grantUserSpace: 用户不存在', ['mobile' => $mobile]);

        return false;
    }

    $currentSpaceUuid = $this->getCurrentSpaceUuid($spaceUuid);

    // ② 发起授权
    $response = $this->request(
        'POST',
        sprintf('projects/%s/spaces/%s/share', $this->projectUuid, $currentSpaceUuid),
        [
            'userUuid' => $userInfo['user_uuid'],
            'spaceRole' => 'viewer',
        ]
    );

    // ③ 判断标准：看状态码
    $httpCode = (int) ($response['httpCode'] ?? 0);
    if (!$this->isSuccess($response)) {
        $this->logger->error('grantUserSpaceFailed', [
            'mobile'    => $mobile,
            'spaceUuid' => $currentSpaceUuid,
            'httpCode'  => $httpCode,
            'message'   => $response['message'] ?? $response['error'] ?? '',
        ]);

        return false;
    }

    // ④ 写完回查：确认这个人真的出现在该空间的访问列表里
    if (!$this->getUserSpace($mobile, $currentSpaceUuid)) {
        $this->logger->error('grantUserSpaceVerifyFailed', [
            'mobile'    => $mobile,
            'spaceUuid' => $currentSpaceUuid,
            'httpCode'  => $httpCode,
        ]);

        return false;
    }

    return true;
}
```

> `spaceRole` 直接写死 `viewer`。原来从**组织角色**推断 `editor`/`viewer`，而 `createOpenId()` 又会把 viewer/interactive_viewer 提升成 `member`，两处口径不一致，容易在员工提权后意外拿到编辑权限。

---

## 3. `getUserSpace()` —— 回查方法本身要加固

回查是整个方案的地基，必须可靠。

### 现状

```php
public function getUserSpace(string $mobile, string $spaceUuid): bool
{
    $uri = sprintf('projects/%s/spaces/%s', $this->projectUuid, $spaceUuid);
    $email = $this->getEmail($mobile);
    $response = $this->request('GET', $uri);

    if ('ok' !== $response['status']) {
        return false;
    }
    if (Arrays::isEmpty($response['results']['access'])) {
        return false;                                  // ← access 不存在会 warning
    }
    foreach ($response['results']['access'] as $access) {
        if ($access['email'] === $email) {             // ← 大小写敏感
            return true;
        }
    }

    return false;
}
```

### 改为

```php
public function getUserSpace(string $mobile, string $spaceUuid): bool
{
    $response = $this->request(
        'GET',
        sprintf('projects/%s/spaces/%s', $this->projectUuid, $spaceUuid)
    );

    if (200 !== (int) ($response['httpCode'] ?? 0)) {
        return false;
    }

    $accessList = $response['results']['access'] ?? [];
    if (!is_array($accessList) || Arrays::isEmpty($accessList)) {
        return false;
    }

    $email = $this->getEmail($mobile);
    foreach ($accessList as $access) {
        if (isset($access['email']) && 0 === strcasecmp((string) $access['email'], $email)) {
            return true;
        }
    }

    return false;
}
```

---

## 4. `DashboardServiceImpl::grantUserSpace()` —— 只有回查通过才置 `is_auth`

### 现状

```php
public function grantUserSpace(Employee $employee, Dashboard $dashboardInfo): bool
{
    $result = $this->lightDashClientService->grantUserSpace($employee->getMobile(), $dashboardInfo->getSpaceUuid());
    if (true === $result) {
        $this->employeeRoleRepository->updateAuth($employee->getId(), $dashboardInfo->getId());
    }

    return $result;
}
```

### 改为

```php
public function grantUserSpace(Employee $employee, Dashboard $dashboardInfo): bool
{
    $spaceUuid = $dashboardInfo->getSpaceUuid();

    try {
        $result = $this->lightDashClientService->grantUserSpace($employee->getMobile(), $spaceUuid);
    } catch (\Throwable $e) {
        // 单条异常不允许冒泡，否则会中断整个 foreach，同批后面全部不授权
        $this->logger->error('grantUserSpaceException', [
            'employee_id'  => $employee->getId(),
            'dashboard_id' => $dashboardInfo->getId(),
            'space_uuid'   => $spaceUuid,
            'message'      => $e->getMessage(),
        ]);

        return false;
    }

    if (true !== $result) {
        return false;                          // 失败绝不推进 is_auth
    }

    $this->employeeRoleRepository->updateAuth($employee->getId(), $dashboardInfo->getId(), $spaceUuid);

    return true;
}
```

---

## 5. `updateAuth()` —— 记住「授权到哪个空间」

现在只有一个「是/否」标记，没记授权时用的是哪个空间。看板换空间之后，标记就永远对不上了。

### 先加一列

```sql
ALTER TABLE report_dashboard_employee_role
    ADD COLUMN auth_space_uuid VARCHAR(64) NULL AFTER is_auth;
```

### 再改方法

```php
// DashboardEmployeeRoleRepositoryImpl.php
public function updateAuth(int $employeeId, int $dashboardId, string $spaceUuid): void
{
    $criteria = Criteria::create([
        'employee_id'  => $employeeId,
        'dashboard_id' => $dashboardId,
    ]);
    $this->updateBy($criteria, [
        'is_auth'         => 1,
        'auth_space_uuid' => $spaceUuid,
    ]);
}
```

接口 `DashboardEmployeeRoleRepository.php` 同步加参数：

```php
public function updateAuth(int $employeeId, int $dashboardId, string $spaceUuid): void;
```

「已授权」的定义从此变成可以随时重算的：

```sql
is_auth = 1 AND auth_space_uuid = report_dashboard.space_uuid
```

---

## 6. `saveDashboardEmployeeRole()` —— 消费返回值

### 现状

```php
if (Arrays::isNotEmpty($addDashboardIds)) {
    $this->createLightDashUserWithRetry($employee, $addDashboardIds);   // 返回值丢弃
    foreach ($addDashboardIds as $dashboardId) {
        $dashboardInfo = $dashboardList[$dashboardId];
        if (null === $dashboardInfo) { continue; }
        $this->grantUserSpace($employee, $dashboardInfo);               // 返回值丢弃
    }
}
```

### 改为

```php
if (Arrays::isNotEmpty($addDashboardIds)) {
    $this->createLightDashUserWithRetry($employee, $addDashboardIds);

    $failedIds = [];
    foreach ($addDashboardIds as $dashboardId) {
        /** @var Dashboard|null $dashboardInfo */
        $dashboardInfo = $dashboardList[$dashboardId] ?? null;
        if (null === $dashboardInfo) {
            $this->logger->error('Add dashboardInfo is empty dashboardId ='.$dashboardId);
            continue;
        }
        if (!$this->grantUserSpace($employee, $dashboardInfo)) {
            $failedIds[] = $dashboardId;
        }
    }

    if (Arrays::isNotEmpty($failedIds)) {
        $this->saveOperatorLog(
            'lightdash',
            'grant-space-fail',
            (string) $employee->getId(),
            [
                'mobile'               => $employee->getMobile(),
                'failed_dashboard_ids' => array_values($failedIds),
            ],
            $employee->getCreateBy() ?? 'admin-job',
            sprintf('Lightdash空间授权失败(mobile:%s)', $employee->getMobile())
        );
    }
}
```

---

## 7. `createLightDashUser()` —— 早退改查事实

### 现状

```php
$userInfo = $this->findUserByMobile($mobile);
if (Arrays::isNotEmpty($userInfo) && true === $userInfo['is_auth_project']) {
    return $userInfo;                              // 只看标记，不看事实
}
$result = $this->request('POST', 'invite-links', $data);
if ('ok' === $result['status'] || 400 === $result['httpCode']) {
    $this->createOpenId($mobile, $userName);       // 返回值丢弃
    $this->grantUserProject($mobile);              // 返回值丢弃 ← 失败也没人知道
    return $userInfo ?? $result['results'];
}
return [];
```

### 改为

```php
$userInfo = $this->findUserByMobile($mobile);

// 早退只看事实：真的在 project_memberships 里才跳过
if (
    Arrays::isNotEmpty($userInfo)
    && !empty($userInfo['user_id'])
    && $this->isProjectMember((int) $userInfo['user_id'])
) {
    return $userInfo;
}

$result = $this->request('POST', 'invite-links', [
    'email'     => $email,
    'role'      => 'member',
    'expiresAt' => date('Y-m-d\TH:i:s\Z', time() + 3 * 86400),
]);

// 200 = 建号成功；400 = 邮箱已存在（预期语义，继续走授权）
if (!$this->isSuccess($result, [400])) {
    $this->logger->error('createLightDashUser: invite-links 失败', [
        'mobile'   => $mobile,
        'httpCode' => $result['httpCode'] ?? 0,
    ]);

    return [];
}

$this->createOpenId($mobile, $userName);

// 项目授权失败必须中断，不能继续标「已授权」
if (!$this->grantUserProject($mobile)) {
    $this->logger->error('createLightDashUser: 项目授权失败', [
        'mobile' => $mobile,
    ]);

    return [];
}

return $userInfo ?? ($result['results'] ?? []);
```

---

## 8. 新增 `isProjectMember()`

```php
private function isProjectMember(int $userId): bool
{
    $project = $this->queryBuilder->from($this->getTableName('projects'))
        ->select('project_id')
        ->where('project_uuid = ?', $this->projectUuid)
        ->query()
        ->fetch(\PDO::FETCH_ASSOC);

    if (empty($project)) {
        return false;
    }

    $row = $this->queryBuilder->from($this->getTableName('project_memberships'))
        ->select('user_id')
        ->where('project_id = ?', $project['project_id'])
        ->where('user_id = ?', $userId)
        ->query()
        ->fetch(\PDO::FETCH_ASSOC);

    return !empty($row);
}
```

---

## 9. `grantUserProject()` —— 统一判断 + 失败留痕

```php
public function grantUserProject(string $mobile): bool
{
    $email = $this->getEmail($mobile);

    $response = $this->request(
        'POST',
        sprintf('projects/%s/access', $this->projectUuid),
        [
            'email'     => $email,
            'role'      => self::DEFAULT_PROJECT_ROLE,
            'sendEmail' => false,
        ]
    );

    // 200 = 新加成功；409 = 已经是成员（幂等，也算成功）
    if ($this->isSuccess($response, [409])) {
        return true;
    }

    $this->logger->error('grantUserProjectFailed', [
        'mobile'   => $mobile,
        'email'    => $email,
        'httpCode' => (int) ($response['httpCode'] ?? 0),
        'message'  => $response['message'] ?? $response['error'] ?? '',
    ]);

    return false;
}
```

> 404 表示「这个邮箱不在组织里」，是最该告警的一种，日志里会单独看到 `httpCode: 404`。

---

## 10. `createOpenId()` —— 删掉影子列写入

```php
// 现有（第 351 行附近），把 is_auth_project=true 去掉
$updateUserSql = 'UPDATE '.$userTable.' set first_name=:first_name, last_name=:last_name, is_setup_complete=true, is_active=true, is_auth_project=true where user_id=:user_id';
```

改为：

```php
$updateUserSql = 'UPDATE '.$userTable.' set first_name=:first_name, last_name=:last_name, is_setup_complete=true, is_active=true where user_id=:user_id';
```

理由：`is_auth_project` 不是 Lightdash 的字段（本仓所有 migration 里都没有），而且它在授权**之前**就被置位，导致「走过流程」被当成「已授权」。早退条件已经在第 7 步改成查 `project_memberships`，这个字段可以彻底不用。

---

## 11. `removeUserLightSpace()` —— 404 也算成功

```php
$result = $this->request('DELETE', $uri);

// 404 = 本来就没有这条授权，等同于撤销成功
if ($this->isSuccess($result, [404])) {
    return true;
}

$this->logger->error('removeUserLightSpaceFailed', [
    'mobile'    => $mobile,
    'spaceUuid' => $spaceParentUuid,
    'httpCode'  => (int) ($result['httpCode'] ?? 0),
]);

return false;
```

顺带把 `removeUserSpace()` 的本地短路去掉：

```php
public function removeUserSpace(int $employeeId, string $mobile, string $spaceUuid): bool
{
    // 原来：本地计数命中就 return true，连接口都不调，导致该撤的权限一直残留
    return $this->removeUserLightSpace($mobile, $spaceUuid);
}
```

---

## 12. `light-dash-space-change` 命令 —— 失败要回滚快照

这是最关键的一处顺序问题。现在的做法是**先改快照、再授权**，授权失败也不回滚：

```php
if ($spaceUuid !== $dashboardInfo->getSpaceUuid()) {
    $dashboardInfo->setSpaceUuid($spaceUuid);
    $dashboardMapper[$dashboardInfo->getId()] = $spaceUuid;
    $this->dashboardRepository->update($dashboardInfo);   // ← 快照当场就变了
    continue;
}
```

后果：下一次运行 `$spaceUuid === getSpaceUuid()`，**「空间变了」这个信号已经用掉了**，再也不会触发重试。

### 改法（最小改动）

第一个循环里把旧值存下来：

```php
$oldSpaceMap = [];   // 新增

foreach ($dashboardList as $dashboardInfo) {
    $currentSpace = $dashboardSpaceList[$dashboardInfo->getDashboardUuid()] ?? [];
    if (Arrays::isEmpty($currentSpace)) {
        $this->writeln('Error: dashboardUuid:'.$dashboardInfo->getDashboardUuid().' is not found');
        continue;
    }

    $spaceUuid = Text::isNotEmpty($currentSpace['parent_space_uuid'])
        ? $currentSpace['parent_space_uuid']
        : $currentSpace['space_uuid'];

    if ($spaceUuid !== $dashboardInfo->getSpaceUuid()) {
        $oldSpaceMap[$dashboardInfo->getId()] = $dashboardInfo->getSpaceUuid();   // 记旧值

        $dashboardInfo->setSpaceUuid($spaceUuid);
        $dashboardMapper[$dashboardInfo->getId()] = $spaceUuid;
        $dashboardInfo->setDashboardName($currentSpace['dashboard_name']);
        $this->dashboardRepository->update($dashboardInfo);
        continue;
    }
    // ... 名字变化的分支保持原样
}
```

授权循环里，失败就还原快照：

```php
foreach ($employeeRoleList as $employeeRole) {
    // ... 原有取值逻辑

    $result = $this->dashboardService->grantUserSpace($employeeInfo, $dashBoardInfo);

    if (!$result && isset($oldSpaceMap[$dashBoardInfo->getId()])) {
        // 授权失败 → 把快照还原，保证下次跑还能检测到「空间变了」并重试
        $dashBoardInfo->setSpaceUuid($oldSpaceMap[$dashBoardInfo->getId()]);
        $this->dashboardRepository->update($dashBoardInfo);
    }

    $this->writeln(sprintf(
        'mobile = %s, spaceUuid = %s, employeeId = %d, result = %s',
        $employeeInfo->getMobile(),
        $dashBoardInfo->getSpaceUuid(),
        $employeeInfo->getId(),
        $result ? 'success' : 'failed'
    ));
}
```

### 筛选条件也要改

原来的 `is_auth = 0` 无法表达「授权空间已经过期」，配合新的 `auth_space_uuid` 列：

```php
// 原来
$criteria = Criteria::create(['is_auth' => 0]);

// 改为：没授权过，或者授权时的空间和看板现在的空间对不上
$criteria = Criteria::create()->whereRaw(
    'is_auth = 0 OR auth_space_uuid IS NULL OR auth_space_uuid <> ('
    .'SELECT d.space_uuid FROM report_dashboard d WHERE d.id = report_dashboard_employee_role.dashboard_id'
    .')'
);
```

---

## 上线顺序

1. **先加列 + 改 `updateAuth()`**（第 5 步）——不改变行为，只是多记一列
2. **再改判断与回查**（第 1–4、9、11 步）——从这之后「假成功」会变成「失败」
3. **再改消费与留痕**（第 6–8 步）——失败开始出现在操作日志里
4. **最后改命令**（第 12 步）——补偿链路闭环

前两步可以先行，即使后续步骤没做完也不会比现在更差。

---

## 验证

1. 把某员工的 `is_auth` 改回 0，等自动任务跑（或手动触发命令），确认输出 `result = success`
2. 查库确认真的落库：

   ```sql
   SELECT sua.space_uuid, s.name, sua.space_role
   FROM space_user_access sua
   LEFT JOIN spaces s ON s.space_uuid = sua.space_uuid
   JOIN emails e ON e.user_id = sua.user_id
   WHERE e.email = '手机号@公司域名';
   ```

3. **反向验证**（最重要）：故意传一个不存在的空间 ID，确认三件事同时成立
   - 操作日志出现 `grant-space-fail`
   - `is_auth` 仍然是 `0`
   - 日志里有 `grantUserSpaceFailed` 且 `httpCode: 404`

---

## 附：为什么这么改（改前 / 改后）

| 场景 | 改前判定 | 改后判定 |
|---|---|---|
| 正常授权 | 成功 | 成功 |
| 空间不存在（404） | 失败 | 失败（带 404 日志） |
| 调用方权限不足（403） | 失败 | 失败（带 403 日志） |
| **授权到旧快照空间** | **成功 → 打勾** | **回查失败 → 不打勾** |
| **授权给了另一个人** | **成功 → 打勾** | **回查失败 → 不打勾** |
| **响应体含 ok 但状态码异常** | **成功 → 打勾** | **失败** |
| **撤销时本地命中** | 直接返回成功，不调接口 | 照常调接口 |
| **看板换空间后授权失败** | 快照已更新，不再重试 | 快照回滚，下次重试 |

核心就一句：**把「服务器没报错」换成「这个人真的在访问列表里」。**
