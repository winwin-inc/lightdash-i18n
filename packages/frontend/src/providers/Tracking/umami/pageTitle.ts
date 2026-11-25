/**
 * page 码值 → 中文页名对照。
 *
 * 与 docs/ops/umami-analytics.md §4.4 的码值表保持一致
 * （查询侧 msy-umami-query 的 values.page 用同一套码值）；
 * 查不到回落 page 原值。
 */

const PAGE_TITLES: Record<string, string> = {
    dashboard: '看板详情',
    dashboard_list: '看板列表',
    chart: '图表详情',
    chart_list: '图表列表',
    space: '空间详情',
    space_list: '空间列表',
    explore: '表探索',
    explore_list: '表列表',
    sql_runner: 'SQL 运行器',
    metrics_catalog: '指标目录',
    catalog: '数据目录',
    project_home: '项目首页',
    usage_insights: '使用分析',
    data_apps: '数据应用',
    settings: '设置页',
    create_project: '新建项目',
    login: '登录',
    register: '注册',
    signup: '注册',
    share: '分享',
    embed: '嵌入页',
    minimal: '嵌入页(极简)',
    forbidden: '无权访问',
    other: '其他',
    'verify-email': '邮箱验证',
    'password-recovery': '找回密码',
    'password-reset': '重置密码',
    'join-organization': '加入组织',
};

export const getPageTitle = (page: string): string =>
    PAGE_TITLES[page] ?? page;
