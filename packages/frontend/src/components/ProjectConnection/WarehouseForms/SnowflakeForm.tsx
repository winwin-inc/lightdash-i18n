import { SnowflakeAuthenticationType, WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    Button,
    FileInput,
    Group,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import {
    useIsSnowflakeAuthenticated,
    useSnowflakeDatasets,
    useSnowflakeLoginPopup,
} from '../../../hooks/useSnowflake';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { getWarehouseIcon } from '../ProjectConnectFlow/utils';
import { useProjectFormContext } from '../useProjectFormContext';
import { SnowflakeDefaultValues } from './defaultValues';
import { getSsoLabel, PASSWORD_LABEL, PRIVATE_KEY_LABEL } from './util';

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

export const SnowflakeSSOInput: FC<{
    isAuthenticated: boolean;
    disabled: boolean;
    openLoginPopup: () => void;
}> = ({ isAuthenticated, disabled, openLoginPopup }) => {
    if (isAuthenticated) return null;

    return (
        <Button
            onClick={() => {
                openLoginPopup();
            }}
            variant="default"
            color="gray"
            disabled={disabled}
            leftIcon={getWarehouseIcon(WarehouseTypes.SNOWFLAKE, 'sm')}
            sx={{ ':hover': { textDecoration: 'underline' } }}
        >
            Sign in with Snowflake
        </Button>
    );
};

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();
    const { t } = useTranslation();

    const {
        data,
        isLoading: isLoadingAuth,
        error: snowflakeAuthError,
        refetch: refetchAuth,
    } = useIsSnowflakeAuthenticated();
    const isSso =
        form.values.warehouse?.type === WarehouseTypes.SNOWFLAKE &&
        form.values.warehouse.authenticationType ===
            SnowflakeAuthenticationType.SSO;
    const isAuthenticated =
        data !== undefined && snowflakeAuthError === null && isSso;
    const { refetch: refetchDatasets } = useSnowflakeDatasets();
    const { mutate: openLoginPopup, isSsoEnabled } = useSnowflakeLoginPopup({
        onLogin: async () => {
            await refetchAuth();
            await refetchDatasets();
        },
    });

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;

    if (form.values.warehouse?.type !== WarehouseTypes.SNOWFLAKE) {
        throw new Error('Snowflake form is not used for this warehouse type');
    }

    const savedAuthType =
        savedProject?.warehouseConnection?.type === WarehouseTypes.SNOWFLAKE
            ? savedProject?.warehouseConnection?.authenticationType
            : undefined;
    const hasPrivateKey =
        savedProject !== undefined
            ? savedAuthType === SnowflakeAuthenticationType.PRIVATE_KEY
            : true;
    const defaultAuthType = savedAuthType
        ? savedAuthType
        : isSsoEnabled
        ? SnowflakeAuthenticationType.SSO
        : hasPrivateKey
        ? SnowflakeAuthenticationType.PRIVATE_KEY
        : SnowflakeAuthenticationType.PASSWORD;

    if (!form.isTouched()) {
        form.setFieldValue('warehouse.authenticationType', defaultAuthType);
    }
    const authenticationType: SnowflakeAuthenticationType =
        form.values.warehouse.authenticationType ?? defaultAuthType;

    const [temporaryFile, setTemporaryFile] = useState<File>();

    const authOptions = isSsoEnabled
        ? [
              {
                  value: SnowflakeAuthenticationType.SSO,
                  label: getSsoLabel(WarehouseTypes.SNOWFLAKE),
              },
              {
                  value: SnowflakeAuthenticationType.PRIVATE_KEY,
                  label: PRIVATE_KEY_LABEL,
              },
              {
                  value: SnowflakeAuthenticationType.PASSWORD,
                  label: PASSWORD_LABEL,
              },
          ]
        : [
              {
                  value: SnowflakeAuthenticationType.PRIVATE_KEY,
                  label: PRIVATE_KEY_LABEL,
              },
              {
                  value: SnowflakeAuthenticationType.PASSWORD,
                  label: PASSWORD_LABEL,
              },
          ];

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

                <Group spacing="sm">
                    <Select
                        name="warehouse.authenticationType"
                        {...form.getInputProps('warehouse.authenticationType')}
                        // TODO: default value is not being recognized. private key is always being selected
                        defaultValue={defaultAuthType}
                        label="Authentication Type"
                        description={
                            isSsoEnabled &&
                            isLoadingAuth ? null : isAuthenticated ? (
                                <Text mt="0" color="gray" fs="xs">
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.authentication_type.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        href="#"
                                        onClick={() => {
                                            openLoginPopup();
                                        }}
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.snowflake.authentication_type.description.part_2',
                                        )}
                                    </Anchor>
                                </Text>
                            ) : (
                                t(
                                    'components_project_connection_warehouse_form.snowflake.authentication_type.description.part_3',
                                )
                            )
                        }
                        data={authOptions}
                        required
                        disabled={disabled}
                        w={isAuthenticated ? '90%' : '100%'}
                    />
                    {isAuthenticated && (
                        <Tooltip
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.authentication_type.tooltip',
                            )}
                        >
                            <Group mt="40px">
                                <MantineIcon icon={IconCheck} color="green" />
                            </Group>
                        </Tooltip>
                    )}
                </Group>
                {authenticationType !== SnowflakeAuthenticationType.SSO && (
                    <>
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
                    </>
                )}

                {authenticationType ===
                SnowflakeAuthenticationType.PRIVATE_KEY ? (
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
                ) : authenticationType === SnowflakeAuthenticationType.SSO ? (
                    !isLoadingAuth && (
                        <SnowflakeSSOInput
                            isAuthenticated={isAuthenticated}
                            disabled={disabled}
                            openLoginPopup={openLoginPopup}
                        />
                    )
                ) : (
                    <>
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
                    </>
                )}

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
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.switch.label',
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

                        <BooleanSwitch
                            name="warehouse.clientSessionKeepAlive"
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.keep_session_alive.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.keep_session_alive.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.snowflake.keep_session_alive.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.keep_session_alive.description.part_3',
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
