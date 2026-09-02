import { Draggable } from '@hello-pangea/dnd';
import type { DashboardTab } from '@lightdash/common';
import { ActionIcon, Box, Menu, Tabs, Title, Tooltip } from '@mantine/core';
import { mergeRefs, useHover } from '@mantine/hooks';
import { IconEye, IconEyeOff, IconGripVertical, IconPencil, IconTrash } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsTruncated } from '../../hooks/useIsTruncated';
import MantineIcon from '../common/MantineIcon';

type DraggableTabProps = {
    idx: number;
    tab: DashboardTab;
    isEditMode: boolean;
    sortedTabs: DashboardTab[];
    currentTabHasTiles: boolean;
    isActive: boolean;
    setEditingTab: Dispatch<SetStateAction<boolean>>;
    setDeletingTab: Dispatch<SetStateAction<boolean>>;
    handleDeleteTab: (tabUuid: string) => void;
    handleToggleTabHidden: (tabUuid: string) => void;
};

const DraggableTab: FC<DraggableTabProps> = ({
    tab,
    idx,
    isEditMode,
    sortedTabs,
    currentTabHasTiles,
    isActive,
    setEditingTab,
    handleDeleteTab,
    handleToggleTabHidden,
    setDeletingTab,
}) => {
    const { t } = useTranslation();
    const { hovered: isHovered, ref: hoverRef } = useHover();
    const { ref, isTruncated } = useIsTruncated();

    return (
        <Draggable key={tab.uuid} draggableId={tab.uuid} index={idx}>
            {(provided) => (
                <div
                    ref={mergeRefs(provided.innerRef, hoverRef)}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                >
                    <Tabs.Tab
                        key={idx}
                        value={tab.uuid}
                        bg={isActive ? 'white' : 'gray.0'}
                        opacity={isEditMode && tab.hidden ? 0.55 : 1}
                        icon={
                            isEditMode ? (
                                <Box {...provided.dragHandleProps} w={'sm'}>
                                    <MantineIcon
                                        display={isHovered ? 'block' : 'none'}
                                        size="sm"
                                        color="gray.6"
                                        icon={IconGripVertical}
                                    />
                                </Box>
                            ) : null
                        }
                        rightSection={
                            isEditMode ? (
                                <Menu
                                    position="bottom"
                                    withArrow
                                    withinPortal
                                    shadow="md"
                                >
                                    <Menu.Target>
                                        <ActionIcon variant="subtle" size="xs">
                                            <MantineIcon
                                                icon={IconPencil}
                                                display={
                                                    isHovered ? 'block' : 'none'
                                                }
                                            />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item
                                            onClick={() => setEditingTab(true)}
                                            icon={<IconPencil size={14} />}
                                        >
                                            {t(
                                                'components_dashboard_tabs.tab_menus.rename_tab',
                                            )}
                                        </Menu.Item>
                                        <Menu.Item
                                            onClick={() =>
                                                handleToggleTabHidden(tab.uuid)
                                            }
                                            icon={
                                                tab.hidden ? (
                                                    <IconEye size={14} />
                                                ) : (
                                                    <IconEyeOff size={14} />
                                                )
                                            }
                                        >
                                            {tab.hidden
                                                ? t(
                                                      'components_dashboard_tabs.tab_menus.show_tab',
                                                  )
                                                : t(
                                                      'components_dashboard_tabs.tab_menus.hide_tab',
                                                  )}
                                        </Menu.Item>
                                        {sortedTabs.length === 1 ||
                                        !currentTabHasTiles ? (
                                            <Menu.Item
                                                onClick={(
                                                    e: React.MouseEvent<HTMLButtonElement>,
                                                ) => {
                                                    handleDeleteTab(tab.uuid);
                                                    e.stopPropagation();
                                                }}
                                                color="red"
                                                icon={<IconTrash size={14} />}
                                            >
                                                {t(
                                                    'components_dashboard_tabs.tab_menus.remove_tab',
                                                )}
                                            </Menu.Item>
                                        ) : (
                                            <Menu.Item
                                                onClick={() =>
                                                    setDeletingTab(true)
                                                }
                                                color="red"
                                                icon={<IconTrash size={14} />}
                                            >
                                                {t(
                                                    'components_dashboard_tabs.tab_menus.safely_remove_tab',
                                                )}
                                            </Menu.Item>
                                        )}
                                    </Menu.Dropdown>
                                </Menu>
                            ) : null
                        }
                    >
                        <Tooltip
                            disabled={!isTruncated}
                            label={tab.name}
                            withinPortal
                            variant="xs"
                        >
                            <Title
                                ref={ref}
                                order={6}
                                fw={500}
                                color="gray.7"
                                truncate
                                maw={`calc(${
                                    100 / (sortedTabs?.length || 1)
                                }vw)`}
                            >
                                {tab.name}
                            </Title>
                        </Tooltip>
                    </Tabs.Tab>
                </div>
            )}
        </Draggable>
    );
};

export default DraggableTab;
