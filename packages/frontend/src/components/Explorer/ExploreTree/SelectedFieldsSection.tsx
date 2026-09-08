import { type FilterableField } from '@lightdash/common';
import { Badge, Box, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { type NodeItem } from './TableTree/Tree/types';

export type SelectedField = {
    fieldId: string;
    /** Distinguishes the same field selected in both merge sources. */
    selectionKey?: string;
    item: NodeItem;
    tableLabel: string | null;
    isDimension: boolean;
    onDeselect?: (fieldId: string, isDimension: boolean) => void;
    hideActions?: boolean;
    onAddFilter?: (field: FilterableField) => void;
    isFiltered?: boolean;
    basicActionsOnly?: boolean;
};

/**
 * Lightweight selected-fields strip for merge setup. Upstream's full section
 * (custom-metric menus, exit animation) is not ported; deselect is enough
 * for the warehouse merge configure loop.
 */
const SelectedFieldsSection: FC<{
    fields: SelectedField[];
    onDeselect: (fieldId: string, isDimension: boolean) => void;
    heading?: string;
    showAllFieldsDivider?: boolean;
}> = memo(({ fields, heading, onDeselect }) => {
    if (fields.length === 0) return null;

    return (
        <Stack spacing="xs" mb="sm">
            {heading && (
                <Text size="xs" color="dimmed" fw={600}>
                    {heading}
                </Text>
            )}
            <Stack spacing={4}>
                {fields.map((field) => (
                    <Group
                        key={field.selectionKey ?? field.fieldId}
                        position="apart"
                        noWrap
                        spacing="xs"
                    >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Text size="sm" truncate>
                                {'label' in field.item && field.item.label
                                    ? field.item.label
                                    : field.item.name}
                            </Text>
                            {field.tableLabel && (
                                <Text size="xs" color="dimmed" truncate>
                                    {field.tableLabel}
                                </Text>
                            )}
                        </Box>
                        <Badge size="xs" variant="outline">
                            {field.isDimension ? 'dim' : 'metric'}
                        </Badge>
                        <UnstyledButton
                            onClick={() => {
                                const deselect =
                                    field.onDeselect ?? onDeselect;
                                deselect(field.fieldId, field.isDimension);
                            }}
                            aria-label={`Remove ${field.fieldId}`}
                        >
                            <MantineIcon icon={IconX} size={14} />
                        </UnstyledButton>
                    </Group>
                ))}
            </Stack>
        </Stack>
    );
});

SelectedFieldsSection.displayName = 'SelectedFieldsSection';

export default SelectedFieldsSection;
