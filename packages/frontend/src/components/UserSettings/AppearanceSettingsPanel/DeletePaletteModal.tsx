import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Button,
    Center,
    ColorSwatch,
    Group,
    Modal,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';

type DeletePaletteModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    palette: OrganizationColorPalette;
    onConfirm: () => void;
};

export const DeletePaletteModal: FC<DeletePaletteModalProps> = ({
    palette,
    opened,
    onClose,
    onConfirm,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            radius="sm"
            opened={opened}
            onClose={onClose}
            title={
                <Group>
                    <Paper p="xs" withBorder radius="sm">
                        <MantineIcon icon={IconTrash} size="sm" color="red" />
                    </Paper>
                    <Text color="dark.7" fw={500} fz="md">
                        {t(
                            'components_user_settings_appearance_settings_panel_palette_modal.delete.title',
                            { name: palette.name },
                        )}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: {
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                },
                body: {
                    padding: 0,
                },
            })}
            size="md"
        >
            <Stack p="md" spacing="xs">
                <Text size="sm" color="gray.6">
                    {t(
                        'components_user_settings_appearance_settings_panel_palette_modal.delete.content',
                    )}
                </Text>

                <Center>
                    <SimpleGrid cols={10} spacing="xs">
                        {palette.colors.map((color, index) => (
                            <ColorSwatch
                                key={color + index}
                                size={24}
                                color={color}
                            />
                        ))}
                    </SimpleGrid>
                </Center>
            </Stack>

            <Group
                position="right"
                p="md"
                spacing="xs"
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[2]}`,
                })}
            >
                <Button variant="default" size="xs" h={32} onClick={onClose}>
                    {t(
                        'components_user_settings_appearance_settings_panel_palette_modal.delete.cancel',
                    )}
                </Button>
                <Button color="red" onClick={onConfirm} size="xs" h={32}>
                    {t(
                        'components_user_settings_appearance_settings_panel_palette_modal.delete.delete',
                    )}
                </Button>
            </Group>
        </Modal>
    );
};
