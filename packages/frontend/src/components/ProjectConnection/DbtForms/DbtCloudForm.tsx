import { DbtProjectType } from '@lightdash/common';
import { Alert, Stack } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation();
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE;

    return (
        <Stack>
            <Alert
                icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                title={t(
                    'components_project_connection_dbt_form.dbt_cloud.alert.title',
                )}
                variant="light"
            >
                <p>
                    {t(
                        'components_project_connection_dbt_form.dbt_cloud.alert.content.step_1',
                    )}
                </p>
                <p>
                    {t(
                        'components_project_connection_dbt_form.dbt_cloud.alert.content.step_2',
                    )}
                </p>
            </Alert>
            <PasswordInput
                name="dbt.api_key"
                label={t(
                    'components_project_connection_dbt_form.dbt_cloud.api_key.label',
                )}
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/service-tokens"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('API key'),
                    },
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="dbt.environment_id"
                label={t(
                    'components_project_connection_dbt_form.dbt_cloud.environment.label',
                )}
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Environment ID'),
                    },
                }}
                disabled={disabled}
            />
        </Stack>
    );
};

export default DbtCloudForm;
