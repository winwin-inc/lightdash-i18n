import { type DashboardMarkdownTileProperties } from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import MDEditor from '@uiw/react-md-editor';
import { useTranslation } from 'react-i18next';

import { remarkSoftBreaks } from '../../../utils/remarkSoftBreaks';

interface MarkdownTileFormProps {
    form: UseFormReturnType<DashboardMarkdownTileProperties['properties']>;
}

const MarkdownTileForm = ({ form }: MarkdownTileFormProps) => {
    const { t } = useTranslation();

    return (
        <Stack spacing="md">
            <TextInput
                label={t(
                    'components_dashboard_tiles_forms_markdown_tile.title.label',
                )}
                placeholder={t(
                    'components_dashboard_tiles_forms_markdown_tile.title.placeholder',
                )}
                {...form.getInputProps('title')}
            />

            <MDEditor
                preview="edit"
                maxHeight={300}
                minHeight={100}
                visibleDragbar
                overflow={false}
                // Keep the editor's own preview in sync with how the tile is
                // rendered on the dashboard (single newline = line break).
                previewOptions={{ remarkPlugins: [remarkSoftBreaks] }}
                {...form.getInputProps('content')}
            />
        </Stack>
    );
};

export default MarkdownTileForm;
