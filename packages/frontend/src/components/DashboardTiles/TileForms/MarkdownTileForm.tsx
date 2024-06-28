import {
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    sanitizeHtml,
    type DashboardMarkdownTile,
    type DashboardMarkdownTileProperties,
} from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import MDEditor from '@uiw/react-md-editor';
import { useTranslation } from 'react-i18next';

interface MarkdownTileFormProps {
    form: UseFormReturnType<DashboardMarkdownTileProperties['properties']>;
}

/**
 * Helper that can be used as a value transformer with Mantine's `useForm` hook.
 */
export const markdownTileContentTransform = (
    values: DashboardMarkdownTile['properties'],
) => ({
    ...values,
    content: sanitizeHtml(values.content, HTML_SANITIZE_MARKDOWN_TILE_RULES),
});

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
                {...form.getInputProps('content')}
            />
        </Stack>
    );
};

export default MarkdownTileForm;
