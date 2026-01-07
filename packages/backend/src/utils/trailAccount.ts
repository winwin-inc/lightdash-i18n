import { lightdashConfig } from '../config/lightdashConfig';

/**
 * 生成体验账户看板访问链接
 * @param projectUuid 项目 UUID
 * @param dashboardUuid 看板 UUID
 * @param mode 看板模式（view/edit），默认为 'view'
 * @param tabUuid 看板标签页 UUID（可选）
 * @returns 带有 ?trial=true 参数的完整看板 URL
 */
export const getTrialDashboardUrl = (
    projectUuid: string,
    dashboardUuid: string,
    mode: 'view' | 'edit' = 'view',
    tabUuid?: string,
): string => {
    const baseUrl = lightdashConfig.siteUrl;
    let path = `/projects/${projectUuid}/dashboards/${dashboardUuid}`;

    if (mode) {
        path += `/${mode}`;
    }

    if (tabUuid) {
        path += `/tabs/${tabUuid}`;
    }

    // 添加 trial=true 参数
    return `${baseUrl}${path}?trial=true`;
};

