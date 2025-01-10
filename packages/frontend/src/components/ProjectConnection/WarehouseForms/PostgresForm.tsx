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
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../useProjectFormContext';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { useCreateSshKeyPair } from './sshHooks';

export const PostgresSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            label={t(
                'components_project_connection_warehouse_form.postgress.schema.label',
            )}
            description={t(
                'components_project_connection_warehouse_form.postgress.schema.description',
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

const PostgresForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.POSTGRES;
    const { setValue, register } = useFormContext();
    const showSshTunnelConfiguration: boolean = useWatch({
        name: 'warehouse.useSshTunnel',
        defaultValue:
            (savedProject?.warehouseConnection?.type ===
                WarehouseTypes.POSTGRES &&
                savedProject?.warehouseConnection?.useSshTunnel) ||
            false,
    });
    const sshTunnelPublicKey: string = useWatch({
        name: 'warehouse.sshTunnelPublicKey',
        defaultValue:
            savedProject?.warehouseConnection?.type ===
                WarehouseTypes.POSTGRES &&
            savedProject?.warehouseConnection?.sshTunnelPublicKey,
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
                        'components_project_connection_warehouse_form.postgress.host.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.host.description',
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
                        'components_project_connection_warehouse_form.postgress.user.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.user.description',
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
                        'components_project_connection_warehouse_form.postgress.password.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.password.description',
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
                        'components_project_connection_warehouse_form.postgress.db_name.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.postgress.db_name.description',
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
                                    'components_project_connection_warehouse_form.postgress.switch.label',
                                )}
                                defaultValue={false}
                                disabled={disabled}
                            />
                        )}
                        <Controller
                            name="warehouse.port"
                            defaultValue={5432}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.port.label',
                                    )}
                                    description={t(
                                        'components_project_connection_warehouse_form.postgress.port.description',
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
                            )}
                        />
                        <TextInput
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
                            {...register('warehouse.searchPath')}
                        />
                        <Controller
                            name="warehouse.sslmode"
                            defaultValue="prefer"
                            render={({ field }) => (
                                <Select
                                    name={field.name}
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
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            )}
                        />

                        <TextInput
                            label={t(
                                'components_project_connection_warehouse_form.postgress.role.label',
                            )}
                            disabled={disabled}
                            {...register('warehouse.role')}
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

                        <BooleanSwitch
                            name="warehouse.useSshTunnel"
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
                                    {...register('warehouse.sshTunnelHost')}
                                />
                                <Controller
                                    name="warehouse.sshTunnelPort"
                                    defaultValue={22}
                                    render={({ field }) => (
                                        <NumberInput
                                            {...field}
                                            label={t(
                                                'components_project_connection_warehouse_form.postgress.ssh_remote_port.label',
                                            )}
                                            disabled={disabled}
                                        />
                                    )}
                                />
                                <TextInput
                                    label={t(
                                        'components_project_connection_warehouse_form.postgress.ssh_username.label',
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
