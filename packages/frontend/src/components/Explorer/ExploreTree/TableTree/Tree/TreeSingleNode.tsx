import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    isTableCalculation,
    isTimeInterval,
    timeFrameConfigs,
    type AdditionalMetric,
    type Item,
} from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Highlight,
    HoverCard,
    NavLink,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconFilter } from '@tabler/icons-react';
import { darken, lighten } from 'polished';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { getItemBgColor } from '../../../../../hooks/useColumns';
import { useFilters } from '../../../../../hooks/useFilters';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import FieldIcon from '../../../../common/Filters/FieldIcon';
import MantineIcon from '../../../../common/MantineIcon';
import { ItemDetailMarkdown, ItemDetailPreview } from '../ItemDetailPreview';
import { useItemDetail } from '../useItemDetails';
import TreeSingleNodeActions from './TreeSingleNodeActions';
import { type Node } from './types';
import { useTableTreeContext } from './useTableTree';

type Props = {
    node: Node;
};

const TreeSingleNode: FC<Props> = ({ node }) => {
    const { t } = useTranslation();

    const {
        itemsMap,
        selectedItems,
        isSearching,
        searchResults,
        searchQuery,
        missingCustomMetrics,
        missingCustomDimensions,
        onItemClick,
    } = useTableTreeContext();
    const { isFilteredField } = useFilters();
    const { showItemDetail } = useItemDetail();

    const { addFilter } = useFilters();
    const { track } = useTracking();

    const [isHover, toggleHover] = useToggle(false);
    const [isMenuOpen, toggleMenu] = useToggle(false);

    const isSelected = selectedItems.has(node.key);
    const isVisible = !isSearching || searchResults.has(node.key);

    const item = itemsMap[node.key];

    if (!item || !isVisible) return null;

    const timeIntervalLabel =
        isDimension(item) &&
        item.timeInterval &&
        isTimeInterval(item.timeInterval)
            ? timeFrameConfigs[item.timeInterval].getLabel()
            : undefined;

    const isFiltered = isField(item) && isFilteredField(item);

    const label =
        isField(item) || isAdditionalMetric(item)
            ? timeIntervalLabel || item.label || item.name
            : item.name;

    const isMissing =
        (isAdditionalMetric(item) &&
            missingCustomMetrics &&
            missingCustomMetrics.includes(item)) ||
        (isCustomDimension(item) &&
            missingCustomDimensions &&
            missingCustomDimensions.includes(item));

    const description = isField(item) ? item.description : undefined;

    const bgColor = getItemBgColor(item);

    // TODO: Add getFieldType function to common which should return FieldType enum (which should also have CUSTOM_METRIC, CUSTOM_DIMENSION)
    const getFieldIconColor = (field: Item | AdditionalMetric) => {
        if (isCustomDimension(field) || isDimension(field)) return 'blue.9';
        if (isAdditionalMetric(field)) return 'yellow.9';
        if (isTableCalculation(field)) return 'green.9';
        if (isMetric(field)) return 'yellow.9';

        return 'yellow.9';
    };

    /**
     * Handles putting together and opening the shared modal for a field's
     * detailed description.
     */
    const onOpenDescriptionView = () => {
        toggleHover(false);

        showItemDetail({
            header: (
                <Group>
                    <FieldIcon
                        item={item}
                        color={getFieldIconColor(item)}
                        size="md"
                    />
                    <Text size="md">{label}</Text>
                </Group>
            ),
            detail: description ? (
                <ItemDetailMarkdown source={description}></ItemDetailMarkdown>
            ) : (
                <Text color="gray">
                    {t(
                        'components_explorer_table_tree_single_node.no_availailable',
                    )}
                </Text>
            ),
        });
    };

    const onToggleMenu = () => {
        toggleHover(false);
        toggleMenu();
    };

    return (
        <NavLink
            component="div"
            noWrap
            sx={{
                backgroundColor: isSelected ? bgColor : undefined,
                '&:hover': {
                    backgroundColor: isSelected
                        ? darken(0.02, bgColor)
                        : lighten(0.1, bgColor),
                },
            }}
            icon={
                isMissing ? (
                    <MantineIcon icon={IconAlertTriangle} color="gray.7" />
                ) : (
                    <FieldIcon
                        item={item}
                        color={getFieldIconColor(item)}
                        size="md"
                    />
                )
            }
            onClick={() => onItemClick(node.key, item)}
            onMouseEnter={() => toggleHover(true)}
            onMouseLeave={() => toggleHover(false)}
            label={
                <Group noWrap>
                    <HoverCard
                        openDelay={300}
                        keepMounted={false}
                        shadow="sm"
                        withinPortal
                        withArrow
                        disabled={!description && !isMissing}
                        position="right"
                        /** Ensures the hover card does not overlap with the right-hand menu. */
                        offset={isFiltered ? 80 : 40}
                    >
                        <HoverCard.Target>
                            <Highlight
                                component={Text}
                                truncate
                                sx={{ flexGrow: 1 }}
                                highlight={searchQuery || ''}
                            >
                                {label}
                            </Highlight>
                        </HoverCard.Target>
                        <HoverCard.Dropdown
                            hidden={!isHover}
                            p="xs"
                            /**
                             * Takes up space to the right, so it's OK to go fairly wide in the interest
                             * of readability.
                             */
                            maw={500}
                            /**
                             * If we don't stop propagation, users may unintentionally toggle dimensions/metrics
                             * while interacting with the hovercard.
                             */
                            onClick={(event) => event.stopPropagation()}
                        >
                            {isMissing ? (
                                t(
                                    'components_explorer_table_tree_single_node.missing',
                                    {
                                        table: item.table,
                                    },
                                )
                            ) : (
                                <ItemDetailPreview
                                    onViewDescription={onOpenDescriptionView}
                                    description={description}
                                />
                            )}
                        </HoverCard.Dropdown>
                    </HoverCard>

                    {(isFiltered || isHover) &&
                    !isAdditionalMetric(item) &&
                    isFilterableField(item) ? (
                        <Tooltip
                            withinPortal
                            label={
                                isFiltered
                                    ? t(
                                          'components_explorer_table_tree_single_node.tooltip_filter.filtered',
                                      )
                                    : t(
                                          'components_explorer_table_tree_single_node.tooltip_filter.click',
                                      )
                            }
                        >
                            <ActionIcon
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    track({
                                        name: EventName.ADD_FILTER_CLICKED,
                                    });
                                    if (!isFiltered) addFilter(item, undefined);
                                    e.stopPropagation(); // Do not toggle the field on filter click
                                }}
                            >
                                <MantineIcon
                                    icon={IconFilter}
                                    color="gray.7"
                                    style={{ flexShrink: 0 }}
                                />
                            </ActionIcon>
                        </Tooltip>
                    ) : null}

                    {isField(item) && item.hidden ? (
                        <Tooltip
                            withinPortal
                            label={t(
                                'components_explorer_table_tree_single_node.hidden',
                            )}
                        >
                            <MantineIcon
                                icon={IconAlertTriangle}
                                color="yellow.9"
                                style={{ flexShrink: 0 }}
                            />
                        </Tooltip>
                    ) : null}
                </Group>
            }
            rightSection={
                <TreeSingleNodeActions
                    item={item}
                    isHovered={isHover}
                    isSelected={isSelected}
                    isOpened={isMenuOpen}
                    hasDescription={!!description}
                    onViewDescription={onOpenDescriptionView}
                    onMenuChange={onToggleMenu}
                />
            }
            data-testid={`tree-single-node-${label}`}
        />
    );
};

export default TreeSingleNode;
