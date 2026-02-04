import { DbtProjectType } from '@lightdash/common';
import {
    Alert,
    Anchor,
    MultiSelect,
    PasswordInput,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { health } = useApp();
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE;
    const { t } = useTranslation();

    const [search, setSearch] = useState('');
    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    const form = useFormContext();

    const dbtTagsField = form.getInputProps('dbt.tags');

    return (
        <Stack>
            <DbtVersionSelect disabled={disabled} />

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
                {...form.getInputProps('dbt.api_key')}
                label={t(
                    'components_project_connection_dbt_form.dbt_cloud.api_key.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.dbt_cloud.api_key.content.part_2',
                        )}
                        <DocumentationHelpButton href="https://docs.getdbt.com/docs/dbt-cloud-apis/service-tokens" />
                    </p>
                }
                required={requireSecrets}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                name="dbt.environment_id"
                {...form.getInputProps('dbt.environment_id')}
                label={t(
                    'components_project_connection_dbt_form.dbt_cloud.environment_id.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.dbt_cloud.environment_id.content.part_1',
                        )}{' '}
                        <DocumentationHelpButton href="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters" />
                    </p>
                }
                required
                disabled={disabled}
            />
            {savedProject?.projectUuid && (
                <TextInput
                    label={t(
                        'components_project_connection_dbt_form.dbt_cloud.webhook.label',
                    )}
                    value={
                        // 供 dbt Cloud 调用的 webhook 必须用后端配置的公网 siteUrl
                        health?.data?.siteUrl != null
                            ? `${health.data.siteUrl.replace(/\/?$/, '/')}api/v1/projects/${savedProject.projectUuid}/dbt-cloud/webhook`
                            : `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/projects/${savedProject.projectUuid}/dbt-cloud/webhook`
                    }
                    readOnly
                />
            )}
            <TextInput
                name="dbt.discovery_api_endpoint"
                {...form.getInputProps('dbt.discovery_api_endpoint')}
                label={t(
                    'components_project_connection_dbt_form.dbt_cloud.discovery_api_endpoint.label',
                )}
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
                placeholder="https://metadata.cloud.getdbt.com/graphql"
                disabled={disabled}
            />
            <MultiSelect
                name="dbt.tags"
                {...form.getInputProps('dbt.tags')}
                {...dbtTagsField}
                label={t(
                    'components_project_connection_dbt_form.dbt_cloud.tags.label',
                )}
                disabled={disabled}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.dbt_cloud.tags.description',
                        )}
                    </p>
                }
                placeholder={t(
                    'components_project_connection_dbt_form.dbt_cloud.tags.placeholder',
                )}
                searchable
                searchValue={search}
                onSearchChange={setSearch}
                clearable
                creatable
                clearSearchOnChange
                data={dbtTagsField.value || []}
                getCreateLabel={(query) => `+ Add ${query}`}
                onCreate={(query) => {
                    form.insertListItem('dbt.tags', query);
                    return query;
                }}
                onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (
                        event.key === 'Enter' &&
                        event.currentTarget.value.trim()
                    ) {
                        event.preventDefault(); // Prevent form submission
                        if (
                            !dbtTagsField.value.includes(
                                event.currentTarget.value.trim(),
                            )
                        ) {
                            form.insertListItem(
                                'dbt.tags',
                                event.currentTarget.value.trim(),
                            );
                            handleResetSearch();
                        }
                    }
                }}
                onDropdownClose={() => {
                    handleResetSearch();
                }}
            />
        </Stack>
    );
};

export default DbtCloudForm;
