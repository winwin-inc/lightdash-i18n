import { Alert, Stack, Text } from '@mantine/core';
import { IconExclamationCircle, IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';

const DbtLocalForm: FC = () => {
    const { t } = useTranslation();

    return (
        <Stack>
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
                            'components_project_connection_dbt_form.dbt_local.alert.step_1',
                        )}{' '}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.dbt_local.alert.step_2',
                            )}
                        </b>
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.step_3',
                        )}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.dbt_local.alert.step_4',
                            )}
                        </b>{' '}
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.step_5',
                        )}
                    </Text>

                    <Text color="blue">
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.step_6',
                        )}{' '}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.dbt_local.alert.step_7',
                            )}
                        </b>{' '}
                        {t(
                            'components_project_connection_dbt_form.dbt_local.alert.step_8',
                        )}
                    </Text>
                </Stack>
            </Alert>
        </Stack>
    );
};

export default DbtLocalForm;
