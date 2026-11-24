# 埋点环境变量配置（`k8s-config`，交接后端/运维）

> **状态：待配置**。配套实现见 [`umami-analytics.md`](./umami-analytics.md)。
> 本文只讲 `k8s-config` 仓库要加什么、怎么加、怎么验。**需要 SopsSecret（age key）权限**，
> 前端的同学没有密钥权限，所以这一节交接给后端/运维执行。

## 1. 为什么不能直接写明文

`UMAMI_COLLECT_TOKEN` 是写数据到 Umami 站点的凭证（能往该站点刷假数据），而 `k8s-config` 是
git 仓库：

- 明文进 ConfigMap = **永久留在 git 历史**，以后轮换也删不掉；
- 该仓已经有 secret 机制（SopsSecret / SealedSecret），明文放 ConfigMap 属于倒退。

所以分工是：

| 项 | 谁做 | 放哪 |
|---|---|---|
| `UMAMI_COLLECT_ENABLED` / `ENDPOINT` / `PROJECT` | 任何人（非密） | ConfigMap |
| `UMAMI_COLLECT_TOKEN` | **有 age key 权限的同学** | SopsSecret |

## 2. 加什么（两个部署，各 3 + 1 个键）

现有两个 Deployment 都是 `envFrom: configMapRef + secretRef`，**所以 `lightdash.yml` 一行不用改**
（image tag / resources / 探针都不动，避免误发未验证版本）。

### 2.1 对外站 `x.brandct.com`

`lightdash/lightdash-config.yaml`（ConfigMap `lightdash-config`）→ `data:` 追加：

```yaml
  # 产品埋点（自建 Umami，见 docs/ops/umami-analytics.md）
  UMAMI_COLLECT_ENABLED: 'true'
  UMAMI_COLLECT_ENDPOINT: https://collect.banmahui.cn/api/gp
  UMAMI_COLLECT_PROJECT: msy-x-platform
```

`lightdash/lightdash-sopssecret.yaml`（SopsSecret `lightdash-secret`）→ `stringData:` 追加：

```yaml
        UMAMI_COLLECT_TOKEN: ENC[AES256_GCM,data:...,type:str]
```

### 2.2 内部站 `lightdash.banmahui.cn`

`lightdash-internal/lightdash-internal-config.yml`（ConfigMap `lightdash-internal-config`）→
同上三键，但 `UMAMI_COLLECT_PROJECT: lightdash-internal`。

`lightdash-internal/lightdash-internal-sopssecret.yaml` → `UMAMI_COLLECT_TOKEN`。

### 2.3 不要动的东西

| 文件 | 原因 |
|---|---|
| `*/lightdash.yml`（Deployment） | `envFrom` 已覆盖；改它会顺带动 image tag |
| `*-ar.yml` | APISIX **入站**路由；collect 是**出站**，不需要开路由 |
| `*-svc.yml` | 与本需求无关 |
| CSP | 已在 `default-src` 放行 `https://*.banmahui.cn`，`collect.banmahui.cn` 已覆盖 |

## 3. 怎么做（sops）

```bash
# 一次性：拉 age 私钥，写好 SOPS_AGE_KEY_FILE / SOPS_AGE_RECIPIENTS 到 .env
./utils/init-age-key

# 编辑 secret：解密 → 编辑器里加一行 → 保存自动重加密
sops lightdash/lightdash-sopssecret.yaml
sops lightdash-internal/lightdash-internal-sopssecret.yaml

# 只加密一个值（不想进编辑器时）
sops -e --input-type json --output-type json - <<< '"<token>"'
```

- 明文 token 不能落到任何被跟踪的文件（`env`、文档、提交信息都不行）；
- **提交前 review diff**：只应出现 3 个新增 `data:` 键 + 1 个新增 `stringData:` 键 + sops 自动更新的
  `lastmodified` / `mac`；
- 值从运维处取（适配层 `PROJECT_TOKENS`），**与 project 必须成对**：错配会返回
  `project_token_error`，事件全丢且不报错。

## 4. 生效与验证

```bash
./utils/k8s-apply lightdash && ./utils/k8s-apply lightdash-internal   # 按目录/命名空间 apply
kubectl -n <ns> rollout restart deploy/lightdash                      # envFrom 不热更，必须重启
kubectl -n <ns> rollout restart deploy/lightdash-internal

# 键存在性（token 不要回显）
kubectl -n <ns> get cm lightdash-config -o yaml | grep UMAMI
kubectl -n <ns> exec deploy/lightdash -- sh -c 'env | grep UMAMI | sed "s/TOKEN=.*/TOKEN=***/"'

# 前端能读到（enabled=true、project 正确）
curl -s https://x.brandct.com/api/v1/health | grep -o '"umami":{[^}]*}'
```

Pod 起来后：浏览器 Network 应出现一条 `POST https://collect.banmahui.cn/api/gp`（无 OPTIONS 预检），
Umami 的 Events / Pages 里能看到 `page_view`。

## 5. 回滚 / 紧急关闭

| 场景 | 操作 |
|---|---|
| 只想停采集，保留配置 | ConfigMap 改 `UMAMI_COLLECT_ENABLED: 'false'` → `rollout restart` |
| token 泄露 | 运维在适配层轮换 token → 更新 SopsSecret → `rollout restart` |
| 回滚代码版本 | 无需动这里：旧代码不认识这些 env，不会上报 |

## 6. 分支说明（容易踩）

`k8s-config` 的**分支 = 环境**，README 写明四个分支各自对应四个命名空间且**互不合并**，
`utils/k8s-apply` 按当前分支决定 apply 到哪个 ns。所以：

```
feat/umami-analytics 上改好
   ├─ 摘到 pre    （先预发验证）
   └─ 摘到 master （生产）
```

不能指望「feat 分支合进 master」；两边各提一次（cherry-pick 或重写提交）。

## 7. 待确认（执行前问一句就够）

1. 适配层里 `msy-x-platform` / `lightdash-internal` 的 token 是否已下发、是否可用（curl 一条即知）
2. 两个 project 对应的 **Umami websiteId**（`msy-umami-query` 的 `profiles.json` 需要；可从
   `insight.banmahui.cn` 站点地址栏 `/websites/<id>` 取，或 `umamiq sites --env prod`）
3. 生产集群到 `collect.banmahui.cn` 的出网是否放通（内网服务出网策略）
