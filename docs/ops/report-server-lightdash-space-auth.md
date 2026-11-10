# 空间授权：最小改动方案（PHP）

**状态：待开发**

> 现象：员工被分配了看板，`report_dashboard_employee_role.is_auth = 1`（系统认为已授权），但 Lightdash 里没有他的空间权限，而且永远不会再重试。
>
> 结论：只需要改 **一个方法 + 加一个方法**，约 30 行。

---

## 一、问题在哪

`LightDashClientServiceImpl::grantUserSpace()` 最后一行：

```php
return 'ok' === $result['status'];
```

只看响应体里有没有 `"status":"ok"`，然后：

- 不校验 HTTP 状态码
- 写完不回查，不知道到底有没有授权成功
- 而 Lightdash 的共享接口**只要空间存在就返回成功**，不校验授给了谁、授到哪个空间

于是「服务器没报错」被当成了「权限已生效」。上层拿到 `true` 就把 `is_auth` 置 1，而 `is_auth = 1` 正好是每 2 小时补偿任务（`light-dash-space-change`）的**排除条件** —— 从此再也不会重试。

---

## 二、改哪里

只改一个文件：`src/service/LightDashClientServiceImpl.php`

### 改前

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

    return 'ok' === $result['status'];        // ← 问题在这
}
```

### 改后

```php
public function grantUserSpace(string $mobile, string $spaceUuid): bool
{
    $userInfo = $this->findUserByMobile($mobile);
    Assert::notNull($userInfo['user_uuid'], '用户UUID不能为空 mobile='.$mobile);

    $currentSpaceUuid = $this->getCurrentSpaceUuid($spaceUuid);
    $shareUri = sprintf('projects/%s/spaces/%s/share', $this->projectUuid, $currentSpaceUuid);
    $organizateionMember = $this->getOrganizateionMember($userInfo['user_id']);
    $spaceRequest = [
        'userUuid' => $userInfo['user_uuid'],
        'spaceRole' => in_array($organizateionMember['role'], ['developer', 'admin'], true) ? 'editor' : 'viewer',
    ];

    $result = $this->request('POST', $shareUri, $spaceRequest);
    $httpCode = (int) ($result['httpCode'] ?? 0);

    // ① 状态码不是 200，就是失败
    if (200 !== $httpCode) {
        $this->logger->error('grantUserSpaceFailed', [
            'mobile'    => $mobile,
            'spaceUuid' => $currentSpaceUuid,
            'httpCode'  => $httpCode,
            'message'   => $result['message'] ?? ($result['error'] ?? ''),
        ]);

        return false;
    }

    // ② 写完查库：这条直接授权记录到底在不在
    if (!$this->hasDirectSpaceAccess($userInfo['user_uuid'], $currentSpaceUuid)) {
        $this->logger->error('grantUserSpaceVerifyFailed', [
            'mobile'    => $mobile,
            'spaceUuid' => $currentSpaceUuid,
        ]);

        return false;
    }

    return true;
}

/**
 * 查库确认直接授权存在。
 * 不用 API 返回的 access 列表，因为它含继承权限（公开空间全员、管理员都会出现在里面）。
 */
private function hasDirectSpaceAccess(string $userUuid, string $spaceUuid): bool
{
    $row = $this->queryBuilder
        ->from($this->getTableName('space_user_access'))
        ->select('user_uuid')
        ->where('space_uuid = ?', $spaceUuid)
        ->where('user_uuid = ?', $userUuid)
        ->query()
        ->fetch(\PDO::FETCH_ASSOC);

    return !empty($row);
}
```

就这些。

---

## 三、为什么这样就够了

改完之后：

| 情况 | 返回 | `is_auth` | 之后会怎样 |
|---|---|---|---|
| 真的授权成功 | true | 1 | 正常，不再重试 |
| 403 / 404 / 超时 | false | 0 | **2 小时内的补偿任务自动重试** |
| 返回 200 但库里没有记录 | false | 0 | 同上，并留下 `grantUserSpaceVerifyFailed` 日志 |

关键是**失败的记录 `is_auth` 会留在 0**，而补偿任务的条件就是 `is_auth = 0` —— 系统从此会自己重试，不需要人工发现。

**原来的问题不是「没有重试机制」，而是「失败也被标记成成功，绕过了重试机制」。**

---

## 四、上线后怎么验证

1. 找一个失败的员工，手动 `UPDATE report_dashboard_employee_role SET is_auth = 0`，等补偿任务跑（或手动执行 `light-dash-space-change`），看输出是不是 `result = success`
2. 查库确认：

   ```sql
   SELECT sua.space_uuid, s.name, sua.space_role
   FROM space_user_access sua
   LEFT JOIN spaces s ON s.space_uuid = sua.space_uuid
   JOIN emails e ON e.user_id = sua.user_id
   WHERE e.email = '手机号@公司域名';
   ```

3. 看日志有没有 `grantUserSpaceFailed` / `grantUserSpaceVerifyFailed` —— 有就说明判断生效了，`httpCode` 和 `message` 会直接指出原因（403 权限不足 / 404 空间不存在）

---

## 五、以后可以再补的（这次不急）

按重要性排，都不影响上面这条立即生效：

| 改动 | 解决什么 |
|---|---|
| `grantUserProject()` 同样加状态码判断 + 失败日志 | 项目授权失败现在也是静默的 |
| `grantUserSpace()` 的 `spaceRole` 固定 `viewer` | 现在按组织角色推断，与建号时把 viewer 提成 member 的口径冲突 |
| 加一列 `auth_space_uuid`，记录授权时的空间 | 看板换空间后 `is_auth` 仍是 1，不会触发重试（另一个隐藏问题） |
| `light-dash-space-change` 授权失败时回滚看板空间快照 | 现在先改快照再授权，失败后「空间变了」这个信号就丢了 |
| `createOpenId()` 里删掉 `is_auth_project` | 影子列不在 migration 里，重建库会 SQL 报错 |

---

## 六、一句话

> 把 `grantUserSpace()` 的成功判断从「响应体里有 ok」换成「HTTP 200 + 库里有这条记录」，失败就返回 false、不打 `is_auth` 标记，让现有的 2 小时补偿任务去重试。
