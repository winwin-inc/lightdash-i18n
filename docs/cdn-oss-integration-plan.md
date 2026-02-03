# Lightdash CDN + OSS 统一改造方案

## 概述

本文档描述了 Lightdash 的 CDN + OSS 统一改造方案：

1. 将静态资源（JS/CSS/图片等）部署到 CDN
2. 使用 OSS 预签名 URL 实现前端直传
3. 使用同一个 OSS Bucket，通过路径前缀区分静态资源和用户上传文件

## 当前架构分析

### 现状

1. **静态资源服务**：

   - 位置：`packages/backend/src/App.ts` (第 610-619 行)
   - 方式：Express `express.static` 服务前端构建产物
   - 缓存策略：`Cache-Control: no-cache, private`（不允许 CDN 缓存）
   - 问题：所有静态资源请求都经过后端服务器，增加服务器负载

2. **文件上传**：

   - 位置：`packages/backend/src/clients/Aws/S3Client.ts`
   - 方式：后端直接上传文件到 OSS，然后返回预签名下载 URL
   - 问题：文件需要经过后端服务器，占用服务器带宽和资源

3. **OSS 配置**：
   - 已支持 S3/OSS 配置（`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION` 等）
   - 已有 `S3Client` 类，支持文件上传功能
   - 缺少：预签名上传 URL 生成功能

## 改造目标

- 统一存储：使用同一个 OSS Bucket，通过路径前缀区分
- 配置复用：复用现有的 S3/OSS 环境变量配置
- 向后兼容：保留后端静态文件服务作为回退机制
- 版本化管理：支持版本化部署，便于回滚

## 统一架构设计

### 存储结构

**重要**：静态资源和上传文件使用独立的路径前缀配置。

**场景 1：设置了 `CDN_PATH_PREFIX=lightdash`**（推荐用于通用 Bucket）

```
OSS Bucket: lightdash-prod (或通用 bucket)
├── lightdash/                 # CDN 路径前缀（CDN_PATH_PREFIX，默认 lightdash）
│   └── static/                # 静态资源（前端构建产物）
│       ├── v1.2.3/           # 版本化部署
│       │   ├── index.html
│       │   ├── assets/
│       │   │   ├── index-abc123.js
│       │   │   ├── index-abc123.css
│       │   │   └── ...
│       │   └── ...
│       └── latest/           # 最新版本（可选）
│
└── {S3_PATH_PREFIX}/uploads/  # 用户上传文件（使用 S3_PATH_PREFIX）
    ├── {userUuid}/
    │   ├── {fileId}/
    │   │   └── {fileName}
    │   └── ...
    └── ...
```

**场景 2：未设置 `CDN_PATH_PREFIX`**（使用默认值 `lightdash`）

```
OSS Bucket: lightdash-prod
├── lightdash/                 # 默认前缀
│   └── static/
│       └── v1.2.3/
│           └── ...
│
└── {S3_PATH_PREFIX}/uploads/
    └── ...
```

**路径规则说明**：

- **独立配置**：静态资源使用 `CDN_PATH_PREFIX`（默认 `lightdash`），上传文件使用 `S3_PATH_PREFIX`
- **静态资源路径**：
  - 如果 `CDN_PATH_PREFIX=lightdash`：`lightdash/static/{version}/`
  - 如果没有设置（使用默认）：`lightdash/static/{version}/`
- **上传文件路径**：
  - 如果 `S3_PATH_PREFIX=lightdash`：`lightdash/uploads/{userUuid}/{fileId}/`
  - 如果没有设置：`uploads/{userUuid}/{fileId}/`
- **`CDN_BASE_URL` 配置**：
  - 如果 `CDN_PATH_PREFIX=lightdash`（默认），则 `CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static`
  - 如果没有设置（使用默认），则 `CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static`

### 访问流程

```
用户请求
  ├── HTML 请求 (index.html)
  │   └── CDN (短期缓存) → OSS Bucket ({prefix}/static/{version}/)
  │
  ├── 静态资源请求 (JS/CSS/图片)
  │   └── CDN (长期缓存) → OSS Bucket ({prefix}/static/{version}/)
  │
  ├── API 请求 (/api/*)
  │   └── 后端服务器
  │
  └── 文件上传
      ├── 1. 前端请求预签名 URL → 后端 API
      ├── 2. 后端生成预签名 URL → 返回给前端
      └── 3. 前端直接上传 → OSS Bucket ({prefix}/uploads/{userUuid}/{fileId}/)
```

## 运行流程

### 静态资源上传流程

**重要：上传时机说明**

#### 生产环境：GitHub Actions 自动上传

静态资源在 GitHub Actions CI/CD 流程中自动上传到 OSS（直接使用 OSS 端点，不经过 CDN）：

1. **触发时机**：

   - 当推送 git tag（如 `v1.2.3`）时触发 `build-docker-with-i18n.yml` 工作流
   - 或手动触发 workflow_dispatch

2. **上传流程**：

   ```
   开发者推送 tag
       ↓
   GitHub Actions 触发
       ↓
   Checkout 代码
       ↓
   安装依赖 (pnpm install)
       ↓
   构建前端 (使用相对路径，CDN 配置在运行时注入)
       ↓
   上传静态资源到 OSS (调用 upload-static-to-cdn.sh，使用 S3_ENDPOINT，不经过 CDN)
       ↓
   构建 Docker 镜像
       ↓
   推送镜像到容器仓库
   ```

3. **版本管理**：
   - 使用 git tag 作为版本号（如 `v1.2.3`）
   - 上传到 `{S3_PATH_PREFIX}/static/{version}/` 路径
   - 支持多版本共存，便于回滚

#### 本地开发：不上传

- **开发环境**：不设置 `CDN_BASE_URL`，Vite 使用相对路径 `/`
- **静态资源**：从本地开发服务器（`localhost:3000`）加载
- **不需要配置**：OSS 访问密钥、CDN 配置等都不需要

#### 手动上传（可选）

如果需要手动上传，可以运行：

```bash
VERSION=v1.2.3 bash scripts/upload-static-to-cdn.sh
```

需要配置环境变量：`S3_PATH_PREFIX`、`CDN_BUCKET`、`ALIYUN_ACCESS_KEY_ID` 等

### 文件上传流程（用户上传文件）

1. **前端请求预签名 URL**：

   - 前端调用 `POST /api/v1/oss/upload-url`
   - 传递文件信息：`fileName`、`contentType`、`fileSize`

2. **后端生成预签名 URL**：

   - 后端生成文件 ID：`{userUuid}/{uuid}/{fileName}`
   - 调用 `S3Client.getUploadPresignedUrl()` 生成预签名上传 URL
   - 路径自动添加 `{S3_PATH_PREFIX}/uploads/` 前缀

3. **前端直接上传到 OSS**：
   - 前端使用预签名 URL 直接上传文件到 OSS
   - 文件不经过后端服务器
   - 支持上传进度回调

## 配置说明

### 环境变量配置

**重要说明：OSS 地址和 CDN 地址的区别**

- **OSS 地址**（`S3_ENDPOINT`）：用于后端直接访问 OSS，上传/下载文件
  - 示例：`https://oss-cn-hangzhou.aliyuncs.com`
  - 用途：后端生成预签名 URL、上传文件到 OSS、**GitHub Actions 上传静态资源到 OSS**
  - **注意**：GitHub Actions 上传时使用 OSS 地址，**不需要 CDN 加速域名**
- **CDN 地址**（`CDN_BASE_URL`）：用于前端访问静态资源，通过 CDN 加速
  - 示例：`https://cdn.lightdash.com/lightdash/static`
  - 用途：**运行时使用**，后端在提供 HTML 时动态注入 `<base>` 标签
  - **注意**：
    - CDN 地址通常是 OSS Bucket 绑定的加速域名，与 OSS 地址不同
    - **运行时注入**：后端在提供 HTML 时动态注入 base 标签，支持动态切换 CDN
    - `CDN_BASE_URL` **不用于上传**，上传时只需要 OSS 配置（`S3_ENDPOINT`、`S3_BUCKET` 等）
    - **独立配置**：静态资源使用 `CDN_PATH_PREFIX`（默认 `lightdash`），上传文件使用 `S3_PATH_PREFIX`

### 配置清单

**1. 复用现有 OSS 配置**（如果已配置，无需修改）：

```bash
# OSS/S3 基础配置（必需）- 后端使用
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com  # OSS 端点地址
S3_BUCKET=lightdash-prod                          # OSS Bucket 名称
S3_REGION=cn-hangzhou                            # OSS 区域

# OSS 访问密钥（必需）- 后端使用
S3_ACCESS_KEY=your-access-key-id                  # OSS AccessKey ID
S3_SECRET_KEY=your-access-key-secret              # OSS AccessKey Secret

# OSS 可选配置
S3_FORCE_PATH_STYLE=true                          # OSS 通常需要设为 true
S3_EXPIRATION_TIME=3600                           # 预签名 URL 过期时间（秒，默认 1 小时用于上传）
S3_PATH_PREFIX=lightdash                         # 项目标识前缀（可选，用于项目隔离）
S3_REQUEST_TIMEOUT=1800000                        # 请求超时时间（毫秒）
```

**2. 新增 CDN 相关配置**（必需）：

```bash
# CDN 配置 - 运行时使用
CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static     # CDN 加速域名
CDN_PATH_PREFIX=lightdash                                    # CDN 路径前缀（可选，默认 lightdash）
STATIC_FILES_VERSION=v1.2.3                                  # 当前静态资源版本（可选，可用 git tag 自动获取）

# 后端回退机制配置（可选）
STATIC_FILES_ENABLED=true                                    # 是否启用后端静态文件服务（回退机制，默认 true）
```

### 配置说明表

| 环境变量               | 用途            | 必需    | 说明                                  |
| ---------------------- | --------------- | ------- | ------------------------------------- |
| `S3_ENDPOINT`          | 后端访问 OSS    | ✅      | 如果已配置，无需修改                  |
| `S3_BUCKET`            | OSS Bucket 名称 | ✅      | 如果已配置，无需修改                  |
| `S3_REGION`            | OSS 区域        | ✅      | 如果已配置，无需修改                  |
| `S3_ACCESS_KEY`        | OSS 访问密钥    | ✅      | 如果已配置，无需修改                  |
| `S3_SECRET_KEY`        | OSS 访问密钥    | ✅      | 如果已配置，无需修改                  |
| `S3_PATH_PREFIX`       | 项目标识前缀（上传文件） | 可选    | 现有配置项，用于上传文件路径          |
| `CDN_BASE_URL`         | 前端 CDN 地址           | ✅ 新增 | CDN 加速域名，运行时通过后端 API 获取 |
| `CDN_PATH_PREFIX`      | CDN 路径前缀（静态资源） | 可选    | 默认 `lightdash`，用于静态资源路径    |
| `STATIC_FILES_VERSION` | 静态资源版本             | 可选    | 用于版本化部署，可用 git tag 自动获取 |
| `STATIC_FILES_ENABLED` | 后端回退机制             | 可选    | 默认 `true`，CDN 不可用时使用后端服务 |

### 配置示例

```bash
# 场景 1：完全使用 CDN（推荐生产环境，使用项目前缀）
S3_PATH_PREFIX=lightdash  # 项目标识前缀
CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static  # 包含项目前缀
STATIC_FILES_VERSION=v1.2.3
STATIC_FILES_ENABLED=false  # 禁用后端静态文件服务

# 场景 2：CDN + 后端回退（推荐过渡期，使用项目前缀）
S3_PATH_PREFIX=lightdash
CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static
STATIC_FILES_VERSION=v1.2.3
STATIC_FILES_ENABLED=true   # 启用后端回退机制

# 场景 3：不使用项目前缀（专用 Bucket）
# 不设置 S3_PATH_PREFIX，或设置为空
CDN_BASE_URL=https://cdn.lightdash.com/static  # 不包含项目前缀
STATIC_FILES_VERSION=v1.2.3
STATIC_FILES_ENABLED=true

# 场景 4：仅使用后端（开发环境或 CDN 未配置）
S3_PATH_PREFIX=lightdash  # 可选，根据实际情况设置
# 不设置 CDN_BASE_URL，或设置为空
STATIC_FILES_ENABLED=true
```

### 关键配置点

1. OSS 配置可以复用：如果已经配置了 `S3_ENDPOINT`、`S3_BUCKET` 等，无需修改
2. **独立路径前缀**：
   - 静态资源使用 `CDN_PATH_PREFIX`（默认 `lightdash`），路径为 `{CDN_PATH_PREFIX}/static/{version}/`
   - 上传文件使用 `S3_PATH_PREFIX`（可选），路径为 `{S3_PATH_PREFIX}/uploads/{userUuid}/{fileId}/`
3. CDN 地址配置：
   - `CDN_BASE_URL` 需要与 `CDN_PATH_PREFIX` 保持一致
   - 如果 `CDN_PATH_PREFIX=lightdash`（默认），则 `CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static`
4. CDN 地址格式：不包含版本号，版本号在运行时动态添加
5. **运行时配置**：`CDN_BASE_URL` 在运行时通过后端 API 获取，后端在提供 HTML 时动态注入 `<base>` 标签
6. 开发环境：可以不设置 `CDN_BASE_URL`，使用相对路径 `/`

## OSS Bucket 和 CDN 配置

### OSS Bucket 配置

**创建 OSS Bucket**：

- Bucket 名称：`lightdash-prod`（或根据环境命名）
- 区域：根据用户分布选择（如 `cn-hangzhou`）
- 访问权限：私有（通过预签名 URL 访问）

**配置 CDN 加速**：

- 绑定 CDN 加速域名：`cdn.lightdash.com`（示例）
- 配置 HTTPS 证书
- 配置缓存规则（见下方）

**缓存策略配置**：

```yaml
# CDN 缓存规则（注意：路径包含项目前缀 lightdash/）
规则 1: /lightdash/static/*/assets/*
  Cache-Control: public, max-age=31536000, immutable
  说明: 静态资源（JS/CSS）长期缓存

规则 2: /lightdash/static/*/index.html
  Cache-Control: no-cache, must-revalidate
  说明: HTML 文件不缓存，确保及时更新

规则 3: /lightdash/static/*/*
  Cache-Control: public, max-age=86400
  说明: 其他静态文件（图片、字体等）短期缓存
```

## 部署流程

### 标准部署流程

#### 1. 构建阶段（GitHub Actions）

在 GitHub Actions 工作流中：

```yaml
- name: Build frontend
  env:
    STATIC_FILES_VERSION: ${{ steps.meta.outputs.version }}
  run: |
    echo "Building frontend (CDN config will be loaded at runtime)"
    pnpm -F frontend build

- name: Upload static assets to OSS
  env:
    CDN_PROVIDER: aliyun
    S3_BUCKET: ${{ secrets.S3_BUCKET }}
    VERSION: ${{ steps.meta.outputs.version }}
    CDN_PATH_PREFIX: ${{ secrets.CDN_PATH_PREFIX || 'lightdash' }}
    S3_ACCESS_KEY: ${{ secrets.S3_ACCESS_KEY }}
    S3_SECRET_KEY: ${{ secrets.S3_SECRET_KEY }}
    S3_ENDPOINT: ${{ secrets.S3_ENDPOINT }}
    S3_REGION: ${{ secrets.S3_REGION }}
  run: |
    bash scripts/upload-static-to-cdn.sh
```

**流程说明**：

1. 构建前端（不设置 CDN_BASE_URL，使用相对路径）
2. 构建完成后，上传静态资源到 OSS（使用 S3_ENDPOINT，不经过 CDN）
3. 上传路径：`{CDN_PATH_PREFIX}/static/{version}/`（默认 `lightdash/static/{version}/`）
4. 设置缓存策略（assets/ 长期缓存，index.html 不缓存）
5. 运行时，后端在提供 HTML 时动态注入 CDN base URL

#### 2. 部署阶段

```bash
# 部署后端（包含或不包含前端构建产物）
docker build -t lightdash:v1.2.3 .
docker push lightdash:v1.2.3
```

#### 3. 环境变量配置

在运行环境中设置：

```bash
CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static
CDN_PATH_PREFIX=lightdash  # CDN 路径前缀（可选，默认 lightdash）
S3_PATH_PREFIX=lightdash   # 上传文件路径前缀（可选）
STATIC_FILES_VERSION=v1.2.3
STATIC_FILES_ENABLED=true  # 保留回退机制
```

### 回滚流程

1. **回滚 CDN**：

   ```bash
   # 切换到上一个版本
   VERSION=v1.2.2 bash scripts/upload-static-to-cdn.sh
   ```

2. **更新环境变量**：

   ```bash
   STATIC_FILES_VERSION=v1.2.2
   ```

3. **回滚后端**（如需要）：
   ```bash
   docker pull lightdash:v1.2.2
   # 重启容器
   ```

## 实现要点（概要）

### 后端实现

1. **扩展 S3Client**：

   - 添加 `getUploadPresignedUrl()` 方法
   - 使用 `PutObjectCommand` 和 `getSignedUrl` 生成预签名上传 URL
   - 通过 `getPrefixedFileId()` 自动处理 `S3_PATH_PREFIX`

2. **创建 OssService**：

   - 实现 `getUploadUrl()` 方法
   - 生成文件 ID 格式：`{userUuid}/{uuid}/{fileName}`
   - 返回完整路径（包含 `S3_PATH_PREFIX` 和 `uploads/` 前缀）

3. **创建 OssController**：

   - 实现 `POST /api/v1/oss/upload-url` 端点
   - 使用 `allowApiKeyAuthentication` 和 `isAuthenticated` 中间件

4. **创建 CdnController**：

   - 实现 `GET /api/v1/cdn/config` 端点
   - 返回 CDN 配置（`baseUrl`、`pathPrefix`、`staticFilesVersion`）
   - 供前端通过 API 获取配置（虽然 HTML 中已注入）

5. **修改静态资源服务**：
   - 添加 `STATIC_FILES_ENABLED` 环境变量检查
   - 条件性启用 `express.static` 中间件
   - **改造 HTML 服务逻辑**（`App.ts` 第 517-549 行 和 666-698 行）：
     - **原有实现**：使用 `res.sendFile()` 直接发送 HTML 文件
     - **改造后**：
       ```typescript
       // 1. 读取构建好的 HTML 文件
       let html = fs.readFileSync(htmlPath, 'utf8');
       
       // 2. 获取 CDN 配置（从 lightdashConfig）
       const cdnConfig = this.lightdashConfig.cdn;
       
       // 3. 如果配置了 CDN_BASE_URL，则注入
       if (cdnConfig?.baseUrl) {
           // 构建完整的 base URL（包含版本号）
           const fullBaseUrl = `${baseUrl}${version}`;
           
           // 安全地序列化配置（防止 XSS）
           const cdnConfigJson = JSON.stringify({...});
           
           // 注入到 HTML 的 </head> 之前
           html = html.replace('</head>', `${cdnScript}\n    </head>`);
       }
       
       // 4. 返回修改后的 HTML
       res.send(html);
       ```
     - **优势**：支持运行时动态切换 CDN，无需重新构建前端

### 前端实现

1. **修改前端**：

   - Vite 配置：`base` 设置为 `/`（相对路径），不再在构建时设置 CDN base URL
   - 后端在提供 HTML 时动态注入 `<base>` 标签和 `window.__CDN_CONFIG__` 配置
   - 前端通过 hook 获取 CDN 配置（用于其他用途，虽然 base 标签已在 HTML 中设置）

2. **创建 OSS 上传工具**：
   - 调用后端 API 获取预签名 URL
   - 使用 XMLHttpRequest 直接上传到 OSS
   - 支持上传进度回调

### 构建和部署

1. **创建 OSS 上传脚本**：

   - 文件：`scripts/upload-static-to-cdn.sh`
   - 支持阿里云 OSS 和 AWS S3
   - 使用 `S3_ENDPOINT` 直接上传到 OSS（不经过 CDN）
   - 根据 `CDN_PATH_PREFIX`（默认 `lightdash`）动态构建路径
   - 设置正确的缓存策略

2. **更新 GitHub Actions 工作流**：
   - 在 Docker 构建之前添加前端构建和 OSS 上传步骤
   - 构建时不设置 `CDN_BASE_URL`（运行时通过后端 API 获取）
   - 上传时使用 OSS 配置（`S3_BUCKET`、`S3_ENDPOINT` 等）和 `CDN_PATH_PREFIX`

## 常见问题（FAQ）

### Q1: 需要新增哪些环境变量？

**答案**：主要需要新增 `CDN_BASE_URL` 和 `CDN_PATH_PREFIX`，其他 OSS 配置如果已存在可以复用。

**必需新增**：

- `CDN_BASE_URL` - CDN 加速域名（运行时通过后端 API 获取）

**可选配置**：

- `CDN_PATH_PREFIX` - CDN 路径前缀（默认 `lightdash`），用于静态资源路径
  - 如果设置了 `CDN_PATH_PREFIX=lightdash`，则 `CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static`
  - 如果没有设置（使用默认），则 `CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static`
- `S3_PATH_PREFIX` - **现有配置项**，项目标识前缀（如 `lightdash`），用于上传文件路径（与 `CDN_PATH_PREFIX` 独立）

**可选新增**：

- `STATIC_FILES_VERSION` - 静态资源版本号（可用 git tag 自动获取）
- `STATIC_FILES_ENABLED` - 后端回退机制开关（默认 `true`）

**可以复用**（如果已配置）：

- `S3_ENDPOINT`、`S3_BUCKET`、`S3_REGION` 等 OSS 配置

### Q2: CDN 地址和 OSS 地址有什么区别？可以用同一个吗？

**答案**：**不能**用同一个地址，它们是不同的：

- **OSS 地址**（`S3_ENDPOINT`）：

  - 格式：`https://oss-cn-hangzhou.aliyuncs.com`
  - 用途：后端直接访问 OSS，用于上传/下载文件、生成预签名 URL
  - 特点：直接访问 OSS，无 CDN 加速

- **CDN 地址**（`CDN_BASE_URL`）：
  - 格式：`https://cdn.lightdash.com/lightdash/static`（包含路径前缀）
  - 用途：前端访问静态资源，通过 CDN 加速
  - 特点：CDN 边缘节点分发，速度快，有缓存
  - **运行时配置**：后端在提供 HTML 时动态注入，支持动态切换

**关系**：

- CDN 是 OSS Bucket 绑定的加速域名
- 需要在 OSS 控制台绑定 CDN 域名
- 用户访问 CDN 地址 → CDN 回源到 OSS → 返回资源

### Q3: 静态资源是什么时候上传的？

**答案**：**在 GitHub Actions 部署过程中自动上传**，不在本地开发时上传。

- **生产环境**：推送 git tag 时，GitHub Actions 自动构建前端并上传到 OSS（使用 `S3_ENDPOINT`，不经过 CDN）
  - 上传路径：`{CDN_PATH_PREFIX}/static/{version}/`（默认 `lightdash/static/{version}/`）
- **本地开发**：不上传，使用本地开发服务器
- **手动上传**：可选，运行 `scripts/upload-static-to-cdn.sh` 脚本

### Q4: 开发环境需要配置 CDN 吗？

**答案**：**不需要**。开发环境可以不设置 `CDN_BASE_URL`，前端使用相对路径 `/`，静态资源从本地开发服务器加载。

**开发环境配置**：

```bash
# 不设置 CDN_BASE_URL，或设置为空
# CDN_BASE_URL=  # 注释掉或留空
```

**生产环境配置**：

```bash
CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static
CDN_PATH_PREFIX=lightdash  # 可选，默认 lightdash
S3_PATH_PREFIX=lightdash   # 可选，用于上传文件路径
```

### Q5: 后端需要配置 CDN 地址吗？

**答案**：**不需要**。后端只需要 OSS 配置（`S3_ENDPOINT` 等），不需要知道 CDN 地址。

**后端配置**（仅 OSS，包含项目前缀）：

```bash
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
S3_BUCKET=lightdash-prod
S3_REGION=cn-hangzhou
S3_ACCESS_KEY=your-access-key-id
S3_SECRET_KEY=your-access-key-secret
S3_PATH_PREFIX=lightdash  # 项目标识前缀（可选）
```

**运行时配置**（容器中，需要 CDN）：

```bash
CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static
CDN_PATH_PREFIX=lightdash  # 可选，默认 lightdash
STATIC_FILES_VERSION=v1.2.3  # 可选
```

**注意**：`CDN_BASE_URL` 在运行时通过后端 API 获取，后端在提供 HTML 时动态注入 `<base>` 标签，支持动态切换 CDN。

### Q6: 如果我已经有 OSS 配置，还需要做什么？

**答案**：只需要新增 `CDN_BASE_URL` 配置即可。

**步骤**：

1. 检查现有 OSS 配置是否可用（`S3_ENDPOINT`、`S3_BUCKET` 等）
2. 在 OSS 控制台绑定 CDN 加速域名
3. 新增环境变量 `CDN_BASE_URL`：
   - 如果 `CDN_PATH_PREFIX=lightdash`（默认），则 `CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static`
   - 如果设置了其他 `CDN_PATH_PREFIX`，则 `CDN_BASE_URL` 需要包含对应的前缀
4. （可选）配置 `CDN_PATH_PREFIX`（默认 `lightdash`）和 `S3_PATH_PREFIX`（用于上传文件）
5. （可选）配置 `STATIC_FILES_VERSION` 和 `STATIC_FILES_ENABLED`

## 环境变量配置清单

### GitHub Actions Secrets 配置

**配置位置**：GitHub 仓库 → Settings → Secrets and variables → Actions

**重要说明**：GitHub Actions Secrets 和运行时环境变量是不同的配置位置，需要分别配置。

**不需要配置 `CDN_BASE_URL`**：CDN 地址在运行时通过后端 API 获取，不在构建时写入。

**需要配置的 Secrets**（用于上传静态资源到 OSS）：

如果之前没有在 GitHub Actions 中使用 OSS，需要添加以下 secrets：

| Secret 名称 | 说明 | 与运行时环境变量同名 |
|------------|------|-------------------|
| `S3_BUCKET` | OSS Bucket 名称 | ✅ `S3_BUCKET` |
| `S3_ACCESS_KEY` | OSS AccessKey ID | ✅ `S3_ACCESS_KEY` |
| `S3_SECRET_KEY` | OSS AccessKey Secret | ✅ `S3_SECRET_KEY` |
| `S3_ENDPOINT` | OSS 端点地址 | ✅ `S3_ENDPOINT` |
| `CDN_PATH_PREFIX` | CDN 路径前缀（默认 `lightdash`） | ✅ `CDN_PATH_PREFIX` |
| `S3_PATH_PREFIX` | 项目标识前缀（用于上传文件，可选） | ✅ `S3_PATH_PREFIX` |
| `S3_REGION` | OSS 区域（AWS S3 需要） | ✅ `S3_REGION` |

**可选 Secret**：

| Secret 名称 | 说明 | 默认值 |
|------------|------|--------|
| `CDN_PROVIDER` | CDN 提供商 | `aliyun`（可选值：`aliyun`、`aws`） |

**重要说明**：

- **上传时不需要加速域名**：GitHub Actions 上传是直接到 OSS 的（使用 `S3_ENDPOINT`），不经过 CDN
- **`CDN_BASE_URL` 不在 GitHub Actions 中配置**：在运行时通过后端 API 获取，后端在提供 HTML 时动态注入
- **独立路径前缀**：静态资源使用 `CDN_PATH_PREFIX`（默认 `lightdash`），上传文件使用 `S3_PATH_PREFIX`（可选）
- **GitHub Actions Secrets 和运行时环境变量使用相同的变量名**（如 `S3_BUCKET`、`S3_ACCESS_KEY` 等）
- 两者的值应该保持一致
- 但它们是不同的配置位置，需要分别配置
- 如果运行时已有 OSS 配置，GitHub Secrets 中也需要配置相同的值（用于 CI/CD 上传静态资源）

### 项目运行时环境变量配置

**后端运行时环境变量**（如果已有 OSS 配置，无需修改）：

```bash
# OSS/S3 基础配置（必需）
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
S3_BUCKET=lightdash-prod
S3_REGION=cn-hangzhou
S3_ACCESS_KEY=your-access-key-id
S3_SECRET_KEY=your-access-key-secret

# OSS 可选配置
S3_PATH_PREFIX=lightdash  # 项目标识前缀（可选）
S3_FORCE_PATH_STYLE=true
S3_EXPIRATION_TIME=3600
S3_REQUEST_TIMEOUT=1800000
```

**运行时环境变量**（容器中，新增）：

```bash
# CDN 配置（运行时使用）
CDN_BASE_URL=https://cdn.lightdash.com/lightdash/static
CDN_PATH_PREFIX=lightdash  # 可选，默认 lightdash
STATIC_FILES_VERSION=v1.2.3  # 可选，可用 git tag 自动获取
```

**后端运行时环境变量**（容器中，新增，可选）：

```bash
# 后端回退机制配置（可选）
STATIC_FILES_ENABLED=true  # 默认 true，CDN 不可用时使用后端服务
```

**重要说明**：
- **`CDN_BASE_URL` 需要在容器中配置**：后端在提供 HTML 时动态注入，支持运行时切换 CDN
- **容器中需要配置 CDN 相关变量**：`CDN_BASE_URL`、`CDN_PATH_PREFIX`（可选）、`STATIC_FILES_VERSION`（可选）
- **容器中还需要配置 OSS 相关变量**：`S3_ENDPOINT`、`S3_BUCKET` 等（如果还未配置）
- **可选配置 `STATIC_FILES_ENABLED`**：用于控制后端静态文件服务的回退机制

### 配置对应关系

**GitHub Actions Secrets → 项目运行时环境变量**：

| GitHub Secret | 运行时环境变量 | 说明 |
|-------------|--------------|------|
| **不需要** | `CDN_BASE_URL` | CDN 加速域名（运行时通过后端 API 获取） |
| `S3_BUCKET` | `S3_BUCKET` | OSS Bucket 名称 |
| `S3_ACCESS_KEY` | `S3_ACCESS_KEY` | OSS 访问密钥 |
| `S3_SECRET_KEY` | `S3_SECRET_KEY` | OSS 访问密钥 |
| `S3_ENDPOINT` | `S3_ENDPOINT` | OSS 端点地址 |
| `CDN_PATH_PREFIX` | `CDN_PATH_PREFIX` | CDN 路径前缀（默认 lightdash） |
| `S3_PATH_PREFIX` | `S3_PATH_PREFIX` | 项目标识前缀（用于上传文件，可选） |

**重要说明**：
- **`CDN_BASE_URL` 不在 GitHub Actions 中配置**：在运行时通过后端 API 获取，后端在提供 HTML 时动态注入
- **独立路径前缀**：静态资源使用 `CDN_PATH_PREFIX`（默认 `lightdash`），上传文件使用 `S3_PATH_PREFIX`（可选）
- **GitHub Actions Secrets**：存储在 GitHub 仓库的 Secrets 中，用于 CI/CD 流程（构建前端和上传静态资源到 OSS）
- **运行时环境变量**：存储在部署环境（服务器、Kubernetes、Docker 等）中，用于应用运行
- **两者使用相同的变量名**（如 `S3_BUCKET`、`S3_ACCESS_KEY` 等），值应该保持一致
- **两者是不同的配置位置**，需要分别配置

**如果运行时已有 OSS 配置**：
- GitHub Secrets 中也需要配置相同的 OSS 相关 secrets（使用相同的变量名，如 `S3_BUCKET`、`S3_ACCESS_KEY` 等）
- 即使运行时已有 OSS 配置，GitHub Secrets 中也需要单独配置，因为它们是不同的配置位置

## 注意事项

### 1. CORS 配置

如果 CDN 域名与主站不同，需要在 OSS 中配置 CORS：

```json
{
  "AllowedOrigins": ["https://app.lightdash.com"],
  "AllowedMethods": ["GET", "HEAD", "PUT"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}
```

### 2. HTTPS 要求

- CDN 必须支持 HTTPS
- 建议使用免费 SSL 证书（Let's Encrypt）或 CDN 提供的证书

### 3. 监控和告警

- 监控 CDN 可用性
- 设置告警，CDN 不可用时切换到回退方案

### 4. 版本管理

- 使用语义化版本号
- 保留历史版本一段时间（建议 3-6 个月）
- 定期清理旧版本资源

### 5. 安全考虑

- OSS 访问控制（IP 白名单、Referer 检查等）
- 防止资源盗链
- 定期检查 OSS 配置安全性
- 预签名 URL 设置合理的过期时间

## 总结

本方案统一规划了 Lightdash 的 CDN 和 OSS 改造：

1. 统一存储：使用同一个 OSS Bucket，通过路径前缀区分静态资源和上传文件
2. 独立配置：静态资源使用 `CDN_PATH_PREFIX`（默认 `lightdash`），上传文件使用 `S3_PATH_PREFIX`（可选）
3. 运行时配置：`CDN_BASE_URL` 在运行时通过后端 API 获取，后端在提供 HTML 时动态注入，支持动态切换 CDN
4. 向后兼容：保留后端静态文件服务作为回退机制
5. 版本化管理：支持版本化部署，便于回滚
6. 自动化部署：GitHub Actions 自动构建和上传到 OSS，无需手动操作

## 参考资源

- [Vite 部署指南](https://vitejs.dev/guide/static-deploy.html)
- [阿里云 OSS 文档](https://help.aliyun.com/product/31815.html)
- [AWS CloudFront 文档](https://docs.aws.amazon.com/cloudfront/)
- [HTTP 缓存最佳实践](https://web.dev/http-cache/)
- [S3 预签名 URL 文档](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
