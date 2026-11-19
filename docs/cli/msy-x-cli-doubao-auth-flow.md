# msy-x-cli × 豆包：授权链路修复（弹门户页 → 弹授权页）

> 状态：**代码已提交（report-web-server `feat/oidc-scan-login`），待预发验证与合并**
> 关联：`docs/cli/msy-x-cli-design.md` §10（豆包 CLI 连接器契约）、`docs/cli/msy-x-cli-usage.md`
> 涉及仓库：`report-web-server`（3 处改动）｜`msy-x-cli` 与 Lightdash 均**零改动**

---

## 1. 问题（豆包审核打回）

审核意见（胡光齐）：

> 您提交的 cli 插件我点击链接后没有弹到 OAuth 登录界面，而是弹到你们的官网，不符合 OAuth 登录鉴权的流程……正确的流程请参考线上的 "tapnow"，安装完成后应该弹出的是授权页而非门户页，授权页授权完成后会回调到豆包客户端完成鉴权。

用户在豆包客户端点「立即连接」后，浏览器打开的是**官网首页**（`brandct.com` 的推广页），而不是授权页；链路在这里断掉，扫码登录也不会自动回到授权端点。

> `tapnow` 是豆包里已上架的第三方连接器，被作为"正确范式"引用。其具体页面形态**未核实**（无外网资料、无录屏），本文只对齐评审给出的判定标准：*落地页是授权页 + 能回到客户端完成鉴权*。

---

## 2. 现状链路实测（2026-11-19，生产）

CLI 侧 `msy-x auth login` 打开的是 `https://x.brandct.com/api/v1/oauth/authorize?...`，之后：

```
GET https://x.brandct.com/api/v1/oauth/authorize?...        # 未登录
  → 302 /login?redirect=<authorize 路径>                     # Lightdash oauthRouter
  → 前端 LoginLanding：AUTH_OIDC_CLIENT_FORCE_REDIRECT=true
  → https://brandct.com/oauth/authorize?...                  # 官网 OIDC 授权端点（无 /oidc 前缀）
  → 302 /login/                                              # ← 授权参数在这一步全部丢失
  → 302 https://brandct.com/                                 # ← LoginPageStrategy 兜底到官网首页
```

curl 复核（未登录）：

```bash
# 授权端点未登录 → /login/（注意：/oidc/oauth/authorize 是 404，路径没有 /oidc 前缀）
curl -sS -D - -o /dev/null "https://brandct.com/oauth/authorize?response_type=code&client_id=51rvt5g0c4&redirect_uri=https%3A%2F%2Fx.brandct.com%2Flogin&scope=openid"
# HTTP/2 302 ; location: /login/

# 带 redirect 走 LoginPageStrategy 也保不住
curl -sS -D - -o /dev/null "https://brandct.com/login/?redirect=%2Foauth%2Fauthorize%3Fstate%3Dtest"
# HTTP/2 302 ; location: https://brandct.com      ← redirect 被丢弃
```

**根因**：`/oauth/authorize` 不在 omniauth 的 `allow_pattern` 里，未登录请求被 `OminauthMiddleware` 拦到 `/login/`，而 `LoginPageStrategy` 对桌面浏览器直接 `redirect(BRANDCT_URL)`——`client_id` / `state` / `redirect_uri` 三件套在这一步丢光，登录完也回不到授权端点。

---

## 3. 已验证可用的扫码链路

`/wx` 本身是通的（无需自建登录页）：

```bash
curl -sS -D - -o /dev/null "https://brandct.com/wx?redirect=%2Foauth%2Fauthorize%3Fstate%3Dtest"
# 302 → https://login.banmahui.cn/auth/wx_pub/login?appid=wx26366d07b360130d&redirect_uri=https%3A%2F%2Fbrandct.com%2Fwx%2Fverify
```

扫码后：登录中心 → `https://brandct.com/wx/verify`（omniauth 建会话）→ **按 session 里存的 redirect 回到 `/oauth/authorize`** → 已登录 → `completeAuthorizationRequest`（自动 approve）→ 回 `redirect_uri`（Lightdash）。

人工验证（2026-11-19，地址栏直粘以避开 referer 白名单）：

```
https://brandct.com/wx?redirect=%2Foauth%2Fauthorize%3Fresponse_type%3Dcode%26client_id%3D51rvt5g0c4%26redirect_uri%3Dhttps%253A%252F%252Fx.brandct.com%252Flogin%26scope%3Dopenid%26state%3Dtest123
```

结果：扫码 → 回到 `/oauth/authorize` → 自动放行 → 落到 `https://x.brandct.com/projects/<uuid>/home`（即 Lightdash 已登录）。**结论：vendor 会按 session 里的 redirect 回跳，不需要自建中间件。**

唯一坑：真实链路里 referer 是 `https://x.brandct.com/...`，命中 `login_redirect_domain_whitelist`（含 `x.brandct.com`）→ `ProviderStrategy` 里 `$isBreak = true` → redirect **不写 session**。所以必须加一个显式门闩。

---

## 4. 修复（report-web-server，分支 `feat/oidc-scan-login`）

### 4.1 `src/config.php` — 放行 `/oauth/`

```diff
-            'allow_pattern' => '#^/(api|oidc)/#',
+            'allow_pattern' => '#^/(api|oidc|oauth)/#',
```

`/oauth/` 下只有 `GET /oauth/authorize` 一个路由（全仓 grep 确认），放行面最小；未登录由控制器自己处理。

### 4.2 `src/application/controller/OidcAuthorizeController.php` — 未登录直达扫码

```php
if (!Omniauth::get($this->getRequest())?->isAuthenticated()) {
    $uri = $this->getRequest()->getUri();
    $query = $uri->getQuery();
    $target = $uri->getPath().(Text::isNotEmpty($query) ? '?'.$query : '');
    $this->logger->info(static::TAG.'authorize without login, redirect to wx login', ['target' => $target]);
    // oidc=1 让 ProviderStrategy 忽略来源域名白名单，仍把 redirect 写进 session
    $this->redirect('/wx?oidc=1&redirect='.rawurlencode($target));
}
```

放在 `validateAuthorizationRequest()` **之前**：guest 不该先建授权请求，也不该走到 `getUser()`。`redirect()` 抛 `RedirectException`，由 middleware 转 302，与文件原有写法同机制。

### 4.3 `src/infrastructure/web/ProviderStrategy.php` — 门闩

```php
$forceStoreRedirect = '1' === ($this->getRequest()->getQueryParams()['oidc'] ?? '');
...
if (!str_starts_with($redirectUri, '/bind/aihouge')
    && !str_starts_with($redirectUri, '/ai/chat-dasheng')
    && (false === $isBreak || $forceStoreRedirect)) {
```

只对带 `oidc=1` 的请求放宽白名单，其余入口（官网首页「登录」、小程序、企业微信、品牌后台、报告页）代码路径不变。

### 4.4 修复后的完整链路

```
msy-x auth login
  → https://x.brandct.com/api/v1/oauth/authorize?...            # 未登录
  → 302 /login?redirect=…
  → OIDC 强制跳转 https://brandct.com/oauth/authorize?…
  → 302 /wx?oidc=1&redirect=%2Foauth%2Fauthorize%3F…
  → 微信扫码（login.banmahui.cn）
  → https://brandct.com/wx/verify → session 建会话
  → 回 /oauth/authorize?… → 自动 approve → 回 Lightdash OIDC callback
  → Lightdash 会话建立 → 回 /api/v1/oauth/authorize?…
  → 【授权页】马上赢 X 平台请求访问 + 允许/拒绝        ← 评审要的"授权页"
  → 允许 → 回调 http://127.0.0.1:<port>/callback?code=…
  → CLI 换 token 落 ~/.config/msy-x/config.yaml
  → 豆包轮询 msy-x auth status，命中 "logged_in":true
```

---

## 5. 影响面与回归清单

| 改动 | 命中条件 | 不影响 |
|---|---|---|
| `allow_pattern` 加 `oauth` | 仅 `/oauth/*` | `/api/*`、`/oidc/*` 与所有页面路径 |
| 未登录分支 | 仅"未登录 + `/oauth/authorize`" | 已登录用户（走原有自动 approve）；`mobile not bind` / `no permission` 两个分支未动 |
| `ProviderStrategy` 门闩 | 仅带 `oidc=1` 的 `/wx`、`/work_wx` | 全仓（含 website-fe）无任何地方传 `oidc` 参数，现有登录入口零影响 |

必须回归的入口（预发）：

1. 官网首页未登录点「登录」→ 弹窗二维码 / 手机号 / 邮箱三种方式，扫码后落地页与今天一致
2. `x.pre.banmahui.cn` 普通网页登录（非 CLI）
3. 企业微信 / 微信内置浏览器内打开报告页（`/login` → `/wx`、`/work_wx` 分支）
4. `/bind/aihouge`、`/ai/chat-dasheng` 这两个被排除的 redirect 目标仍不被覆盖

残留风险：

- `/oauth/authorize` 是否还有 Lightdash 以外的 OIDC client（DB `oauth_clients` 待确认）；它们未登录时会看到扫码页而非官网首页
- 以后往 `/oauth/*` 加新路由时，`allow_pattern` 已放行，新路由必须自己处理未登录

---

## 6. 上线与回滚

- 部署：`report-web-server` 合并 `feat/oidc-scan-login` → Jenkins 构建（`composer82 lint && composer82 test` 会自动跑；本地没有 PHP/vendor，未能预热这两项）
- 回滚：把 `allow_pattern` 里的 `oauth|` 去掉即可回到今天的行为（一处字符串），另外两处随之失效
- 兜底：若某天 `/wx` 不可用，`/oauth/authorize` 会 302 到无效页；届时把 4.2 的分支改回 `LoginPageStrategy` 语义（跳 `BRANDCT_URL`）即恢复旧行为

## 7. 验收（一次即可）

```bash
# 1. 未登录链路：浏览器应直接出微信二维码，不再出现官网首页
msy-x auth login

# 2. 扫码确认 → 应停在 x.brandct.com 的授权页（应用名 + scope + 允许/拒绝）

# 3. 点「允许」→ 终端输出，且 logged_in 为首键
msy-x auth status      # {"logged_in":true,...}
```

对照：`--qr` 设备码登录、`--token <pat>` PAT 登录、`--no-browser` 打印授权 URL 三条路径均不受本次改动影响。

---

## 8. 待办

- [ ] 预发环境跑完第 5 节 4 条回归 + 第 7 节验收
- [ ] 确认 `oauth_clients` 里是否只有 Lightdash（prod / pre）
- [ ] 拿到 tapnow 的流程说明或录屏后，核对"回调到豆包客户端"是否需要改成 `doubao://` 深链（当前 CLI 连接器模型下不存在该回调，等价物是 `127.0.0.1` 回环 + 平台 `status` 轮询，需向评审说明）
- [ ] 插件包（`packages/x-doubao-plugin`）重新打包提交审核
