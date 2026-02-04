# Lightdash CDN + OSS 改造技术方案

## 目标

将 Lightdash 前端静态资源迁移到 CDN，优化文件上传流程。

## 当前问题

1. **静态资源加载慢**：所有 JS/CSS/图片请求都经过后端服务器，缓存策略不允许 CDN 缓存
2. **文件上传效率低**：文件需要先上传到后端服务器，再转发到 OSS，占用服务器资源

## 解决方案

### 架构设计

**统一存储方案**：使用同一个 OSS Bucket，通过路径前缀区分静态资源和用户上传文件

```
OSS Bucket
├── {CDN_PATH_PREFIX}/static/{version}/    # 静态资源（前端构建产物）
│   ├── index.html
│   ├── assets/
│   └── ...
│
└── {S3_PATH_PREFIX}/uploads/            # 用户上传文件
    └── {userUuid}/{fileId}/
```

**关键设计决策**：

- **独立配置**：静态资源使用 `CDN_PATH_PREFIX`（默认 `msy-x`），上传文件使用 `S3_PATH_PREFIX`
- **运行时配置**：`CDN_BASE_URL` 在运行时通过后端 API 获取，不在构建时写入
- 版本化部署：`static/v1.2.3/`，支持多版本共存和快速回滚
- 保留后端静态文件服务作为回退机制

### 运行流程

#### 静态资源部署流程

```
开发者推送 git tag (v1.2.3)
    ↓
GitHub Actions 自动触发
    ↓
构建前端（设置 CDN 地址）
    ↓
上传静态资源到 CDN
    ↓
构建 Docker 镜像
    ↓
部署完成
```

**关键点**：

- 完全自动化，无需手动操作
- 使用 git tag 作为版本号
- 本地开发不受影响，继续使用本地服务器

#### 文件上传流程

**优化前（当前方式）**：

```
用户选择文件
    ↓
前端上传 → 后端服务器（占用服务器带宽和资源）
    ↓
后端转发 → OSS
    ↓
上传完成
```

**优化后（前端直传）**：

```
用户选择文件
    ↓
前端请求预签名 URL（后端 API，仅返回 URL，不传输文件）
    ↓
后端生成预签名 URL（包含权限和过期时间）
    ↓
前端直接上传到 OSS（不经过后端服务器）
    ↓
上传完成
```

## 技术方案

### 配置要求

#### 配置位置说明

**重要**：GitHub Actions Secrets 和运行时环境变量是**两个不同的配置位置**，需要分别配置：

1. **GitHub Actions Secrets**：存储在 GitHub 仓库的 Secrets 中，用于 CI/CD 流程（构建前端和上传静态资源到 CDN）
2. **运行时环境变量**：存储在部署环境（服务器、Kubernetes、Docker 等）中，用于应用运行

**两者使用相同的变量名**（如 `S3_BUCKET`、`S3_ACCESS_KEY` 等），值应该保持一致，但需要在不同位置分别配置。

#### GitHub Actions Secrets（CI/CD 配置）

**配置位置**：GitHub 仓库 → Settings → Secrets and variables → Actions

**不需要配置 `CDN_BASE_URL`**：CDN 地址在运行时通过后端 API 获取，不在构建时写入。

**需要配置**（用于上传静态资源到 OSS）：

- `S3_BUCKET`：OSS Bucket 名称
- `S3_ACCESS_KEY`：OSS AccessKey ID
- `S3_SECRET_KEY`：OSS AccessKey Secret
- `S3_ENDPOINT`：OSS 端点地址
- `CDN_PATH_PREFIX`：CDN 路径前缀（默认 `msy-x`，用于静态资源路径）
- `S3_REGION`：OSS 区域（AWS S3 需要）

**重要说明**：

- **上传时不需要加速域名**：上传是直接到 OSS 的（使用 `S3_ENDPOINT`），不经过 CDN
- **`CDN_BASE_URL` 不在 GitHub Actions 中配置**：在运行时通过后端 API 获取

**可选**：

- `CDN_PROVIDER`：CDN 提供商（默认 `aliyun`，可选值：`aliyun`、`aws`）

#### 项目运行时环境变量（容器中）

**最小配置**（如果已有 OSS 配置，只需新增 CDN 配置）：

```bash
# CDN 配置（新增，必需）
CDN_BASE_URL=https://cdn.example.com    # CDN 域名（不包含路径前缀）
CDN_PATH_PREFIX=msy-x                    # CDN 路径前缀（可选，默认 msy-x）
STATIC_FILES_VERSION=v1.2.3              # 静态资源版本（可选，可用 git tag 自动获取）
# 后端会自动拼接为：https://cdn.example.com/msy-x/static/v1.2.3/
```

**完整配置**（如果未配置 OSS）：

```bash
# OSS 配置
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
S3_BUCKET=lightdash-prod
S3_REGION=cn-hangzhou
S3_ACCESS_KEY=your-access-key-id
S3_SECRET_KEY=your-access-key-secret
S3_PATH_PREFIX=msy-x  # 项目标识前缀（用于上传文件，可选）

# CDN 配置（新增，必需）
CDN_BASE_URL=https://cdn.example.com    # CDN 域名（不包含路径前缀）
CDN_PATH_PREFIX=msy-x                    # CDN 路径前缀（用于静态资源，可选，默认 msy-x）
STATIC_FILES_VERSION=v1.2.3              # 静态资源版本（可选）
# 后端会自动拼接为：https://cdn.example.com/msy-x/static/v1.2.3/

# 可选：后端回退机制配置
STATIC_FILES_ENABLED=true  # 默认 true，CDN 不可用时使用后端服务
```

#### 配置对应关系

| GitHub Actions Secret | 运行时环境变量    | 用途                                           |
| --------------------- | ----------------- | ---------------------------------------------- |
| **不需要**            | `CDN_BASE_URL`    | CDN 域名（不包含路径前缀，运行时后端自动拼接） |
| `S3_BUCKET`           | `S3_BUCKET`       | OSS Bucket 名称（上传时使用）                  |
| `S3_ACCESS_KEY`       | `S3_ACCESS_KEY`   | OSS 访问密钥（上传时使用）                     |
| `S3_SECRET_KEY`       | `S3_SECRET_KEY`   | OSS 访问密钥（上传时使用）                     |
| `S3_ENDPOINT`         | `S3_ENDPOINT`     | OSS 端点地址（上传时使用）                     |
| `CDN_PATH_PREFIX`     | `CDN_PATH_PREFIX` | CDN 路径前缀（静态资源路径，默认 msy-x）       |
| `S3_PATH_PREFIX`      | `S3_PATH_PREFIX`  | 项目标识前缀（上传文件路径，可选）             |
| `S3_REGION`           | `S3_REGION`       | OSS 区域（AWS S3 需要，上传时使用）            |

**配置要点**：

- **`CDN_BASE_URL` 只在运行时配置**：通过后端 API 返回给前端，不在构建时写入
- **独立配置**：`CDN_PATH_PREFIX` 用于静态资源路径，`S3_PATH_PREFIX` 用于上传文件路径
- GitHub Actions Secrets 和运行时环境变量使用**相同的变量名**（除了 `CDN_BASE_URL`）
- 两者的值应该保持一致
- 需要在两个不同的位置分别配置
- 如果运行时已有 OSS 配置，GitHub Secrets 中也需要配置相同的值（用于 CI/CD 上传静态资源）

### 实施要点

1. **后端改造**：

   - 扩展 S3Client：添加预签名上传 URL 生成功能
   - 创建 OSS Service 和 Controller：提供文件上传 API
   - 修改静态资源服务：支持条件性启用（回退机制）

2. **前端改造**：

   - 修改前端：运行时通过后端 API 获取 CDN base URL，动态设置资源路径
   - 创建 OSS 上传工具：实现前端直传功能

3. **构建和部署**：
   - 创建 CDN 上传脚本：支持阿里云 OSS 和 AWS S3
   - 更新 GitHub Actions：在 Docker 构建前自动上传静态资源

### 兼容性保证

- 保留后端静态文件服务，CDN 不可用时自动回退
- 可以通过环境变量控制是否启用 CDN
- 开发环境不受影响，继续使用本地开发服务器

## 关键决策点

1. **独立路径前缀**：静态资源使用 `CDN_PATH_PREFIX`（默认 `msy-x`），上传文件使用 `S3_PATH_PREFIX`，两者独立配置
2. **运行时配置**：`CDN_BASE_URL` 在运行时通过后端 API 获取，不在构建时写入，支持动态切换 CDN
3. **后端回退机制**：必须保留，确保 CDN 不可用时自动回退
4. **版本管理**：使用 git tag 作为版本号，与 Docker 镜像版本一致，支持多版本共存和快速回滚
