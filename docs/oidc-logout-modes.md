# OIDC 登录/退出三种方式说明（Lightdash x Banmahui）

## 1. 背景

当前 Lightdash 使用 OIDC 接入外部 IdP（brandct / banmahui）。
在“退出账号”场景里，容易出现：

- 本地已退出，但 IdP 会话还在
- 回到登录页后被静默重新登录旧账号

因此我们区分 3 种方式来处理不同诉求。

## 2. 三种方式总览

| 方式 | 目标 | 是否清 Lightdash 本地会话 | 是否清 IdP 会话 | 典型入口 |
|---|---|---:|---:|---|
| 方式A：本地退出（原有） | 普通退出 | 是 | 否 | `/api/v1/logout` |
| 方式B：强制重登（reauthenticate） | 切换账号时强制重新认证 | 可选（通常先本地退出） | 否 | `/login?reauthenticate=true` |
| 方式C：联邦退出（federated） | 真正退出（本地 + IdP） | 是 | 是（若 IdP 支持） | `/api/v1/logout/federated` |

## 3. 方式A：本地退出（原有模式）

### 适用场景

- 普通退出
- 不关心 IdP 是否保留登录态

### 接口

- `GET /api/v1/logout`

### 行为

1. `req.logout + session.destroy`
2. 返回 JSON（`{ status: 'ok' }`）

### 风险

- IdP 会话仍在，重新访问登录链路可能被静默登录回旧账号。

## 4. 方式B：强制重登（reauthenticate）

### 适用场景

- 需要“切换账号”，但暂不做联邦退出
- 希望本次登录强制重新认证

### 入口

- `/login?reauthenticate=true`
- 最终会进入：
  - `/api/v1/login/oidc?...&reauthenticate=true`

### 参数映射

- `reauthenticate=true` -> OIDC authorize 参数 `prompt=login`

### 实际抓包案例（prompt）

参考 `testings/11.txt`，可看到以下链路：

1. 先进入：
   - `/api/v1/login/oidc?...&reauthenticate=true`
2. 随后跳转到 IdP 授权地址，URL 上出现：
   - `.../oauth/authorize?...&prompt=login`

这说明 `reauthenticate=true` 已正确映射并透传为 OIDC 的 `prompt=login`。

### 构造示例

```text
/login?reauthenticate=true
/api/v1/login/oidc?redirect=<urlEncode后的站内路径>&reauthenticate=true
```

### 说明

- `prompt=login` 是“本次请求强制登录”，不是“彻底登出 IdP”。

## 5. 方式C：联邦退出（federated，推荐）

### 适用场景

- 要求“真正退出”
- 避免退出后自动回旧账号

### 入口

- `GET /api/v1/logout/federated`
- 可选参数：`redirect`（退出后回跳地址）

### 行为

1. 先清 Lightdash 本地会话
2. 读取 OIDC metadata 的 `end_session_endpoint`
3. 302 跳转到 IdP logout
4. 带 `post_logout_redirect_uri`（回站点登录页）
5. 如不支持 `end_session_endpoint`，降级到本地 `/login?reauthenticate=true`

### IdP 跳转参数（核心）

- `post_logout_redirect_uri`
- `client_id`（按当前实现已携带）

### 预发环境实际链接

- `https://brand.pre.banmahui.cn/oidc/logout?post_logout_redirect_uri=https%3A%2F%2Fx.pre.banmahui.cn%2Flogin%3Freauthenticate%3Dtrue&client_id=1wg51es76r`

### 实际抓包案例（联邦退出重定向）

退出后会出现以下重定向目标（IdP logout）：

```text
https://brand.pre.banmahui.cn/oidc/logout?post_logout_redirect_uri=https%3A%2F%2Fx.pre.banmahui.cn%2Flogin%3Freauthenticate%3Dtrue&client_id=1wg51es76r
```

该链接返回后再回到 `post_logout_redirect_uri`，继续进入站点登录页。

## 6. 构造参数模板（可复用）

### A) 强制重登（方式B）

```text
/login?reauthenticate=true
```

如果从后端 OIDC 登录入口发起：

```text
/api/v1/login/oidc?redirect=<ENCODED_REDIRECT>&reauthenticate=true
```

### B) 联邦退出（方式C）

后端跳 IdP 时：

```text
<end_session_endpoint>?post_logout_redirect_uri=<ENCODED_REDIRECT>&client_id=<OIDC_CLIENT_ID>
```

预发示例：

```text
https://brand.pre.banmahui.cn/oidc/logout?post_logout_redirect_uri=https%3A%2F%2Fx.pre.banmahui.cn%2Flogin%3Freauthenticate%3Dtrue&client_id=1wg51es76r
```

生产可类推：

```text
https://brandct.com/oidc/logout?post_logout_redirect_uri=https%3A%2F%2Fx.brandct.com%2Flogin%3Freauthenticate%3Dtrue&client_id=51rvt5g0c4
```

## 7. 推荐策略

- 默认退出按钮：走方式C（federated）
- 切换账号兜底：保留方式B（reauthenticate）
- 老接口兼容：`/api/v1/logout` 继续保留给历史调用

## 8. 排查清单

1. 是否命中 `/api/v1/logout/federated`
2. 是否 302 到 `end_session_endpoint`
3. IdP logout 返回后是否回到 `/login?reauthenticate=true`
4. 若仍自动登录：
   - 检查 IdP 是否真正清理会话
   - 检查是否有上游企业 SSO 自动放行策略
