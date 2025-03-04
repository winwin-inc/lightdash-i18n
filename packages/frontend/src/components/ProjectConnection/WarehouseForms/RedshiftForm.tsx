import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CopyButton,
    Group,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    Switch,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../useProjectFormContext';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { useCreateSshKeyPair } from './sshHooks';

export const RedshiftSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            label={t(
                'components_project_connection_warehouse_form.redshift.schema.label',
            )}
            description={t(
                'components_project_connection_warehouse_form.redshift.schema.description',
            )}
            required
            {...register('warehouse.schema', {
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            })}
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
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.REDSHIFT;
    const { setValue, register } = useFormContext();
    const showSshTunnelConfiguration: boolean = useWatch({
        name: 'warehouse.useSshTunnel',
        defaultValue:
            (savedProject?.warehouseConnection?.type ===
                WarehouseTypes.REDSHIFT &&
                savedProject.warehouseConnection.useSshTunnel) ||
            false,
    });
    const sshTunnelPublicKey: string = useWatch({
        name: 'warehouse.sshTunnelPublicKey',
        defaultValue:
            savedProject?.warehouseConnection?.type ===
                WarehouseTypes.REDSHIFT &&
            savedProject.warehouseConnection.sshTunnelPublicKey,
    });
    const { mutate, isLoading } = useCreateSshKeyPair({
        onSuccess: (data) => {
            setValue('warehouse.sshTunnelPublicKey', data.publicKey);
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
                        'components_project_connection_warehouse_form.redshift.host.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.redshift.host.description',
                    )}
                    required
                    {...register('warehouse.host', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Host'),
                        },
                    })}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.redshift.user.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.redshift.user.description',
                    )}
                    required={requireSecrets}
                    {...register('warehouse.user', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('User'),
                        },
                    })}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <PasswordInput
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
                    {...register('warehouse.password')}
                    disabled={disabled}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.redshift.db_name.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.redshift.db_name.description',
                    )}
                    required
                    {...register('warehouse.dbname', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('DB name'),
                        },
                    })}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label={t(
                                    'components_project_connection_warehouse_form.redshift.switch.label',
                                )}
                                defaultValue={false}
                                disabled={disabled}
                            />
                        )}
                        <Controller
                            name="warehouse.port"
                            defaultValue={5439}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.port.label',
                                    )}
                                    description={t(
                                        'components_project_connection_warehouse_form.redshift.port.description',
                                    )}
                                    required
                                    disabled={disabled}
                                />
                            )}
                        />
                        <Controller
                            name="warehouse.keepalivesIdle"
                            defaultValue={0}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
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
                            )}
                        />
                        <Controller
                            name="warehouse.sslmode"
                            defaultValue="prefer"
                            render={({ field }) => (
                                <Select
                                    name={field.name}
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
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            )}
                        />
                        <Controller
                            name="warehouse.ra3Node"
                            render={({ field }) => (
                                <Switch.Group
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.ra3_node.label',
                                    )}
                                    description={t(
                                        'components_project_connection_warehouse_form.redshift.ra3_node.description',
                                    )}
                                    value={field.value ? ['true'] : []}
                                    onChange={(values) =>
                                        field.onChange(values.length > 0)
                                    }
                                    size="md"
                                >
                                    <Group mt="xs">
                                        <Switch
                                            onLabel={t(
                                                'components_project_connection_warehouse_form.redshift.ra3_node.yes',
                                            )}
                                            offLabel={t(
                                                'components_project_connection_warehouse_form.redshift.ra3_node.no',
                                            )}
                                            value="true"
                                            disabled={disabled}
                                        />
                                    </Group>
                                </Switch.Group>
                            )}
                        />

                        <StartOfWeekSelect disabled={disabled} />

                        <Controller
                            name="warehouse.timeoutSeconds"
                            defaultValue={300}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label="Timeout in seconds"
                                    description={
                                        <p>
                                            If a query takes longer than this
                                            timeout to complete, then the query
                                            will be cancelled.
                                        </p>
                                    }
                                    required
                                    disabled={disabled}
                                />
                            )}
                        />

                        <Controller
                            name="warehouse.useSshTunnel"
                            render={({ field }) => (
                                <Switch.Group
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.ssh_tunnel.label',
                                    )}
                                    value={field.value ? ['true'] : []}
                                    onChange={(values) =>
                                        field.onChange(values.length > 0)
                                    }
                                    size="md"
                                >
                                    <Group mt="xs">
                                        <Switch
                                            onLabel={t(
                                                'components_project_connection_warehouse_form.redshift.ssh_tunnel.yes',
                                            )}
                                            offLabel={t(
                                                'components_project_connection_warehouse_form.redshift.ssh_tunnel.no',
                                            )}
                                            value="true"
                                            disabled={disabled}
                                        />
                                    </Group>
                                </Switch.Group>
                            )}
                        />
                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack style={{ marginBottom: '8px' }}>
                                <TextInput
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.ssh_remote_host.label',
                                    )}
                                    disabled={disabled}
                                    {...register('warehouse.sshTunnelHost')}
                                />
                                <Controller
                                    name="warehouse.sshTunnelPort"
                                    defaultValue={22}
                                    render={({ field }) => (
                                        <NumberInput
                                            {...field}
                                            label={t(
                                                'components_project_connection_warehouse_form.redshift.ssh_remote_port.label',
                                            )}
                                            disabled={disabled}
                                        />
                                    )}
                                />
                                <TextInput
                                    label={t(
                                        'components_project_connection_warehouse_form.redshift.ssh_username.label',
                                    )}
                                    disabled={disabled}
                                    {...register('warehouse.sshTunnelUser')}
                                />
                                {sshTunnelPublicKey && (
                                    <TextInput
                                        {...register(
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
