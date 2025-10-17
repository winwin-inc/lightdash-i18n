import {
    friendlyName,
    getFieldLabel,
    WindowFunctionType,
    type TableCalculationTemplate,
} from '@lightdash/common';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useColumns } from '../../../../hooks/useColumns';
import {
    useFormatTemplateType,
    useGetTemplateDescription,
} from '../../utils/templateFormatting';

interface TemplateViewerProps {
    template?: TableCalculationTemplate;
    readOnly: true;
}

export const TemplateViewer: FC<TemplateViewerProps> = ({ template }) => {
    const { t } = useTranslation();
    const columns = useColumns();

    const formatTemplateType = useFormatTemplateType();
    const getTemplateDescription = useGetTemplateDescription();

    if (!template) {
        return (
            <Text c="dimmed" size="sm">
                {t(
                    'features_table_calculation_template_viewer.no_template_available',
                )}
            </Text>
        );
    }

    const getLabel = (fieldId: string) => {
        const field = columns.find((c) => c.id === fieldId)?.meta?.item;

        return field && 'label' in field
            ? getFieldLabel(field)
            : friendlyName(fieldId);
    };

    const fieldLabel =
        'fieldId' in template && template.fieldId !== null
            ? getLabel(template.fieldId)
            : undefined;

    const formatWindowFunction = (windowFunction: WindowFunctionType) => {
        switch (windowFunction) {
            case WindowFunctionType.ROW_NUMBER:
                return 'ROW_NUMBER()';
            case WindowFunctionType.PERCENT_RANK:
                return 'PERCENT_RANK()';
            default:
                return windowFunction;
        }
    };

    return (
        <Stack spacing="md">
            <Stack spacing="xs">
                <Group>
                    <Text fw={600} size="sm">
                        {t('features_table_calculation_template_viewer.type')}:
                    </Text>
                    <Badge color="blue" variant="light">
                        {formatTemplateType(template.type)}
                    </Badge>
                </Group>

                <Text size="sm" c="dimmed">
                    {getTemplateDescription(template.type)}
                </Text>
            </Stack>

            {'windowFunction' in template && (
                <Group>
                    <Text fw={600} size="sm">
                        {t('features_table_calculation_template_viewer.window_function')}:
                    </Text>
                    <Text size="sm">
                        {formatWindowFunction(template.windowFunction)}
                    </Text>
                </Group>
            )}

            {fieldLabel && (
                <Group>
                    <Text fw={600} size="sm">
                        {t('features_table_calculation_template_viewer.field')}:
                    </Text>
                    {fieldLabel}
                </Group>
            )}

            {'orderBy' in template &&
                template.orderBy &&
                template.orderBy.length > 0 && (
                    <Group>
                        <Text fw={600} size="sm">
                            {t(
                                'features_table_calculation_template_viewer.orderBy',
                            )}
                            :
                        </Text>
                        <Text size="sm">
                            {template.orderBy
                                .map(
                                    ({ fieldId, order }) =>
                                        `${getLabel(fieldId)} ${
                                            order?.toUpperCase() || 'ASC'
                                        }`,
                                )
                                .join(', ')}
                        </Text>
                    </Group>
                )}

            {'partitionBy' in template &&
                template.partitionBy &&
                template.partitionBy.length > 0 && (
                    <Group>
                        <Text fw={600} size="sm">
                            {t('features_table_calculation_template_viewer.partition_by')}:
                        </Text>
                        <Text size="sm">
                            {template.partitionBy
                                .map((fieldId) => getLabel(fieldId))
                                .join(', ')}
                        </Text>
                    </Group>
                )}
        </Stack>
    );
};
