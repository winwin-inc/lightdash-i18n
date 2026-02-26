# Vega Spec Label 改写逻辑梳理

## 一、概述

当 Custom Visualization 的 spec 带 `rewrite: true` 时，将 spec 中的**中文/带表名 label**（如 `省份`、`集团`）替换为**当前探索的 fieldId**（如 `ads_province_basetmap_sales_group_top_m_province_name`），以便注入的 `data.values` 能正确绑定到查询结果列。

**改写范围**：仅对来自主数据 `data.name === "values"` 的 layer，或含 lookup from values 的 transform 中的字段引用进行改写，避免误改 URL/内联数据层。

---

## 二、主流程（prepareSpecForVega）

```mermaid
flowchart TD
    A[prepareSpecForVega] --> B{spec 存在?}
    B -->|否| C[返回 undefined]
    B -->|是| D{spec.rewrite === true?}
    D -->|否| E[移除 rewrite 键后返回]
    D -->|是| F{fieldIds.length > 0?}
    F -->|否| E
    F -->|是| G[1. buildMapFromDataKeys 数据列名匹配]
    G --> H[2. buildLabelToFieldIdMap itemsMap 兜底]
    H --> I[3. fillLabelToFieldIdFromSpec 补全]
    I --> J[4. rewriteSpecFieldLabels 递归改写]
    J --> K[5. 移除 rewrite 键]
    K --> L[返回 forVega]
```

---

## 三、labelToFieldId 映射构建优先级

```mermaid
flowchart LR
    subgraph 优先级从高到低
        A[1. buildMapFromDataKeys] --> B[2. itemsMap]
        B --> C[3. fillLabelToFieldIdFromSpec]
    end
    A --> A1[ref 精确匹配 fieldIds]
    A --> A2[ref 后缀匹配 id.endsWith]
    B --> B1[getItemLabelWithoutTableName]
    B --> B2[getItemLabel 带表名]
    C --> C1[1:1 补全 数量相等]
    C --> C2[后缀匹配补全]
```

| 步骤 | 函数                       | 说明                                                                      |
| ---- | -------------------------- | ------------------------------------------------------------------------- |
| 1    | buildMapFromDataKeys       | spec 中收集的 ref 与 fieldIds 精确/后缀匹配，排除 `as` 计算字段           |
| 2    | buildLabelToFieldIdMap     | 用 itemsMap 建立 label → fieldId，需 spec 中 label 与 explore schema 一致 |
| 3    | fillLabelToFieldIdFromSpec | 未映射的 ref 与 fieldIds 按 1:1 或后缀补全                                |

---

## 四、Values 上下文判定

**改写只在「values 上下文」中进行**，避免误改内联/URL 数据层。

```mermaid
flowchart TD
    subgraph values 上下文
        A[data.name === 'values' 的 layer]
        B[transform 数组中有 lookup from values]
    end
    subgraph 非 values 上下文
        C[data.url 的 layer]
        D[data.values 内联数据]
    end
```

| 场景                                                                                     | 是否改写 |
| ---------------------------------------------------------------------------------------- | -------- |
| `data: { name: "values" }` 的 layer                                                      | ✅       |
| `data: { url: "..." }` 的 layer 中，含 lookup `from.data.name === "values"` 的 transform | ✅       |
| `data: { values: [...] }` 内联数据                                                       | ❌       |

---

## 五、collectSpecFieldRefNamesInValuesContext 收集流程

收集 spec 中**在 values 上下文内**的字段引用名，供 buildMapFromDataKeys 和 fillLabelToFieldIdFromSpec 使用。

```mermaid
flowchart TD
    A[walk 遍历 spec] --> B{是数组?}
    B -->|是| C{含 lookup from values?}
    C -->|是| D[effectiveContext = true]
    D --> E[递归 walk 每项]
    B -->|否| F{是对象?}
    F -->|是| G{raw.data 存在?}
    G -->|是| H{data.name === values?}
    H -->|是| I[ctx = true]
    H -->|否| J[ctx = false]
    G -->|否| K[保持 ctx]
    I --> L[若 ctx 则收集 ref]
    L --> M[field / key / pivot / value 字符串]
    L --> N[fields / groupby / row / column / layer 中的字符串]
    L --> O[default 对象的 key]
    L --> P[calculate / filter / test / expr 中的 datum 引用]
    L --> Q[symbolOpacity.expr 中的 datum 引用]
```

---

## 六、rewriteSpecRecursive 改写流程

```mermaid
flowchart TD
    A[rewriteSpecRecursive obj] --> B{obj 类型?}
    B -->|null/基本类型| C[原样返回]
    B -->|数组| D{含 lookup from values?}
    D --> E[effectiveContext]
    E --> F[对每项递归 rewriteSpecRecursive]
    B -->|对象| G[useValuesHere = inValuesContext 或 data 为 values 或 isLookupFromValues]
    G --> H[遍历对象的每个 key]
    H --> I{key 类型?}
    I -->|as| J[不改写 原样]
    I -->|field/key/pivot/value| K{useValuesHere 且值在 map?}
    K -->|是| L[替换为 fieldId]
    K -->|否| M[保持原值]
    I -->|fields/groupby| N{useValuesHere?}
    N -->|是| O[对字符串替换]
    N -->|否| P[保持原值]
    I -->|row/column/layer| Q{元素类型?}
    Q -->|字符串| R[useValuesHere 则替换]
    Q -->|对象| S[递归 rewriteSpecRecursive]
    I -->|default| T[对 default 的 key 替换 对 value 递归]
    I -->|calculate/filter/test/expr| U{useValuesHere?}
    U -->|是| V[rewriteExpression datum 替换]
    U -->|否| W[保持原值]
    I -->|其他| X[递归 rewriteSpecRecursive]
```

### 改写的键与不改写的键

| 改写                                             | 不改写                                       |
| ------------------------------------------------ | -------------------------------------------- |
| field, key, fields, groupby, default 的 key      | as（计算字段名）                             |
| pivot, value                                     | encoding.condition.value（字面量如 "white"） |
| row, column, layer（元素为字符串时）             |                                              |
| calculate / filter / test / expr 中的 datum 引用 |                                              |
| default 对象的 key                               |                                              |
| symbolOpacity.expr                               |                                              |

---

## 七、rewriteExpression 表达式改写

对 `calculate`、`filter`、`test`、`expr` 中的字符串进行 datum 引用替换：

| 模式             | 示例                                               |
| ---------------- | -------------------------------------------------- |
| `datum["label"]` | `datum["省份"]` → `datum["ads_..._province_name"]` |
| `datum['label']` | `datum['集团']` → `datum['ads_..._group_name']`    |
| `datum.label`    | 仅当 label 为合法标识符时                          |

---

## 八、数据流与调用关系

```mermaid
flowchart TB
    subgraph 输入
        IN1[spec with rewrite: true]
        IN2[itemsMap]
        IN3[fieldIds]
    end

    subgraph prepareSpecForVega
        P1[buildMapFromDataKeys]
        P2[buildLabelToFieldIdMap]
        P3[fillLabelToFieldIdFromSpec]
        P4[rewriteSpecFieldLabels]
    end

    subgraph buildMapFromDataKeys 依赖
        B1[collectAsFieldNames]
        B2[collectSpecFieldRefNamesInValuesContext]
    end

    subgraph rewriteSpecFieldLabels
        R1[rewriteSpecRecursive]
        R2[rewriteExpression]
    end

    IN1 --> P1
    IN2 --> P2
    IN3 --> P1
    IN3 --> P2
    IN3 --> P3

    P1 --> P2
    P2 --> P3
    P3 --> P4

    P1 --> B1
    P1 --> B2
    P4 --> R1
    R1 --> R2
```

---

## 九、关键设计点

1. **仅改 values 上下文**：`data.url`、内联 `data.values` 的 layer 不参与改写，避免破坏 topojson、静态数据等。
2. **lookup 传播上下文**：含 `from.data.name === "values"` 的 lookup transform 会使整个 transform 数组及其子节点进入 values 上下文。
3. **layer 递归**：`layer` 是对象数组，需对每个 layer 递归改写，不能像 `fields`/`groupby` 那样只做字符串替换。
4. **计算字段排除**：`as` 产生的字段名（market_share、brand_name 等）不参与映射，避免误改写。
5. **映射优先级**：数据列名 → itemsMap → fill 补全，保证 explore 的 label 与 spec 一致时 itemsMap 能正确映射。
