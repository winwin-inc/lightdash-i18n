import { Alert, Stack, Text } from '@mantine/core';
import { IconExclamationCircle, IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import DbtVersionSelect from '../Inputs/DbtVersion';

const DbtLocalForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation();

    return (
        <Stack>
            <DbtVersionSelect disabled={disabled} />

            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
            >
                <Text color="orange">
                    {t(
                        'components_project_connection_dbt_form.dbt_local.alert_dev.content',
                    )}
                </Text>
            </Alert>

            <Alert
                color="blue"
                icon={<MantineIcon icon={IconInfoCircle} size="lg" />}
            >
                <Stack spacing="xs">
                    <Text color="blue">
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.part_1',
                        )}{' '}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.dbt_local.alert.part_2',
                            )}
                        </b>
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.part_3',
                        )}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.dbt_local.alert.part_4',
                            )}
                        </b>{' '}
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.part_5',
                        )}
                    </Text>

                    <Text color="blue">
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.part_6',
                        )}{' '}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.dbt_local.alert.part_7',
                            )}
                        </b>{' '}
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.part_8',
                        )}
                    </Text>
                </Stack>
            </Alert>
        </Stack>
    );
};

export default DbtLocalForm;
