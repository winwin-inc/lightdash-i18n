# 分支管理

## 一、分支说明

- `main`: 主分支，包含当前项目的所有功能
- `dev`: 开发分支，用于日常开发
- `feat/xxx`: 功能分支
  - 基于 dev 分支创建
  - 用于开发具体功能模块
  - 开发完成后合并回 dev 分支
- `upstream/lightdash`: 上游项目同步分支
  - 其中 lightdash 为上游项目名称
  - 该分支直接从 [上游项目地址](https://github.com/lightdash/lightdash) 同步
  - 定期将更新合并到 main 分支

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

### 1. 配置上游项目

```bash
git remote add upstream https://github.com/lightdash/lightdash.git
git fetch upstream
```

### 2. 同步流程
   
1. 切换到上游项目分支：

   ```bash
   git checkout upstream/lightdash
   ```

2. 同步上游项目更新, 并强制覆盖本地分支：

   ```bash
   git fetch upstream
   git reset --hard upstream/main
   ```

2. 合并到开发分支：

   ```bash
   git checkout dev
   git merge upstream/lightdash
   # 在 dev 分支进行充分测试
   ```

3. 确认无误后合并到主分支：

   ```bash
   git checkout main
   git merge dev
   ```
