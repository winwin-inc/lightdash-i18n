# msy-x-cli × 豆包：授权链路修复（弹门户页 → 弹授权页）

> 状态：**代码已提交，待预发验证与合并**
> 关联：`docs/cli/msy-x-cli-design.md` §10（豆包 CLI 连接器契约）、`docs/cli/msy-x-cli-usage.md`
> 涉及仓库：`report-web-server`（4 处）、`website-fe`（1 处）｜`msy-x-cli` 与 Lightdash **零改动**

---

## 1. 问题（豆包审核打回）

审核意见（胡光齐）：

> 您提交的 cli 插件我点击链接后没有弹到 OAuth 登录界面，而是弹到你们的官网，不符合 OAuth 登录鉴权的流程……正确的流程请参考线上的 "tapnow"，安装完成后应该弹出的是授权页而非门户页，授权页授权完成后会回调到豆包客户端完成鉴权。

用户在豆包客户端点「立即连接」后，浏览器打开的是**官网首页**（`brandct.com` 的推广页），而不是授权页；链路在这里断掉，登录完成也不会回到授权端点。

> `tapnow` 是豆包里已上架的第三方连接器，被评审当作"正确范式"引用。其页面形态**未核实**（无外网资料、无录屏）；本文只对齐评审给出的判定标准：*落地页是授权页 + 能回到客户端完成鉴权*。

---

## 2. 现状链路实测（2026-11-19，生产）

CLI 侧 `msy-x auth login` 打开 `https://x.brandct.com/api/v1/oauth/authorize?...`，之后：

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
# 授权端点的真实路径是 /oauth/authorize（/oidc/oauth/authorize 是 404）
curl -sS -D - -o /dev/null "https://brandct.com/oauth/authorize?response_type=code&client_id=51rvt5g0c4&redirect_uri=https%3A%2F%2Fx.brandct.com%2Flogin&scope=openid"
# HTTP/2 302 ; location: /login/

# 带 redirect 走 LoginPageStrategy 也保不住
curl -sS -D - -o /dev/null "https://brandct.com/login/?redirect=%2Foauth%2Fauthorize%3Fstate%3Dtest"
# HTTP/2 302 ; location: https://brandct.com      ← redirect 被丢弃
```

**根因**：`/oauth/authorize` 不在 omniauth 的 `allow_pattern` 里，未登录请求被 `OminauthMiddleware` 拦到 `/login/`，而 `LoginPageStrategy` 对桌面浏览器直接 `redirect(BRANDCT_URL)`——`client_id` / `state` / `redirect_uri` 三件套在这一步丢光。

---

## 3. 方案选择

| 候选 | 结论 |
|---|---|
| A. 未登录直接 302 `/wx?redirect=<authorize>` | **否决**：客户还有手机号/邮箱登录需求，不能压到只有微信扫码的页面上；且依赖 `ProviderStrategy` 里的 referer 白名单改造（共享代码，风险大） |
| B. 自建中间件接住登录落点 | 近似可行，但 session 访问 API 在 middleware 层不确定，改用控制器钩子更稳 |
| C. **未登录跳官网首页 `?autoLogin=1`，由首页自己拉起登录；授权目标存 session，登录落点再回跳** | **采纳** |

C 的关键判断：三种登录方式（微信扫码 / 手机号 / 邮箱）最终都会在 `brandct.com` 上产生一次 GET 落点，因此"回到授权端点"只需在落点处消费 session，不需要依赖 omniauth vendor 的 redirect 会话存储，也不需要改 `ProviderStrategy`。

### 3.1 移动端为什么不用单独做一套

官网首页是**同一个页面**（`src/pages/index.astro` 同时渲染 `.site-pc` 与 `.site-m`，靠 CSS 断点 1024px 切换），所以只写一段脚本、按当前布局分流：

- PC：`.site-pc .login-trigger` 可见 → `trigger.click()`，**复用现有点击逻辑**弹出登录弹窗（微信 / 手机号 / 邮箱）
- 移动端：没有弹窗（`m/MLogin.astro` 只有一个「立即登录」按钮，点了整页跳 `/wx`）→ 直接 `location.href = location.origin + '/wx'`；微信内置浏览器里 `ProviderStrategy` 走 `/userinfo?appid=` 是**静默授权**，等于直接登录；其他手机浏览器则出微信扫码页

顺带修掉移动端的一个隐患：`MLogin` 原来硬编码 `https://brandct.cn/wx`（还有 `yikuaigao.com` 老域名分支），跨域会换 session cookie；统一脚本用 `location.origin` 保证会话与回跳同域。

### 3.2 参数名

`autoLogin=1`（不叫 `login`）：语义自解释，且 omniauth 的路由策略名就叫 `login`（`/login/`），容易看串。全仓已确认没有别处读写 `login` / `autoLogin` 查询参数。

---

## 4. 修复内容

### 4.1 `report-web-server`（分支 `feat/oidc-scan-login`）

**① `src/config.php` — 放行 `/oauth/`**

```diff
-            'allow_pattern' => '#^/(api|oidc)/#',
+            'allow_pattern' => '#^/(api|oidc|oauth)/#',
```

`/oauth/` 下只有 `GET /oauth/authorize` 一个路由（全仓 grep 确认），放行面最小。

**② `src/application/controller/OidcAuthorizeController.php` — 未登录把授权请求存 session 并跳首页**

```php
if (!Omniauth::get($this->getRequest())?->isAuthenticated()) {
    $uri = $this->getRequest()->getUri();
    $query = $uri->getQuery();
    $target = $uri->getPath().(Text::isNotEmpty($query) ? '?'.$query : '');
    $this->getSession()->set(self::OIDC_RETURN_TO_SESSION_KEY, [
        'path' => $target,
        'expiresAt' => time() + self::OIDC_RETURN_TO_TTL,
    ]);
    $this->redirect(rtrim((string) $this->brandctUrl, '/').'/?autoLogin=1');
}
// 已登录：抵达授权端点即视为本次回跳已完成
$this->getSession()->set(self::OIDC_RETURN_TO_SESSION_KEY, []);
```

放在 `validateAuthorizationRequest()` **之前**：guest 不该先建授权请求，也不该走到 `getUser()`。

**③ `src/application/controller/AbstractController.php` — 消费待回跳目标**

```php
protected const OIDC_RETURN_TO_SESSION_KEY = 'oidc_return_to';
protected const OIDC_RETURN_TO_TTL = 300;   // 5 分钟

protected function redirectToPendingOidcAuthorize(): bool
{
    // 读 session → 先清再跳（置 []）→ 过期丢弃 → 只允许 /oauth/authorize 开头
    // （防开放重定向）→ $this->redirect($path)
}
```

**④ `src/application/controller/IndexController.php` — 登录落点两个钩子**

- `showPageByRole()`：`/` 与 `/client`（SSO 回调落点，扫码登录后走这里）
- `redirectToSkipPermissionPage()`（即 `/area-sale/auth`）：`/wx` 的默认落点（手机号/邮箱登录走这里）

各在方法开头调用一次，命中即返回。

### 4.2 `website-fe`（分支 `feat/oidc-auto-login`）

`src/pages/index.astro` 的 `scripts` 插槽新增一段（无参数时完全不执行）：

```js
if (new URLSearchParams(location.search).get("autoLogin") !== "1") return;

// 就地清掉 autoLogin（replaceState：不新增历史、不重新加载、保留其它 query 与 hash）
// 用可见性判断布局：PC → 点现有「登录」按钮；移动端 → 整页跳 /wx
const trigger = document.querySelector(".site-pc .login-trigger");
(trigger && trigger.offsetParent !== null)
  ? trigger.click()
  : (location.href = location.origin + "/wx");
```

`SiteHeader.astro` / `m/MLogin.astro` **不改**——PC 直接复用已绑定的点击逻辑，避免重复维护弹窗初始化。

### 4.3 修复后的完整链路

```
msy-x auth login
  → https://x.brandct.com/api/v1/oauth/authorize?...       # 未登录
  → 302 /login?redirect=…
  → OIDC 强制跳转 https://brandct.com/oauth/authorize?…    # 未登录
  → session 记下本次授权请求 → 302 https://brandct.com/?autoLogin=1
  → 首页自动拉起登录：PC 弹窗（微信/手机号/邮箱）/ 移动端 /wx
  → 登录完成落点 /client 或 /area-sale/auth
  → 钩子消费 session → 302 回 /oauth/authorize?…（已登录，自动 approve）
  → 回 Lightdash OIDC callback → Lightdash 会话建立 → 回 /api/v1/oauth/authorize?…
  → 【授权页】马上赢 X 平台请求访问 + 允许/拒绝            ← 评审要的"授权页"
  → 允许 → 回调 http://127.0.0.1:<port>/callback?code=…
  → CLI 换 token 落 ~/.config/msy-x/config.yaml
  → 豆包轮询 msy-x auth status，命中 "logged_in":true
```

---

## 5. 影响面与回归清单

| 改动 | 命中条件 | 不影响 |
|---|---|---|
| `allow_pattern` 加 `oauth` | 仅 `/oauth/*` | `/api/*`、`/oidc/*` 与所有页面路径 |
| 未登录分支 | 仅"未登录 + `/oauth/authorize`" | 已登录用户（走原有自动 approve）；`mobile not bind` / `no permission` 分支未动 |
| session 钩子 | 仅 session 里存在 5 分钟内的待回跳目标 | 普通访客的 session 里没有该键，两个落点直接往下走 |
| 首页 `autoLogin` | 仅 URL 带 `autoLogin=1` | **直接访问官网（无参数）行为完全不变**：脚本首行即 return，不弹窗、不跳转、不改 URL |
| `ProviderStrategy` | **完全不改** | 官网首页「登录」、小程序、企业微信、品牌后台、报告页等入口零影响 |

必须回归的入口（预发）：

1. 直接访问官网首页（含锚点、带其它 query）→ 不弹窗、URL 不被改写
2. 官网首页未登录点「登录」→ 弹窗三种方式，落地页与今天一致
3. `x.pre.banmahui.cn` 普通网页登录（非 CLI）
4. 企业微信 / 微信内置浏览器打开报告页（`/login` → `/wx`、`/work_wx`）
5. 手机端首页点「立即登录」→ `/wx`（本次未改 MLogin，行为不变）

残留风险：

- 用户开了登录弹窗但放弃登录，5 分钟内访问 `/client` 或 `/area-sale/auth` 会被送回授权端点（TTL 到期即恢复；这两个是登录落点，普通浏览基本不会直接命中）
- `/oauth/authorize` 若还有 Lightdash 以外的 OIDC client（DB `oauth_clients` 待确认），它们未登录时会先看到官网登录入口
- 手机号/邮箱登录依赖 `${baseUrl}` 与页面同站才能落 cookie；`MLogin` 的老域名分支（`brandct.cn` / `yikuaigao.com`）走 `RedirectToBrandDomain` 301 换 host 时会换 session，属于存量问题，本次未处理

---

## 6. 上线与回滚

- 部署：`report-web-server`（`feat/oidc-scan-login`）与 `website-fe`（`feat/oidc-auto-login`）**需一起发**；先后顺序不影响正确性，但只发后端时用户会停在新版首页（自动弹窗）之前
- CI：`composer82 lint && composer82 test`（本地无 PHP/vendor，未能预热）
- 回滚：去掉 `allow_pattern` 的 `oauth|` 即恢复今天的跳转行为（前端是否带 `autoLogin` 都无副作用）

---

## 7. 验收（一次即可）

```bash
# 1. 未登录链路：浏览器打开站点 → 首页自动弹出登录弹窗（不再停在门户页）
msy-x auth login

# 2. 完成登录（扫码 / 手机号均可）→ 自动回到 x.brandct.com 的授权页（应用名 + scope + 允许/拒绝）

# 3. 点「允许」→ 终端输出，且 logged_in 为首键
msy-x auth status      # {"logged_in":true,...}
```

对照：`--qr` 设备码登录、`--token <pat>` PAT 登录、`--no-browser` 打印授权 URL 三条路径均不受本次改动影响。

---

## 8. 待办

- [ ] 预发跑完第 5 节 5 条回归 + 第 7 节验收
- [ ] 确认 `oauth_clients` 里是否只有 Lightdash（prod / pre）
- [ ] 拿到 tapnow 的流程说明或录屏后，核对"回调到豆包客户端"是否需要改成 `doubao://` 深链（CLI 连接器模型下该回调不存在，等价物是 `127.0.0.1` 回环 + 平台 `status` 轮询，需向评审说明）
- [ ] 插件包（`packages/x-doubao-plugin`）重新打包提交审核
