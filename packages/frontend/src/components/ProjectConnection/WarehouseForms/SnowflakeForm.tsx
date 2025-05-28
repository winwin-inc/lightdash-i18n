import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    FileInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import { SnowflakeDefaultValues } from './defaultValues';

export const SnowflakeSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            name="warehouse.schema"
            label={t(
                'components_project_connection_warehouse_form.snowflake.schema.label',
            )}
            description={t(
                'components_project_connection_warehouse_form.snowflake.schema.description',
            )}
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();
    const { t } = useTranslation();

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;
    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );

    if (form.values.warehouse?.type !== WarehouseTypes.SNOWFLAKE) {
        throw new Error('Snowflake form is not used for this warehouse type');
    }
    const hasPrivateKey =
        savedProject !== undefined
            ? savedProject?.warehouseConnection?.type ===
                  WarehouseTypes.SNOWFLAKE &&
              savedProject?.warehouseConnection?.authenticationType ===
                  'private_key'
            : true;

    const authenticationType: string =
        form.values.warehouse.authenticationType ??
        (hasPrivateKey ? 'private_key' : 'password');

    const [temporaryFile, setTemporaryFile] = useState<File>();

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.account"
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.account.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.account.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.account')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.user"
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.user.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.user.description',
                    )}
                    required={requireSecrets}
                    {...form.getInputProps('warehouse.user')}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />

                <Select
                    name="warehouse.authenticationType"
                    {...form.getInputProps('warehouse.authenticationType')}
                    defaultValue={hasPrivateKey ? 'private_key' : 'password'}
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.private_key.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.private_key.description',
                    )}
                    data={[
                        {
                            value: 'private_key',
                            label: t(
                                'components_project_connection_warehouse_form.snowflake.private_key.private_key',
                            ),
                        },
                        {
                            value: 'password',
                            label: t(
                                'components_project_connection_warehouse_form.snowflake.private_key.password',
                            ),
                        },
                    ]}
                    required
                    disabled={disabled}
                />

                {authenticationType === 'private_key' ? (
                    <>
                        <FileInput
                            name="warehouse.privateKey"
                            {...form.getInputProps('warehouse.privateKey')}
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.file.label',
                            )}
                            // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                            // @ts-ignore
                            placeholder={
                                !requireSecrets
                                    ? '**************'
                                    : t(
                                          'components_project_connection_warehouse_form.snowflake.file.placeholder',
                                      )
                            }
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.file.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.snowflake.com/en/user-guide/key-pair-auth#generate-the-private-key"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.snowflake.file.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.file.description.part_3',
                                    )}
                                </p>
                            }
                            required={requireSecrets}
                            accept=".p8"
                            value={temporaryFile}
                            onChange={(file) => {
                                if (!file) {
                                    form.setFieldValue(
                                        'warehouse.privateKey',
                                        null,
                                    );
                                    return;
                                }

                                const fileReader = new FileReader();
                                fileReader.onload = function (event) {
                                    const contents = event.target?.result;
                                    setTemporaryFile(file);

                                    if (typeof contents === 'string') {
                                        form.setFieldValue(
                                            'warehouse.privateKey',
                                            contents,
                                        );
                                    } else {
                                        form.setFieldValue(
                                            'warehouse.privateKey',
                                            null,
                                        );
                                    }
                                };
                                fileReader.readAsText(file);
                            }}
                            disabled={disabled}
                        />

                        <PasswordInput
                            name="warehouse.privateKeyPass"
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.private_key_pass.label',
                            )}
                            description={t(
                                'components_project_connection_warehouse_form.snowflake.private_key_pass.description',
                            )}
                            {...form.getInputProps('warehouse.privateKeyPass')}
                            placeholder={
                                disabled || !requireSecrets
                                    ? '**************'
                                    : undefined
                            }
                            disabled={disabled}
                        />
                    </>
                ) : (
                    <PasswordInput
                        name="warehouse.password"
                        label={t(
                            'components_project_connection_warehouse_form.snowflake.password.label',
                        )}
                        description={t(
                            'components_project_connection_warehouse_form.snowflake.password.description',
                        )}
                        required={requireSecrets}
                        placeholder={
                            disabled || !requireSecrets
                                ? '**************'
                                : undefined
                        }
                        {...form.getInputProps('warehouse.password')}
                        disabled={disabled}
                    />
                )}
                <TextInput
                    name="warehouse.role"
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.role.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.role.description',
                    )}
                    {...form.getInputProps('warehouse.role')}
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.database"
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.database.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.database.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.database')}
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.warehouse"
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.warehouse.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.warehouse.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.warehouse')}
                    disabled={disabled}
                />
                <BooleanSwitch
                    name="warehouse.override"
                    {...form.getInputProps('warehouse.override', {
                        type: 'checkbox',
                    })}
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse"
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.warehouse_override.label',
                    )}
                    onLabel={t(
                        'components_project_connection_warehouse_form.snowflake.warehouse_override.yes',
                    )}
                    offLabel={t(
                        'components_project_connection_warehouse_form.snowflake.warehouse_override.no',
                    )}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label={t(
                                    'components_project_connection_warehouse_form.snowflake.label.label',
                                )}
                                defaultChecked={
                                    SnowflakeDefaultValues.requireUserCredentials
                                }
                                disabled={disabled}
                                {...form.getInputProps(
                                    'warehouse.requireUserCredentials',
                                    { type: 'checkbox' },
                                )}
                            />
                        )}

                        <BooleanSwitch
                            name="warehouse.clientSessionKeepAlive"
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.keep_client_session_alive.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.keep_client_session_alive.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.snowflake.keep_client_session_alive.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.keep_client_session_alive.description.part_3',
                                    )}
                                </p>
                            }
                            onLabel="Yes"
                            offLabel="No"
                            disabled={disabled}
                            {...form.getInputProps(
                                'warehouse.clientSessionKeepAlive',
                                { type: 'checkbox' },
                            )}
                        />

                        <TextInput
                            name="warehouse.queryTag"
                            {...form.getInputProps('warehouse.queryTag')}
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.query_tag.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.query_tag.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.snowflake.query_tag.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.query_tag.description.part_3',
                                    )}
                                </p>
                            }
                            disabled={disabled}
                        />

                        <TextInput
                            name="warehouse.accessUrl"
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.snowflake_url_override.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.snowflake_url_override.description',
                                    )}
                                </p>
                            }
                            disabled={disabled}
                            {...form.getInputProps('warehouse.accessUrl')}
                        />
                        <StartOfWeekSelect
                            disabled={disabled}
                            isRedeployRequired={false}
                        />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.snowflake.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default SnowflakeForm;
