import { Alert, Stack, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';

const DbtNoneForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const form = useFormContext();
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
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_2',
                    )}
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_3',
                    )}{' '}
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_4',
                    )}{' '}
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_5',
                    )}{' '}
                    {t(
                        'components_project_connection_dbt_form.dbt_none.alert.part_6',
                    )}
                </Text>
            </Alert>

            <BooleanSwitch
                onLabel="Yes"
                offLabel="No"
                disabled={disabled}
                {...form.getInputProps('dbt.hideRefreshButton')}
                name="dbt.hideRefreshButton"
                label={t(
                    'components_project_connection_dbt_form.dbt_none.switch.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.dbt_none.switch.description.part_1',
                )}
            />
        </Stack>
    );
};

export default DbtNoneForm;
