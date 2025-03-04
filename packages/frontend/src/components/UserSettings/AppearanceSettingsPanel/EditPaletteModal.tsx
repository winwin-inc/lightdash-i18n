import { type OrganizationColorPalette } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useColorPalettes,
    useUpdateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import { PaletteModalBase, type PaletteFormValues } from './PaletteModalBase';

type EditPaletteModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    palette: OrganizationColorPalette;
};

export const EditPaletteModal: FC<EditPaletteModalProps> = ({
    palette,
    opened,
    onClose,
}) => {
    const { t } = useTranslation();
    const { data: palettes = [] } = useColorPalettes();
    const updateColorPalette = useUpdateColorPalette();

    const handleUpdatePalette = (values: PaletteFormValues) => {
        if (!values.name) return;

        updateColorPalette.mutate({
            uuid: palette.colorPaletteUuid,
            name: values.name,
            colors: values.colors,
        });
    };

    // Filter out the current palette from the existing names to avoid self-comparison
    const existingPaletteNames = palettes
        .filter((p) => p.colorPaletteUuid !== palette.colorPaletteUuid)
        .map((p) => p.name);

    return (
        <PaletteModalBase
            opened={opened}
            onClose={onClose}
            onSubmit={handleUpdatePalette}
            isLoading={updateColorPalette.isLoading}
            initialValues={{
                name: palette.name,
                colors: palette.colors,
            }}
            title={t(
                'components_user_settings_appearance_settings_panel_palette_modal.edit.title',
                { name: palette.name },
            )}
            submitButtonText={t(
                'components_user_settings_appearance_settings_panel_palette_modal.edit.submit_button_text',
            )}
            existingPaletteNames={existingPaletteNames}
        />
    );
};
