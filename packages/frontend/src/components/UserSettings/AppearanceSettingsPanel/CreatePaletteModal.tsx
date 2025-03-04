import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useColorPalettes,
    useCreateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import { PaletteModalBase, type PaletteFormValues } from './PaletteModalBase';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

const DEFAULT_COLOR_PALETTE = {
    name: 'Default',
    colors: [
        // Use the initial 9 colors directly from ECHARTS to keep them in sync:
        ...ECHARTS_DEFAULT_COLORS,
        '#33ff7d',
        '#33ffb1',
        '#33ffe6',
        '#33e6ff',
        '#33b1ff',
        '#337dff',
        '#3349ff',
        '#5e33ff',
        '#9233ff',
        '#c633ff',
        '#ff33e1',
    ],
};

export const CreatePaletteModal: FC<Props> = ({ opened, onClose }) => {
    const { data: palettes = [] } = useColorPalettes();
    const createColorPalette = useCreateColorPalette();
    const { t } = useTranslation();

    const handleCreatePalette = (values: PaletteFormValues) => {
        if (!values.name) return;

        createColorPalette.mutate({
            name: values.name,
            colors: values.colors,
        });
    };

    return (
        <PaletteModalBase
            opened={opened}
            onClose={onClose}
            onSubmit={handleCreatePalette}
            isLoading={createColorPalette.isLoading}
            initialValues={{
                name: '',
                colors: DEFAULT_COLOR_PALETTE.colors,
            }}
            title={t(
                'components_user_settings_appearance_settings_panel_palette_modal.create.title',
            )}
            submitButtonText={t(
                'components_user_settings_appearance_settings_panel_palette_modal.create.submit_button_text',
            )}
            existingPaletteNames={palettes.map((p) => p.name)}
        />
    );
};
