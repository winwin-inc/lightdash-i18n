import { subject } from '@casl/ability';
import { useMemo } from 'react';

import useUser from '../../hooks/user/useUser';
import { useProject } from '../../hooks/useProject';
import { Limit } from './types';

type ExportLimitDefaults = {
    /** 用户能否调整导出条数（决定「限制」选择是否展示） */
    canChangeCsvResults: boolean;
    /** 默认导出条数 */
    defaultLimit: Limit;
};

/**
 * 导出条数的默认值：
 * 客户端模式（isClientUse）下没有 ChangeCsvResults 权限的用户看不到「限制」选项，
 * 此时默认导出所有结果；其余情况默认导出表格结果。
 */
export const useExportLimitDefaults = (
    projectUuid: string,
): ExportLimitDefaults => {
    const user = useUser(true);
    const { data: project } = useProject(projectUuid);

    // Check if user has permission to change CSV results limit
    const canChangeCsvResults =
        user.data?.ability?.can(
            'manage',
            subject('ChangeCsvResults', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            }),
        ) ?? false;

    const isClientUse = project?.isClientUse ?? false;

    const defaultLimit = useMemo(() => {
        if (isClientUse && !canChangeCsvResults) {
            // User mode without permission to see limit options, default to all results
            return Limit.ALL;
        }
        // User can see limit options, default to table results
        return Limit.TABLE;
    }, [isClientUse, canChangeCsvResults]);

    return { canChangeCsvResults, defaultLimit };
};
