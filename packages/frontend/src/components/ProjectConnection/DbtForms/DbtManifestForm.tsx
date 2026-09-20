import { Alert, Stack, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';

const DbtManifestForm: FC<{}> = ({}) => {
    const { t } = useTranslation();

    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
            >
                <Text color="orange">
                    {t('components_project_connection_dbt_manifest.part_1')}{' '}
                    {t('components_project_connection_dbt_manifest.part_2')}
                    {t('components_project_connection_dbt_manifest.part_3')}
                    {t('components_project_connection_dbt_manifest.part_4')}{' '}
                    {t('components_project_connection_dbt_manifest.part_5')}{' '}
                    {t('components_project_connection_dbt_manifest.part_6')}{' '}
                    {t('components_project_connection_dbt_manifest.part_7')}
                </Text>
            </Alert>
        </Stack>
    );
};

export default DbtManifestForm;
