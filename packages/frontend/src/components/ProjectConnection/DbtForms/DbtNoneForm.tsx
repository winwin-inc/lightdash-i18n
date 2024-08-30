import { Anchor, Group, Stack, Switch } from '@mantine/core';
import { type FC } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

const DbtNoneForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation();

    return (
        <Stack>
            <Controller
                name="dbt.hideRefreshButton"
                render={({ field }) => (
                    <Switch.Group
                        label={t(
                            'components_project_connection_dbt_form.dbt_none.switch.label',
                        )}
                        description={
                            <p>
                                {t(
                                    'components_project_connection_dbt_form.dbt_none.switch.description.part_1',
                                )}{' '}
                                <Anchor
                                    href={
                                        'https://docs.lightdash.com/references/dbt-projects'
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {t(
                                        'components_project_connection_dbt_form.dbt_none.switch.description.part_2',
                                    )}
                                </Anchor>
                            </p>
                        }
                        value={field.value ? ['true'] : []}
                        onChange={(values) => field.onChange(values.length > 0)}
                        size="md"
                    >
                        <Group mt="xs">
                            <Switch
                                onLabel="Yes"
                                offLabel="No"
                                value="true"
                                disabled={disabled}
                            />
                        </Group>
                    </Switch.Group>
                )}
            />
        </Stack>
    );
};

export default DbtNoneForm;
