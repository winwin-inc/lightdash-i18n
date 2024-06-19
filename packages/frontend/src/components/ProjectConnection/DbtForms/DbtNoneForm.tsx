import { Alert, Anchor, Group, Stack, Switch, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';

const DbtNoneForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation();

    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
            >
                <Text color="orange">
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_1',
                    )}{' '}
                    <Anchor
                        href={
                            'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#2-import-a-dbt-project'
                        }
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t(
                            'components_project_connection_dbt_form.dbt_none.alert.part_2',
                        )}
                    </Anchor>
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_3',
                    )}{' '}
                    <Anchor
                        href={
                            'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action'
                        }
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t(
                            'components_project_connection_dbt_form.dbt_none.alert.part_4',
                        )}
                    </Anchor>{' '}
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_5',
                    )}{' '}
                    <Anchor
                        href={
                            'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash'
                        }
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t(
                            'components_project_connection_dbt_form.dbt_none.alert.part_6',
                        )}
                    </Anchor>{' '}
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_7',
                    )}
                </Text>
            </Alert>

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
                                        'https://docs.lightdash.com/references/syncing_your_dbt_changes#2-in-the-ui-syncing-your-dbt-changes-using-refresh-dbt'
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
