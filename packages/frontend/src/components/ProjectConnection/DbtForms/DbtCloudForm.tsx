import { DbtProjectType } from '@lightdash/common';
import { Alert, Anchor, Stack } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../useProjectFormContext';

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
                        'components_project_connection_dbt_form.dbt_cloud.alert.content.part_1',
                    )}{' '}
                    <b>
                        {t(
                            'components_project_connection_dbt_form.alert.content.part_2',
                        )}
                    </b>
                    .
                </p>
                <p>
                    {t(
                        'components_project_connection_dbt_form.dbt_cloud.alert.content.part_3',
                    )}
                </p>
            </Alert>
            <PasswordInput
                name="dbt.api_key"
                label={t(
                    'components_project_connection_dbt_form.dbt_cloud.api_key.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.dbt_cloud.api_key.content.part_1',
                        )}
                    </p>
                }
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/service-tokens"
                rules={{
                    required: requireSecrets
                        ? t(
                              'components_project_connection_dbt_form.dbt_cloud.api_key.content.part_2',
                          )
                        : undefined,
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
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.dbt_cloud.environment.content.part_1',
                        )}
                    </p>
                }
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters"
                rules={{
                    required: t(
                        'components_project_connection_dbt_form.dbt_cloud.environment.content.part_2',
                    ),
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Environment ID'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.discovery_api_endpoint"
                label="Discovery API endpoint"
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.dbt_cloud.discovery_api_endpoint.content.part_1',
                        )}{' '}
                        <Anchor
                            target="_blank"
                            href="https://docs.getdbt.com/docs/dbt-cloud-apis/discovery-querying#discovery-api-endpoints"
                            rel="noreferrer"
                        >
                            {t(
                                'components_project_connection_dbt_form.dbt_cloud.discovery_api_endpoint.content.part_2',
                            )}
                        </Anchor>
                        .
                    </p>
                }
                rules={{
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Discovery API endpoint',
                        ),
                    },
                }}
                placeholder={'https://metadata.cloud.getdbt.com/graphql'}
                disabled={disabled}
            />
        </Stack>
    );
};

export default DbtCloudForm;
