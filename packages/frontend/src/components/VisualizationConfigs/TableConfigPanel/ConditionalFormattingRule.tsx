import {
    FilterType,
    type ConditionalFormattingWithConditionalOperator,
    type ConditionalOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Collapse,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import FilterInputComponent from '../../common/Filters/FilterInputs';
import { useFilterOperatorOptions } from '../../common/Filters/FilterInputs/utils';
import MantineIcon from '../../common/MantineIcon';

// conditional formatting only supports number filters
const filterType = FilterType.NUMBER;

interface ConditionalFormattingRuleProps {
    isDefaultOpen?: boolean;
    ruleIndex: number;
    rule: ConditionalFormattingWithConditionalOperator;
    field: FilterableItem;
    hasRemove?: boolean;
    onChangeRule: (
        newRule: ConditionalFormattingWithConditionalOperator,
    ) => void;
    onChangeRuleOperator: (newOperator: ConditionalOperator) => void;
    onRemoveRule: () => void;
}

const ConditionalFormattingRule: FC<ConditionalFormattingRuleProps> = ({
    isDefaultOpen = true,
    ruleIndex,
    rule,
    field,
    onChangeRule,
    onChangeRuleOperator,
    onRemoveRule,
    hasRemove,
}) => {
    const { t } = useTranslation();
    const { ref, hovered } = useHover();
    const [isOpen, setIsOpen] = useState(isDefaultOpen);

    const getFilterOperatorOptions = useFilterOperatorOptions();
    const filterOperatorOptions = getFilterOperatorOptions(filterType);

    return (
        <Stack spacing="xs" ref={ref}>
            <Group noWrap position="apart">
                <Group spacing="xs">
                    <Text fw={500} fz="xs">
                        {t(
                            'components_visualization_configs_table.formatting_rule.condition',
                        )}{' '}
                        {ruleIndex + 1}
                    </Text>

                    {hasRemove && hovered && (
                        <Tooltip
                            variant="xs"
                            label={t(
                                'components_visualization_configs_table.formatting_rule.remove_condition',
                            )}
                            position="left"
                            withinPortal
                        >
                            <ActionIcon onClick={onRemoveRule}>
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>

                <ActionIcon onClick={() => setIsOpen(!isOpen)} size="sm">
                    <MantineIcon
                        icon={isOpen ? IconChevronUp : IconChevronDown}
                    />
                </ActionIcon>
            </Group>

            <Collapse in={isOpen}>
                <Group noWrap spacing="xs">
                    <Select
                        value={rule.operator}
                        data={filterOperatorOptions}
                        onChange={(value) => {
                            if (!value) return;
                            onChangeRuleOperator(value as ConditionalOperator);
                        }}
                    />

                    <FilterInputComponent
                        filterType={filterType}
                        field={field}
                        rule={rule}
                        onChange={onChangeRule}
                    />
                </Group>
            </Collapse>
        </Stack>
    );
};

export default ConditionalFormattingRule;
