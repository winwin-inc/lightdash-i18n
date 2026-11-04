# 导出与 API 分进程（scheduler 独立 Deployment）

状态：**待开发**（方案已评估，尚未实施；先在 pre 验证）
范围：部署形态（k8s-config）为主，本项目只做确认，**不需要改代码**
相关：[csv-export-performance.md](./csv-export-performance.md)、[warehouse-query-cancel.md](./warehouse-query-cancel.md)

## 一、为什么要拆

现在 `SCHEDULER_ENABLED=true`（代码默认值也是 `!== 'false'`），API 进程内同时跑 graphile worker：

- 导出/订阅任务和用户查询**共用同一个进程**：格式化 CSV/XLSX、构造透视矩阵都是同步 CPU，导出高峰时 API 的 HTTP 请求一起排队（`csv-export-performance.md` §三 记录过这个现象）；
- 共用同一份内存：一次大导出把 pod 顶到 OOMKilled，会把**整站**带走（不只是这一个导出失败）；
- 共用连接池（knex 默认 10 + graphile worker pool 10）。

拆开之后：导出崩了只死 scheduler pod，查询不受影响；资源上限可以分别给。

## 二、项目侧结论（本仓库不需要改代码）

| 项       | 结论                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 独立入口 | 已存在：`packages/backend/src/scheduler.ts` → `node dist/scheduler.js`（`pnpm -F backend scheduler`）                                                                                     |
| 镜像     | **不需要新镜像**：`packages/backend/tsconfig.json` 的 `include: src/**/*.ts` + `outDir: dist`，`dist/scheduler.js` 与 `dist/index.js` 同目录；镜像 WORKDIR 是 `/usr/app/packages/backend` |
| 启动脚本 | 镜像 `ENTRYPOINT=/usr/bin/prod-entrypoint.sh`（先 `pnpm -F backend migrate-production`，再 `exec CMD`）。k8s 用 **`args`** 覆盖 CMD（保留迁移）；用 `command` 覆盖 ENTRYPOINT 会跳过迁移  |
| 健康检查 | `SchedulerApp` 自带 express + terminus：`/api/v1/health`（worker 在跑才 200）、`/api/v1/livez`（恒 200），`PORT` 默认 8081                                                                |
| 开关     | `SchedulerApp.start()` **不读** `SCHEDULER_ENABLED`，无条件起 worker；该开关只控制 API 进程内是否起 worker（`App.ts:272`）                                                                |
| 优雅退出 | SIGTERM 先 `runner.stop()` 再退出                                                                                                                                                         |

验证镜像里有入口：

```bash
docker run --rm --entrypoint ls <image> /usr/app/packages/backend/dist/scheduler.js
```

## 三、k8s 侧改动（master + pre 各一份）

### 1. ConfigMap：让 API 不再跑 worker

`lightdash-config`（pre 为 `lightdash-config`）里：

```yaml
SCHEDULER_ENABLED: 'false'
```

### 2. 新增 Deployment `lightdash-scheduler`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lightdash-scheduler
  labels: { app: lightdash-scheduler }
spec:
  replicas: 1
  selector:
    matchLabels: { app: lightdash-scheduler }
  template:
    metadata:
      labels: { app: lightdash-scheduler } # 绝不能复用 app: lightdash
    spec:
      containers:
        - name: lightdash
          image: registry-vpc.cn-hangzhou.aliyuncs.com/winwin/lightdash:<version>
          args: ['node', 'dist/scheduler.js'] # 保留 ENTRYPOINT → 迁移照跑
          envFrom:
            - configMapRef: { name: lightdash-config }
            - secretRef: { name: lightdash-secret }
          env:
            - { name: PORT, value: '8081' } # 覆盖 configmap 的 8080
            - { name: SCHEDULER_CONCURRENCY, value: '1' } # 先 1，稳定后再 2
            - { name: SCHEDULER_JOB_TIMEOUT, value: '1200000' }
          ports: [{ containerPort: 8081 }]
          readinessProbe:
            httpGet: { path: /api/v1/health, port: 8081 }
            initialDelaySeconds: 10
            periodSeconds: 15
          livenessProbe:
            httpGet: { path: /api/v1/livez, port: 8081 }
            initialDelaySeconds: 30
            periodSeconds: 20
          resources:
            requests: { cpu: 500m, memory: 2Gi }
            limits: { memory: 12Gi }
```

要点：

- **标签必须换**：`Service lightdash` 按 `app: lightdash` 选 endpoint，复用会让 APISIX 把 Web 流量路由到 scheduler。
- 不需要 Service（没有 ingress 流量）。只有 Prometheus 要抓 metrics 时才加一个 ClusterIP Service。
- 不需要共享卷：结果文件在 S3，`/tmp` 只在本 pod 内使用。
- `SCHEDULER_TASKS` 不设 = 跑全部任务（含定时订阅/日报/截图）；截图依赖镜像里的浏览器，与 API 同镜像时行为不变。

## 四、风险与缓解

| 风险                                                      | 影响                                                                 | 缓解                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 标签复用 `app: lightdash`                                 | Web 流量打到 scheduler，出现 404/502                                 | 用 `app: lightdash-scheduler`                                                                                |
| 忘改 `SCHEDULER_ENABLED=false`                            | 两个进程都跑 worker：graphile 有行锁不会重复执行，但并发与连接数翻倍 | 看 API 日志不再出现 `Running scheduler`                                                                      |
| 多个 pod 同时 `migrate-production`（2 API + 1 scheduler） | 偶发 "lock 已被占用" → 启动失败重启一次                              | 现状 2 个 API pod 已经这样；要彻底避免就改用 `command:` 跳过迁移，代价是升级时 scheduler 可能先看到旧 schema |
| 导出并发叠加                                              | 内存峰值                                                             | `SCHEDULER_CONCURRENCY=1` 起步                                                                               |
| 监控迁移                                                  | 队列积压指标从 API 移到 scheduler                                    | 面板/告警改指向 scheduler                                                                                    |
| 回滚                                                      | —                                                                    | ConfigMap 改回 `true`、删除 Deployment；无状态、无迁移                                                       |

## 五、验证

```bash
# 1) API 不再跑 worker
kubectl -n <ns> logs deploy/lightdash --tail=100 | grep -i "Running scheduler"    # 应无输出

# 2) scheduler 起来了
kubectl -n <ns> logs deploy/lightdash-scheduler --tail=50 | grep -iE "Running scheduler|listening"
kubectl -n <ns> get pod -l app=lightdash-scheduler -o wide

# 3) 触发一次导出，确认任务在 scheduler 执行
kubectl -n <ns> logs deploy/lightdash-scheduler --tail=100 | grep -iE "download|job"

# 4) API 侧无影响
kubectl -n <ns> get pod -l app=lightdash        # 2/2 Ready、无 restart
```

## 六、落地顺序

1. **pre**：改 ConfigMap + 加 Deployment → 跑一遍导出（60w / 100w）确认任务在 scheduler 上执行、API 无影响；
2. **master**：同一套改动；
3. 稳定后再考虑：`SCHEDULER_CONCURRENCY` 回到 2、给 scheduler 单独 metrics Service 与告警。

## 七、不在本期范围

- 把 exports 改成流式 pivot（内存 O(1)）：需要两遍扫描 + 去重列集合，工程量 2–4 周，见 `csv-export-performance.md` §七；
- 结果文件分桶/生命周期（与业务资源同桶的问题）；
- MCP 同参数去重与查询并发上限（见 `warehouse-query-cancel.md` §六）。
