# 分支管理

## 一、分支说明

- `main`: 主分支，包含当前项目的所有功能
- `dev`: 开发分支，用于日常开发
- `feat/xxx`: 功能分支
  - 基于 dev 分支创建
  - 用于开发具体功能模块
  - 开发完成后合并回 dev 分支
- `upstream/<上游仓库名>`: 上游同步分支（若需要从外部仓库同步）
  - 该分支从上游仓库拉取更新
  - 定期将需要的更新合并到 main 分支

## 二、开发流程

### 1. 开发分支

基于 dev 分支开发，开发完成后合并到 main 分支：

```bash
git checkout dev
```

### 2. 功能分支

基于 dev 分支创建新功能分支，开发完成后合并回 dev 分支：

```bash
git checkout -b feat/xxx
```

## 三、上游项目管理

### 1. 配置上游仓库

```bash
git remote add upstream <上游仓库 URL>
git fetch upstream
```

### 2. 同步流程
   
1. 切换到上游分支（分支名以实际为准）：

   ```bash
   git checkout upstream/<上游分支名>
   ```

2. 同步上游更新并强制覆盖本地分支：

   ```bash
   git fetch upstream
   git reset --hard upstream/main
   ```

3. 合并到开发分支：

   ```bash
   git checkout dev
   git merge upstream/<上游分支名>
   # 在 dev 分支进行充分测试
   ```

3. 确认无误后合并到主分支：

   ```bash
   git checkout main
   git merge dev
   ```
