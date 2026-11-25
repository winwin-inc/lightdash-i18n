# k8s-config 纪律（强制）

适用于本仓库所有 agent。**违反本规则视为严重事故**（会把预发/生产指到错误的镜像）。

## 唯一硬性要求

> **禁止修改 `k8s-config` 里任何 `image:` 的版本号（tag）。**
> 包括"为了测试把 pre 指到新 tag""为了验证把镜像 bump 一下"这类看起来无害的改动。

## 为什么（事实）

-   各应用 deployment（如 `lightdash/lightdash.yml`、`lightdash-internal/lightdash.yml`）的
    `image: registry-vpc.<...>/winwin/lightdash:<version>` **由发版/重启流程自动写入**：
    `rollout` 时版本号会被流程覆盖，手改的那一行不但不生效，还会在下次 diff 里制造噪声。
-   手改的风险全部落在"错的方向"：把预发指到还没构建完的 tag（Pod 起不来 `ImagePullBackOff`）、
    把生产回退到旧版本、把 A 应用的版本串到 B 应用。
-   要上某个版本的正确路径是：**打 tag → CI 构建镜像 → 走发版/重启流程**（见
    [`release-tags.md`](./release-tags.md)），不是改 yml。

## 允许 / 禁止

| 操作 | 允许 |
|---|---|
| 改 ConfigMap 的 env（如 `UMAMI_COLLECT_*`） | ✅ |
| 改 SopsSecret / secret 项（需对应权限） | ✅ |
| 改 `*-ar.yml`（APISIX 路由）、`*-svc.yml`、resources/探针 | ✅（按需，注意别顺手） |
| 改任何 `image:` 版本号 | ❌ **禁止** |
| 为回滚需要手工指定镜像 | ⚠️ 必须先问用户，得到明确许可再做 |

## 生效方式（改了 env 之后）

`envFrom` 不是热更新，改完 ConfigMap/Secret 需要：

```bash
./utils/k8s-apply <app>
kubectl -n <ns> rollout restart deploy/<app>    # 这一步会顺带写入正确镜像版本
```

## 自查（提交前逐条过）

1. `git diff` 里是否出现 `image:` 行？出现 → 还原，停。
2. 改动是否只落在 ConfigMap / Secret / 路由等非镜像字段？
3. 是否已经在提交信息里误称"升级镜像"？→ 改掉，避免误导后来人。
