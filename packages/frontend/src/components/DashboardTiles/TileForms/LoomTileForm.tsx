import { type DashboardLoomTileProperties } from '@lightdash/common';
import { ActionIcon, Flex, Stack, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';

interface LoomTileFormProps {
    form: UseFormReturnType<DashboardLoomTileProperties['properties']>;
    withHideTitle: boolean;
}

const LoomTileForm = ({ form, withHideTitle }: LoomTileFormProps) => {
    const { t } = useTranslation();

    return (
        <Stack spacing="md">
            <Flex
                align={
                    form.getInputProps('title').error ? 'center' : 'flex-end'
                }
                gap="xs"
            >
                <TextInput
                    label={t(
                        'components_dashboard_tiles_forms_loom_tile.title.label',
                    )}
                    placeholder={t(
                        'components_dashboard_tiles_forms_loom_tile.title.placeholder',
                    )}
                    style={{ flex: 1 }}
                    required
                    disabled={form.values.hideTitle}
                    {...form.getInputProps('title')}
                />
                {withHideTitle && (
                    <ActionIcon
                        variant="subtle"
                        size="lg"
                        onClick={() => {
                            form.setFieldValue(
                                'hideTitle',
                                !form.values.hideTitle,
                            );
                        }}
                    >
                        <MantineIcon
                            icon={form.values.hideTitle ? IconEyeOff : IconEye}
                        />
                    </ActionIcon>
                )}
            </Flex>

            <TextInput
                name="url"
                label={t(
                    'components_dashboard_tiles_forms_loom_tile.url.label',
                )}
                placeholder={t(
                    'components_dashboard_tiles_forms_loom_tile.url.placeholder',
                )}
                required
                {...form.getInputProps('url')}
            />
        </Stack>
    );
};

export default LoomTileForm;
