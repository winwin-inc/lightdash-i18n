import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CopyButton,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import CertificateFileInput from '../Inputs/CertificateFileInput';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import { PostgresDefaultValues } from './defaultValues';
import { useCreateSshKeyPair } from './sshHooks';

export const PostgresSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            name="warehouse.schema"
            label={t(
                'components_project_connection_warehouse_form.postgress.schema.label',
            )}
            description={t(
                'components_project_connection_warehouse_form.postgress.schema.description',
            )}
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const PostgresForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.POSTGRES;
    const form = useFormContext();

    if (form.values.warehouse?.type !== WarehouseTypes.POSTGRES) {
        throw new Error('This form is only available for Postgres');
    }

    const defaultSshTunnelConfiguration: boolean =
        (savedProject?.warehouseConnection?.type === WarehouseTypes.POSTGRES &&
            savedProject?.warehouseConnection?.useSshTunnel) ||
        false;
    const showSshTunnelConfiguration: boolean =
        form.values.warehouse.useSshTunnel ?? defaultSshTunnelConfiguration;

    const sshTunnelPublicKey: string | undefined =
        form.values.warehouse.sshTunnelPublicKey ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.POSTGRES
            ? savedProject?.warehouseConnection?.sshTunnelPublicKey
            : undefined);

    const sslMode: string | undefined =
        form.values.warehouse.sslmode ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.POSTGRES
            ? savedProject?.warehouseConnection?.sslmode
            : undefined);

    const { mutate, isLoading } = useCreateSshKeyPair({
        onSuccess: (data) => {
            form.setFieldValue('warehouse.sshTunnelPublicKey', data.publicKey);
        },
    });

    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.postgress.host.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.host.description',
                    )}
                    required
                    name="warehouse.host"
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.postgress.user.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.user.description',
                    )}
                    required={requireSecrets}
                    name="warehouse.user"
                    {...form.getInputProps('warehouse.user')}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <PasswordInput
                    label={t(
                        'components_project_connection_warehouse_form.postgress.password.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.password.description',
                    )}
                    required={requireSecrets}
                    name="warehouse.password"
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...form.getInputProps('warehouse.password')}
                    disabled={disabled}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.postgress.db_name.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.db_name.description',
                    )}
                    required
                    name="warehouse.dbname"
                    {...form.getInputProps('warehouse.dbname')}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                {...form.getInputProps(
                                    'warehouse.requireUserCredentials',
                                    {
                                        type: 'checkbox',
                                    },
                                )}
                                label={t(
                                    'components_project_connection_warehouse_form.postgress.switch.label',
                                )}
                                disabled={disabled}
                                defaultChecked={
                                    PostgresDefaultValues.requireUserCredentials
                                }
                            />
                        )}
                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={PostgresDefaultValues.port}
                            label={t(
                                'components_project_connection_warehouse_form.postgress.port.label',
                            )}
                            description={t(
                                'components_project_connection_warehouse_form.postgress.port.description',
                            )}
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.keepalivesIdle"
                            {...form.getInputProps('warehouse.keepalivesIdle')}
                            defaultValue={PostgresDefaultValues.keepalivesIdle}
                            label={t(
                                'components_project_connection_warehouse_form.postgress.keep_alive_idle.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.postgress.keep_alive_idle.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://postgresqlco.nf/doc/en/param/tcp_keepalives_idle/"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.postgress.keep_alive_idle.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.postgress.keep_alive_idle.description.part_3',
                                    )}
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <TextInput
                            name="warehouse.searchPath"
                            {...form.getInputProps('warehouse.searchPath')}
                            label={t(
                                'components_project_connection_warehouse_form.postgress.search_path.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.postgress.search_path.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/postgres-profile#search_path"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.postgress.search_path.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.postgress.search_path.description.part_3',
                                    )}
                                </p>
                            }
                            disabled={disabled}
                        />

                        <Select
                            name="warehouse.sslmode"
                            {...form.getInputProps('warehouse.sslmode')}
                            defaultValue={PostgresDefaultValues.sslmode}
                            label={t(
                                'components_project_connection_warehouse_form.postgress.ssl_mode.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.postgress.ssl_mode.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/postgres-profile#sslmode"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.postgress.ssl_mode.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.postgress.ssl_mode.description.part_3',
                                    )}
                                </p>
                            }
                            data={[
                                'disable',
                                'no-verify',
                                'allow',
                                'prefer',
                                'require',
                                'verify-ca',
                                'verify-full',
                            ].map((x) => ({ value: x, label: x }))}
                            disabled={disabled}
                        />
                        {sslMode === 'verify-ca' ||
                        sslMode === 'verify-full' ? (
                            <>
                                <CertificateFileInput
                                    name={'warehouse.sslcert'}
                                    fileNameProperty={
                                        'warehouse.sslcertFileName'
                                    }
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.ssl_cert.label',
                                    )}
                                    disabled={disabled}
                                    accept=".crt,.pem"
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.postgress.ssl_cert.description',
                                            )}
                                        </p>
                                    }
                                />
                                <CertificateFileInput
                                    name={'warehouse.sslkey'}
                                    fileNameProperty={
                                        'warehouse.sslkeyFileName'
                                    }
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.ssl_key.label',
                                    )}
                                    disabled={disabled}
                                    accept=".key,.pem"
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.postgress.ssl_key.description',
                                            )}
                                        </p>
                                    }
                                />
                                <CertificateFileInput
                                    name={'warehouse.sslrootcert'}
                                    fileNameProperty={
                                        'warehouse.sslrootcertFileName'
                                    }
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.ssl_root_cert.label',
                                    )}
                                    disabled={disabled}
                                    accept=".crt,.pem"
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.postgress.ssl_root_cert.description',
                                            )}
                                        </p>
                                    }
                                />
                            </>
                        ) : null}

                        <TextInput
                            name="warehouse.role"
                            label={t(
                                'components_project_connection_warehouse_form.postgress.role.label',
                            )}
                            disabled={disabled}
                            {...form.getInputProps('warehouse.role')}
                        />

                        <StartOfWeekSelect disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            defaultValue={PostgresDefaultValues.timeoutSeconds}
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label={t(
                                'components_project_connection_warehouse_form.postgress.timeout.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.postgress.timeout.description',
                                    )}
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <BooleanSwitch
                            name="warehouse.useSshTunnel"
                            {...form.getInputProps('warehouse.useSshTunnel', {
                                type: 'checkbox',
                            })}
                            label={t(
                                'components_project_connection_warehouse_form.postgress.ssh_tunnel.label',
                            )}
                            disabled={disabled}
                        />

                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack style={{ marginBottom: '8px' }}>
                                <TextInput
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.ssh_remote_port.label',
                                    )}
                                    disabled={disabled}
                                    name="warehouse.sshTunnelHost"
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelHost',
                                    )}
                                />

                                <NumberInput
                                    name="warehouse.sshTunnelPort"
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelPort',
                                    )}
                                    defaultValue={
                                        PostgresDefaultValues.sshTunnelPort
                                    }
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.ssh_remote_port.label',
                                    )}
                                    disabled={disabled}
                                />

                                <TextInput
                                    name="warehouse.sshTunnelUser"
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.ssh_username.label',
                                    )}
                                    disabled={disabled}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelUser',
                                    )}
                                />

                                {sshTunnelPublicKey && (
                                    <TextInput
                                        name="warehouse.sshTunnelPublicKey"
                                        {...form.getInputProps(
                                            'warehouse.sshTunnelPublicKey',
                                        )}
                                        label={t(
                                            'components_project_connection_warehouse_form.postgress.ssh_key.label',
                                        )}
                                        readOnly={true}
                                        disabled={disabled}
                                        rightSection={
                                            <>
                                                <CopyButton
                                                    value={sshTunnelPublicKey}
                                                >
                                                    {({ copied, copy }) => (
                                                        <Tooltip
                                                            label={
                                                                copied
                                                                    ? t(
                                                                          'components_project_connection_warehouse_form.postgress.ssh_key.copied',
                                                                      )
                                                                    : t(
                                                                          'components_project_connection_warehouse_form.postgress.ssh_key.copy',
                                                                      )
                                                            }
                                                            withArrow
                                                            position="right"
                                                        >
                                                            <ActionIcon
                                                                color={
                                                                    copied
                                                                        ? 'teal'
                                                                        : 'gray'
                                                                }
                                                                onClick={copy}
                                                            >
                                                                <MantineIcon
                                                                    icon={
                                                                        copied
                                                                            ? IconCheck
                                                                            : IconCopy
                                                                    }
                                                                />
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    )}
                                                </CopyButton>
                                            </>
                                        }
                                    />
                                )}
                                <Button
                                    onClick={() => mutate()}
                                    loading={isLoading}
                                    disabled={disabled || isLoading}
                                >
                                    {sshTunnelPublicKey
                                        ? t(
                                              'components_project_connection_warehouse_form.postgress.regenerate_key',
                                          )
                                        : t(
                                              'components_project_connection_warehouse_form.postgress.generate_public_key',
                                          )}
                                </Button>
                            </Stack>
                        </FormSection>
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.postgress.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default PostgresForm;
