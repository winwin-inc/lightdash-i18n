import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CloseButton,
    CopyButton,
    FileInput,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { type FC, useState } from 'react';
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

const CertificateFileInput: FC<{
    name: string;
    fileNameProperty: string;
    label: string;
    disabled: boolean;
    description: React.ReactNode;
    accept: string;
}> = ({ name, fileNameProperty, label, disabled, description, accept }) => {
    const { register, setValue } = useFormContext();
    const fileNamePlaceholder = useWatch({
        name: fileNameProperty,
    });
    const [temporaryFile, setTemporaryFile] = useState<File | null>(null);
    return (
        <>
            {/* Registering a hidden field for file name */}
            <input type="hidden" {...register(fileNameProperty)} />
            <Controller
                name={name}
                render={({ field }) => (
                    <FileInput
                        {...field}
                        label={label}
                        // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                        // @ts-ignore
                        placeholder={fileNamePlaceholder || 'Choose file...'}
                        description={description}
                        {...register(name)}
                        accept={accept}
                        value={temporaryFile}
                        onChange={(file) => {
                            if (file) {
                                const fileReader = new FileReader();
                                fileReader.onload = function (event) {
                                    const contents = event.target?.result;
                                    if (typeof contents === 'string') {
                                        setTemporaryFile(file);
                                        field.onChange(contents);
                                        setValue(fileNameProperty, file.name);
                                    } else {
                                        field.onChange(null);
                                        setValue(fileNameProperty, undefined);
                                    }
                                };
                                fileReader.readAsText(file);
                            }
                            field.onChange(null);
                        }}
                        disabled={disabled}
                        rightSection={
                            (temporaryFile || fileNamePlaceholder) && (
                                <CloseButton
                                    variant="transparent"
                                    onClick={() => {
                                        setTemporaryFile(null);
                                        field.onChange(null);
                                        setValue(fileNameProperty, undefined);
                                    }}
                                />
                            )
                        }
                    />
                )}
            />
        </>
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
    const sslMode: string = useWatch({
        name: 'warehouse.sslmode',
        defaultValue:
            savedProject?.warehouseConnection?.type ===
                WarehouseTypes.POSTGRES &&
            savedProject?.warehouseConnection?.sslmode,
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
                        {sslMode === 'verify-full' ? (
                            <>
                                <CertificateFileInput
                                    name={'warehouse.sslcert'}
                                    fileNameProperty={
                                        'warehouse.sslcertFileName'
                                    }
                                    label={'SSL certificate'}
                                    disabled={disabled}
                                    accept=".crt,.pem"
                                    description={
                                        <p>
                                            The client certificate used to
                                            authenticate your connection to the
                                            database.
                                        </p>
                                    }
                                />
                                <CertificateFileInput
                                    name={'warehouse.sslkey'}
                                    fileNameProperty={
                                        'warehouse.sslkeyFileName'
                                    }
                                    label={'SSL private key'}
                                    disabled={disabled}
                                    accept=".key,.pem"
                                    description={
                                        <p>
                                            The private key associated with your
                                            certificate, required for secure
                                            authentication.
                                        </p>
                                    }
                                />
                            </>
                        ) : null}
                        {sslMode === 'verify-ca' ||
                        sslMode === 'verify-full' ? (
                            <CertificateFileInput
                                name={'warehouse.sslrootcert'}
                                fileNameProperty={
                                    'warehouse.sslrootcertFileName'
                                }
                                label={'SSL root certificate'}
                                disabled={disabled}
                                accept=".crt,.pem"
                                description={
                                    <p>
                                        The trusted certificate authority (CA)
                                        certificate used to verify the database
                                        server’s identity.
                                    </p>
                                }
                            />
                        ) : null}

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
