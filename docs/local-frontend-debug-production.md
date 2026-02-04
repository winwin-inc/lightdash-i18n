# 本地前端调试线上环境配置指南

## 概述

本指南说明如何使用本地前端代码连接线上后端环境，方便调试线上数据问题。

## 工作原理

使用 Vite 的 proxy 功能，将本地前端的 API 请求代理到线上后端：

- 本地前端运行在 `http://localhost:3000`
- API 请求（`/api/*`）通过 proxy 转发到线上后端
- Cookie 会自动转发，保持登录状态

## 配置步骤

### 1. 创建环境变量文件

在 `packages/frontend/` 目录下创建 `.env.development.local` 文件：

```bash
# 连接到线上预览环境
VITE_PROXY_TARGET=https://x.pre.banmahui.cn
```

**注意**：

- `.env.development.local` 文件不会被提交到 git（已在 .gitignore 中）
- 可以参考 `packages/frontend/.env.development.local.example` 示例文件
- 每个开发者可以配置自己的环境
- 修改后需要重启 Vite dev server

**快速开始**：

```bash
# 复制示例文件
cp packages/frontend/.env.development.local.example packages/frontend/.env.development.local

# 编辑文件，设置 VITE_PROXY_TARGET
# 然后启动前端
pnpm -F frontend dev
```

### 2. 获取线上环境的 Cookie

#### 方法 A：自动获取（推荐）

1. 在浏览器中访问线上环境：`https://x.pre.banmahui.cn`
2. 正常登录
3. 浏览器会自动保存 `connect.sid` Cookie
4. 启动本地前端后，proxy 会自动转发这个 Cookie

#### 方法 B：手动复制（如果自动获取失败）

1. 在浏览器中访问线上环境并登录
2. 打开开发者工具 → Application/Storage → Cookies → `https://x.pre.banmahui.cn`
3. 找到 `connect.sid` Cookie，复制其值
4. 使用浏览器插件（如 EditThisCookie）在 `localhost:3000` 添加 Cookie：
   - Name: `connect.sid`
   - Value: （复制的值）
   - Domain: `localhost`
   - Path: `/`
   - HttpOnly: 取消勾选（浏览器限制）
   - Secure: 取消勾选（本地是 HTTP）
   - SameSite: `Lax`

### 3. 启动本地前端

```bash
# 进入前端目录
cd packages/frontend

# 启动开发服务器
pnpm dev
```

### 4. 访问本地前端

打开浏览器访问：`http://localhost:3000`

所有 API 请求会自动代理到线上后端，Cookie 会自动转发。

## 环境变量说明

### VITE_PROXY_TARGET

**说明**：指定后端 API 的代理目标地址

**示例**：

```bash
# 本地后端（默认，不设置时使用）
# VITE_PROXY_TARGET=http://localhost:8080

# 线上预览环境
VITE_PROXY_TARGET=https://x.pre.banmahui.cn

# 线上生产环境（谨慎使用）
# VITE_PROXY_TARGET=https://x.prod.banmahui.cn
```

**默认值**：如果不设置，会使用 `http://localhost:${BE_PORT}`（通常是 8080）

## 切换环境

### 切换到本地后端

```bash
# 方法 1：删除或注释掉 VITE_PROXY_TARGET
# VITE_PROXY_TARGET=https://x.pre.banmahui.cn

# 方法 2：设置为本地后端
VITE_PROXY_TARGET=http://localhost:8080
```

### 切换到不同线上环境

```bash
# 预览环境
VITE_PROXY_TARGET=https://x.pre.banmahui.cn

# 生产环境（谨慎使用）
VITE_PROXY_TARGET=https://x.prod.banmahui.cn
```

修改后需要重启 Vite dev server。

## 常见问题

### 1. 启动失败（Exit status 1）

**原因**：可能是依赖问题或配置错误

**解决方案**：

1. 确保使用 `pnpm` 而不是 `npm`：

   ```bash
   # 安装依赖
   pnpm install

   # 启动前端
   pnpm -F frontend dev
   ```

2. 检查 `.env.development.local` 文件格式：

   - 确保文件在 `packages/frontend/` 目录下
   - 确保没有多余的空格或特殊字符
   - 确保 URL 格式正确（包含 `http://` 或 `https://`）

3. 清除缓存重新启动：

   ```bash
   cd packages/frontend
   rm -rf node_modules/.vite
   pnpm dev
   ```

4. 检查控制台输出，查看具体的错误信息

### 2. Cookie 无法自动转发

**原因**：

- Cookie 的 `SameSite` 设置为 `Strict`
- Cookie 的 `domain` 设置为特定域名

**解决方案**：

- 使用浏览器插件手动复制 Cookie（见方法 B）
- 或者联系后端开发者调整 Cookie 配置（开发环境可以放宽限制）

### 3. 401 Unauthorized 错误

**原因**：Cookie 过期或无效

**解决方案**：

1. 重新在线上环境登录
2. 更新本地 Cookie（使用浏览器插件）
3. 刷新页面

### 4. CORS 错误

**原因**：虽然使用了 proxy，但某些情况下仍可能出现 CORS 问题

**解决方案**：

- Vite proxy 应该自动处理 CORS
- 如果仍有问题，检查后端 CORS 配置

### 5. WebSocket 连接失败

**原因**：WebSocket 请求可能需要特殊配置

**解决方案**：

- 当前配置已支持 WebSocket
- 如果仍有问题，可能需要额外配置

### 6. 环境变量不生效

**原因**：Vite 需要重启才能读取新的环境变量

**解决方案**：

1. 停止当前的 dev server（Ctrl+C）
2. 修改 `.env.development.local` 文件
3. 重新启动：`pnpm -F frontend dev`
4. 检查控制台输出，确认 proxy target 正确

## 安全注意事项

1. **不要提交 Cookie 到代码库**：`.env.development.local` 文件已在 `.gitignore` 中
2. **不要分享生产环境 Cookie**：生产环境的 Cookie 包含敏感信息
3. **仅在开发环境使用**：此配置仅用于本地开发调试
4. **及时清理 Cookie**：调试完成后，建议清理本地 Cookie

## 调试技巧

### 查看代理请求

1. 打开浏览器开发者工具 → Network 标签
2. 查看请求的 URL，应该是 `http://localhost:3000/api/...`
3. 查看请求头，应该包含 `Cookie: connect.sid=...`
4. 查看响应，确认数据来自线上环境

### 验证连接

访问 `http://localhost:3000`，检查：

1. 页面是否正常加载
2. 用户信息是否正确（来自线上环境）
3. 数据是否正确（来自线上数据库）

## 示例配置

### 示例 1：连接预览环境

`.env.development.local`:

```bash
VITE_PROXY_TARGET=https://x.pre.banmahui.cn
```

### 示例 2：连接生产环境（谨慎使用）

`.env.development.local`:

```bash
VITE_PROXY_TARGET=https://x.prod.banmahui.cn
```

### 示例 3：使用本地后端（默认）

`.env.development.local`:

```bash
# 不设置 VITE_PROXY_TARGET，或设置为空
# VITE_PROXY_TARGET=http://localhost:8080
```

## 相关文件

- `packages/frontend/vite.config.ts` - Vite 配置，包含 proxy 设置
- `packages/frontend/.env.development.local` - 本地环境变量（不提交到 git）
- `packages/frontend/.env.development.local.example` - 示例配置文件
