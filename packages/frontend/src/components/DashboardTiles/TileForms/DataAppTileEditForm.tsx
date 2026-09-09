import { type DashboardDataAppTileProperties } from '@lightdash/common';
import { ActionIcon, Flex, Stack, TextInput } from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';

interface DataAppTileEditFormProps {
    form: UseFormReturnType<DashboardDataAppTileProperties['properties']>;
}

const DataAppTileEditForm = ({ form }: DataAppTileEditFormProps) => {
    const { t } = useTranslation();

    return (
        <Stack gap="md">
            <Flex
                align={
                    form.getInputProps('title').error ? 'center' : 'flex-end'
                }
                gap="xs"
            >
                <TextInput
                    label={t(
                        'components_dashboard_tiles_data_app_tile_edit_form.title',
                    )}
                    placeholder={t(
                        'components_dashboard_tiles_data_app_tile_edit_form.title_placeholder',
                    )}
                    flex={1}
                    required
                    disabled={form.values.hideTitle}
                    {...form.getInputProps('title')}
                />
                <ActionIcon
                    variant="subtle"
                    size="lg"
                    onClick={() => {
                        form.setFieldValue('hideTitle', !form.values.hideTitle);
                    }}
                >
                    <MantineIcon
                        icon={form.values.hideTitle ? IconEyeOff : IconEye}
                    />
                </ActionIcon>
            </Flex>
        </Stack>
    );
};

export default DataAppTileEditForm;
