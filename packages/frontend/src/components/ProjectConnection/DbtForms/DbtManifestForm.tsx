import { Alert, Anchor, Stack, Text } from '@mantine/core';
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
                    <Anchor
                        href={
                            'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#2-import-a-dbt-project'
                        }
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t('components_project_connection_dbt_manifest.part_2')}
                    </Anchor>
                    {t('components_project_connection_dbt_manifest.part_3')}
                    <Anchor
                        href={
                            'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action'
                        }
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t('components_project_connection_dbt_manifest.part_4')}
                    </Anchor>{' '}
                    {t('components_project_connection_dbt_manifest.part_5')}{' '}
                    <Anchor
                        href={
                            'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash'
                        }
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t('components_project_connection_dbt_manifest.part_6')}
                    </Anchor>{' '}
                    {t('components_project_connection_dbt_manifest.part_7')}
                </Text>
            </Alert>
        </Stack>
    );
};

export default DbtManifestForm;
