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
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import { RedshiftDefaultValues } from './defaultValues';
import { useCreateSshKeyPair } from './sshHooks';

export const RedshiftSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            name="warehouse.schema"
            label={t(
                'components_project_connection_warehouse_form.redshift.schema.label',
            )}
            description={t(
                'components_project_connection_warehouse_form.redshift.schema.description',
            )}
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const RedshiftForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.REDSHIFT;

    if (form.values.warehouse?.type !== WarehouseTypes.REDSHIFT) {
        throw new Error(
            'Redshift form is not available for this warehouse type',
        );
    }

    const showSshTunnelConfiguration: boolean =
        form.values.warehouse.useSshTunnel ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.REDSHIFT &&
            savedProject.warehouseConnection.useSshTunnel) ??
        false;

    const sshTunnelPublicKey: string | undefined =
        form.values.warehouse.sshTunnelPublicKey ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.REDSHIFT
            ? savedProject?.warehouseConnection?.sshTunnelPublicKey
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
                    name="warehouse.host"
                    label={t(
                        'components_project_connection_warehouse_form.redshift.host.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.redshift.host.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.user"
                    label={t(
                        'components_project_connection_warehouse_form.redshift.user.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.redshift.user.description',
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
                <PasswordInput
                    name="warehouse.password"
                    label={t(
                        'components_project_connection_warehouse_form.redshift.password.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.redshift.password.description',
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
                <TextInput
                    name="warehouse.dbname"
                    label={t(
                        'components_project_connection_warehouse_form.redshift.db_name.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.redshift.db_name.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.dbname')}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label={t(
                                    'components_project_connection_warehouse_form.redshift.require_user_credentials.label',
                                )}
                                {...form.getInputProps(
                                    'warehouse.requireUserCredentials',
                                    { type: 'checkbox' },
                                )}
                                defaultChecked={
                                    RedshiftDefaultValues.requireUserCredentials
                                }
                                disabled={disabled}
                            />
                        )}

                        <NumberInput
                            name="warehouse.port"
                            defaultValue={RedshiftDefaultValues.port}
                            {...form.getInputProps('warehouse.port')}
                            label={t(
                                'components_project_connection_warehouse_form.redshift.port.label',
                            )}
                            description={t(
                                'components_project_connection_warehouse_form.redshift.port.description',
                            )}
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.keepalivesIdle"
                            {...form.getInputProps('warehouse.keepalivesIdle')}
                            defaultValue={RedshiftDefaultValues.keepalivesIdle}
                            label={t(
                                'components_project_connection_warehouse_form.redshift.keep_alive_idle.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.redshift.keep_alive_idle.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://postgresqlco.nf/doc/en/param/tcp_keepalives_idle/"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.redshift.keep_alive_idle.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.redshift.keep_alive_idle.description.part_3',
                                    )}
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <Select
                            name="warehouse.sslmode"
                            {...form.getInputProps('warehouse.sslmode')}
                            defaultValue={RedshiftDefaultValues.sslmode}
                            label={t(
                                'components_project_connection_warehouse_form.redshift.ssl_mode.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.redshift.ssl_mode.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/docs/core/connect-data-platform/redshift-setup#sslmode-change"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.redshift.ssl_mode.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.redshift.ssl_mode.description.part_3',
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

                        <BooleanSwitch
                            name="warehouse.ra3Node"
                            label={t(
                                'components_project_connection_warehouse_form.redshift.ra3_node.label',
                            )}
                            description={t(
                                'components_project_connection_warehouse_form.redshift.ra3_node.description',
                            )}
                            {...form.getInputProps('warehouse.ra3Node', {
                                type: 'checkbox',
                            })}
                            onLabel={t(
                                'components_project_connection_warehouse_form.redshift.ra3_node.yes',
                            )}
                            offLabel={t(
                                'components_project_connection_warehouse_form.redshift.ra3_node.no',
                            )}
                        />

                        <StartOfWeekSelect disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            defaultValue={RedshiftDefaultValues.timeoutSeconds}
                            label={t(
                                'components_project_connection_warehouse_form.redshift.timeout.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.redshift.timeout.description',
                                    )}
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <BooleanSwitch
                            name="warehouse.useSshTunnel"
                            label={t(
                                'components_project_connection_warehouse_form.redshift.ssh_tunnel.label',
                            )}
                            description={t(
                                'components_project_connection_warehouse_form.redshift.ssh_tunnel.description',
                            )}
                            {...form.getInputProps('warehouse.useSshTunnel', {
                                type: 'checkbox',
                            })}
                            onLabel="Yes"
                            offLabel="No"
                            defaultChecked={RedshiftDefaultValues.useSshTunnel}
                        />

                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack style={{ marginBottom: '8px' }}>
                                <TextInput
                                    name="warehouse.sshTunnelHost"
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.ssh_remote_host.label',
                                    )}
                                    disabled={disabled}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelHost',
                                    )}
                                />

                                <NumberInput
                                    name="warehouse.sshTunnelPort"
                                    defaultValue={22}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelPort',
                                    )}
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.ssh_remote_port.label',
                                    )}
                                    disabled={disabled}
                                />

                                <TextInput
                                    name="warehouse.sshTunnelUser"
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.ssh_username.label',
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
                                            'components_project_connection_warehouse_form.redshift.ssh_key.label',
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
                                                                          'components_project_connection_warehouse_form.redshift.ssh_key.copied',
                                                                      )
                                                                    : t(
                                                                          'components_project_connection_warehouse_form.redshift.ssh_key.copy',
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
                                              'components_project_connection_warehouse_form.redshift.regenerate_key',
                                          )
                                        : t(
                                              'components_project_connection_warehouse_form.redshift.generate_public_key',
                                          )}
                                </Button>
                            </Stack>
                        </FormSection>
                    </Stack>
                </FormSection>

                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.redshift.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default RedshiftForm;
