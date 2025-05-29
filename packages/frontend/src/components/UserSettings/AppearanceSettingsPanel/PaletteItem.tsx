import { type OrganizationColorPalette } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    ColorSwatch,
    Flex,
    Group,
    Menu,
    Paper,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconDotsVertical,
    IconEdit,
    IconInfoCircle,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useDeleteColorPalette } from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';
import { DeletePaletteModal } from './DeletePaletteModal';
import { EditPaletteModal } from './EditPaletteModal';

type PaletteItemProps = {
    palette: Omit<OrganizationColorPalette, 'name'> & { name: string };
    isActive: boolean;
    onSetActive?: ((uuid: string) => void) | undefined;
    readOnly?: boolean;
};

export const PaletteItem: FC<PaletteItemProps> = ({
    palette,
    isActive,
    onSetActive,
    readOnly,
}) => {
    const { t } = useTranslation();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const deleteColorPalette = useDeleteColorPalette();

    const handleDeletePalette = () => {
        deleteColorPalette.mutate(palette.colorPaletteUuid);
        setIsDeleteModalOpen(false);
    };

    return (
        <>
            <Paper
                p="sm"
                withBorder
                radius="sm"
                sx={(theme) => ({
                    backgroundColor: theme.white,
                    borderColor: theme.colors.gray[2],
                    position: 'relative',
                })}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <Flex justify="space-between" align="center">
                    <Group spacing="xs">
                        <Group spacing="two">
                            {palette.colors.slice(0, 5).map((color, index) => (
                                <ColorSwatch
                                    key={color + index}
                                    size={18}
                                    color={color}
                                />
                            ))}
                        </Group>
                        <Text fw={500}>{palette.name}</Text>
                        {readOnly && (
                            <Tooltip
                                label={t(
                                    'components_user_settings_appearance_settings_panel_palette_modal.override.tooltip',
                                )}
                                position="bottom-end"
                                multiline
                                maw={200}
                                variant="xs"
                            >
                                <Badge color="gray" variant="light">
                                    <Group spacing={2}>
                                        {t(
                                            'components_user_settings_appearance_settings_panel_palette_modal.override.override',
                                        )}
                                        <MantineIcon
                                            size="sm"
                                            icon={IconInfoCircle}
                                        />
                                    </Group>
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>

                    <Group spacing="xs">
                        {onSetActive && (
                            <Button
                                onClick={() =>
                                    onSetActive(palette.colorPaletteUuid)
                                }
                                h={32}
                                sx={() => ({
                                    visibility:
                                        isHovered && !isActive
                                            ? 'visible'
                                            : 'hidden',
                                })}
                            >
                                {t(
                                    'components_user_settings_appearance_settings_panel_palette_modal.item.use_theme',
                                )}
                            </Button>
                        )}

                        {isActive && (
                            <Badge color="green" variant="light">
                                {t(
                                    'components_user_settings_appearance_settings_panel_palette_modal.item.active',
                                )}
                            </Badge>
                        )}

                        <Menu
                            shadow="subtle"
                            position="bottom-end"
                            disabled={readOnly}
                        >
                            <Menu.Target>
                                <ActionIcon size="xs" disabled={readOnly}>
                                    <MantineIcon icon={IconDotsVertical} />
                                </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                                <Menu.Item
                                    icon={<MantineIcon icon={IconEdit} />}
                                    onClick={() => setIsEditModalOpen(true)}
                                >
                                    {t(
                                        'components_user_settings_appearance_settings_panel_palette_modal.item.edit',
                                    )}
                                </Menu.Item>
                                <Menu.Item
                                    icon={<MantineIcon icon={IconTrash} />}
                                    onClick={() => setIsDeleteModalOpen(true)}
                                    disabled={isActive}
                                    color="red"
                                >
                                    {t(
                                        'components_user_settings_appearance_settings_panel_palette_modal.item.delete',
                                    )}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Flex>
            </Paper>

            <EditPaletteModal
                palette={palette}
                opened={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
            />

            <DeletePaletteModal
                palette={palette}
                opened={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeletePalette}
            />
        </>
    );
};
