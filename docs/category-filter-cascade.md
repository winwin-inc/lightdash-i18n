# 类目筛选器联动逻辑计划

## 核心思路

**不需要 `isInit` 变量**，首次加载和联动使用同一套逻辑：
- 统一检查当前值是否有效
- 有效则保留，无效则切换到第一个有效值

## 三种场景

### 场景1: 首次加载（看板初始化）
- 看板配置了默认值的类目筛选器
- **期望行为**: 检查当前值是否在权限范围内
  - 在权限内 → 保留当前值
  - 不在权限内 → 切换到第一个有效值

### 场景2: 用户主动切换父级筛选器
- 用户点击父级筛选器的某个值
- **期望行为**: 触发联动，检查子级当前值是否有效
  - 当前值有效 → 保留
  - 当前值无效 → 切换到第一个有效值

### 场景3: 用户手动修改子级筛选器
- 用户手动修改子级的 operator（如 NOT_NULL, NULL）或值
- **期望行为**: 保留用户的设置，不被联动覆盖

## 关键判断逻辑

1. **是否有父级筛选器**
   - 有父级 → 联动逻辑
   - 无父级 → 一级筛选器，检查当前值是否在权限内

2. **父级是否有值**
   - 有值 → 获取子级类目列表
   - 无值 → 获取该层级所有有权限的类目

3. **当前值是否有效**
   - 当前值在权限类目中 → 保留
   - 当前值不在权限类目中 → 切换到第一个有效值

4. **是否用户手动修改**
   - operator === EQUALS → 联动逻辑处理
   - operator !== EQUALS → 保留用户设置

## 核心函数设计

### resolveCategoryFilterValueAsync

```
输入: filter, filters, userCategories, projectUuid, parentValueOverride
输出: resolvedValue (string | undefined)

逻辑:
1. 获取权限类目列表
   - 有父级且父级有值 → 获取子级类目
   - 有父级但父级无值 → 获取该层级所有类目
   - 无父级 → 获取该层级所有类目

2. 与 field/search 取交集

3. 遍历交集，返回第一个在权限内的值
```

### validateCurrentValue

```
输入: currentValue, categoryLabels
输出: boolean

逻辑:
- currentValue 在 categoryLabels 中 → true
- 否则 → false
```

## 需要修改的文件

1. `packages/frontend/src/utils/categoryFilters.ts`
   - 移除 `isInit` 参数
   - 统一联动逻辑处理首次加载和后续联动
   - 确保用户手动修改的值不被覆盖

2. `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx`
   - 移除 `isInit` 参数的传递

## 核心逻辑（统一版本，无需 isInit）

```typescript
for (const filter of filters.dimensions) {
    // 1. 跳过没有配置默认值的 filter（disabled=true）
    if (filter.disabled) continue;

    // 2. 跳过用户手动修改的 filter（非 EQUALS operator）
    if (filter.operator !== FilterOperator.EQUALS) continue;

    // 3. 获取权限类目（与 field/search 取交集）
    //    resolveCategoryFilterValueAsync 会返回：
    //    - 如果当前值在权限内 → 返回当前值
    //    - 如果当前值不在权限内 → 返回第一个有效值
    const resolvedValue = await resolveCategoryFilterValueAsync(...);

    if (!resolvedValue) continue;

    // 4. 比较当前值和 resolvedValue
    const currentValue = filter.values?.[0];
    if (currentValue && String(currentValue) === resolvedValue) {
        continue; // 当前值有效，保留
    }

    // 5. 当前值无效（或没有），切换到 resolvedValue
    hasChanges = true;
    // 更新 filter
}
```

**关键点**：`resolveCategoryFilterValueAsync` 的逻辑需要修正：

当前错误逻辑：
```
1. 取交集
2. 按 search 顺序取交集的第一个 → resolvedValue
3. 比较 currentValue === resolvedValue
```

问题：如果当前值在权限内，但不是 search 的第一个，会被错误切换。

正确逻辑：
```
1. 取交集
2. 先检查当前值是否在交集中 → 在则返回当前值
3. 不在则按 search 顺序取交集的第一个 → resolvedValue
```
```

## 验证方式

1. 首次加载：看板配置了默认值 A，A 在权限内 → 保留 A
2. 首次加载：看板配置了默认值 B，B 不在权限内 → 切换到第一个
3. 用户切换父级：子级当前值有效 → 保留
4. 用户切换父级：子级当前值无效 → 切换到第一个
5. 用户手动修改为 NOT_NULL → 保留 NOT_NULL
