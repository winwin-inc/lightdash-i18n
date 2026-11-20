import { subject } from '@casl/ability';
import { DownloadFileType } from '@lightdash/common';
import { NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import useUser from '../../hooks/user/useUser';
import { Can } from '../../providers/Ability';
import { Limit, Values } from './types';

type ExportOptionsProps = {
    projectUuid: string;
    fileType: DownloadFileType;
    onFileTypeChange: (value: DownloadFileType) => void;
    values: Values;
    onValuesChange: (value: Values) => void;
    limit: Limit;
    onLimitChange: (value: Limit) => void;
    customLimit: number;
    onCustomLimitChange: (value: number) => void;
    hideLimitSelection?: boolean;
    /**
     * 插入在「限制」选择与自定义条数输入之间的提示内容（如单元格上限告警），
     * 用于保持与图表导出旧布局一致的展示顺序。
     */
    children?: ReactNode;
};

/**
 * 导出选项：文件格式（CSV/XLSX）、值（格式化/原始）、限制（表格/全部/自定义）。
 * 「限制」区域按 ChangeCsvResults 权限展示；提示与告警由调用方通过 children 提供。
 */
const ExportOptions: FC<ExportOptionsProps> = ({
    projectUuid,
    fileType,
    onFileTypeChange,
    values,
    onValuesChange,
    limit,
    onLimitChange,
    customLimit,
    onCustomLimitChange,
    hideLimitSelection = false,
    children,
}) => {
    const { t } = useTranslation();
    const user = useUser(true);

    return (
        <>
            <Stack spacing="xs">
                <Text fw={500}>
                    {t('components_export_results.file_format')}
                </Text>
                <SegmentedControl
                    size={'xs'}
                    value={fileType}
                    onChange={(value) =>
                        onFileTypeChange(value as DownloadFileType)
                    }
                    data={[
                        {
                            label: 'CSV',
                            value: DownloadFileType.CSV,
                        },
                        {
                            label: 'XLSX',
                            value: DownloadFileType.XLSX,
                        },
                    ]}
                />
            </Stack>

            <Stack spacing="xs">
                <Text fw={500}>
                    {t('components_export_results.tabs.values')}
                </Text>
                <SegmentedControl
                    size={'xs'}
                    value={values}
                    onChange={(value) => onValuesChange(value as Values)}
                    data={[
                        {
                            label: t(
                                'components_export_results.radio_groups_values.part_1',
                            ),
                            value: Values.FORMATTED,
                        },
                        {
                            label: t(
                                'components_export_results.radio_groups_values.part_2',
                            ),
                            value: Values.RAW,
                        },
                    ]}
                />
            </Stack>

            <Stack spacing="xs">
                <Can
                    I="manage"
                    this={subject('ChangeCsvResults', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid: projectUuid,
                    })}
                >
                    {!hideLimitSelection ? (
                        <Stack spacing="xs">
                            <Text fw={500}>
                                {t('components_export_results.tabs.limit')}
                            </Text>
                            <SegmentedControl
                                size={'xs'}
                                value={limit}
                                onChange={(value) =>
                                    onLimitChange(value as Limit)
                                }
                                data={[
                                    {
                                        label: t(
                                            'components_export_results.radio_groups_limit.part_1',
                                        ),
                                        value: Limit.TABLE,
                                    },
                                    {
                                        label: t(
                                            'components_export_results.radio_groups_limit.part_2',
                                        ),
                                        value: Limit.ALL,
                                    },
                                    {
                                        label: t(
                                            'components_export_results.radio_groups_limit.part_3',
                                        ),
                                        value: Limit.CUSTOM,
                                    },
                                ]}
                            />
                        </Stack>
                    ) : null}
                </Can>

                {children}

                {limit === Limit.CUSTOM && (
                    <NumberInput
                        w="100%"
                        size="xs"
                        min={1}
                        precision={0}
                        required
                        value={customLimit}
                        onChange={(value) =>
                            onCustomLimitChange(Number(value))
                        }
                    />
                )}
            </Stack>
        </>
    );
};

export default ExportOptions;
