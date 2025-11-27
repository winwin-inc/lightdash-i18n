/**
 * 类目项，从 RPC 接口返回
 */
export type CategoryItem = {
    categoryId: string;
    parentId: string;
    name: string;
    nameProperties: string | null;
    properties: string | null;
    nameEn: string | null;
    level: number;
};

/**
 * JSONRPC 响应格式
 */
export type CategoryRpcResponse = {
    jsonrpc: string;
    id: number;
    result: CategoryItem[];
};

/**
 * 类目树节点
 */
export type CategoryTreeNode = {
    categoryId: string;
    parentId: string;
    name: string;
    nameEn: string | null;
    level: number;
    children?: CategoryTreeNode[];
};

/**
 * 用户类目列表响应
 */
export type UserCategoryList = {
    level1: CategoryTreeNode[];
    level2: CategoryTreeNode[];
    level3: CategoryTreeNode[];
    level4: CategoryTreeNode[];
};
