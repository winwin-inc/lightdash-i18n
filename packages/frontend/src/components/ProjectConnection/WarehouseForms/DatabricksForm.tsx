import { WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';

import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

export const DatabricksSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            // this supposed to be a `schema` but changing it will break for existing customers
            name="warehouse.database"
            {...form.getInputProps('warehouse.database')}
            label={t(
                'components_project_connection_warehouse_form.databricks.schema.label',
            )}
            description={
                <p>
                    {t(
                        'components_project_connection_warehouse_form.databricks.schema.description.part_1',
                    )}
                    <Anchor
                        target="_blank"
                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#database-1"
                        rel="noreferrer"
                    >
                        {t(
                            'components_project_connection_warehouse_form.databricks.schema.description.part_2',
                        )}
                    </Anchor>
                    {t(
                        'components_project_connection_warehouse_form.databricks.schema.description.part_3',
                    )}
                </p>
            }
            required
            disabled={disabled}
        />
    );
};

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;

    if (form.values.warehouse?.type !== WarehouseTypes.DATABRICKS) {
        throw new Error(
            'Databricks form is not available for this warehouse type',
        );
    }

    const computes = form.values.warehouse?.compute ?? [];
    const addCompute = () => {
        form.insertListItem('warehouse.compute', {
            key: uuidv4(),
            name: '',
            httpPath: '',
        });
    };
    const removeCompute = (index: number) => {
        form.removeListItem('warehouse.compute', index);
    };

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.serverHostName"
                    {...form.getInputProps('warehouse.serverHostName')}
                    label={t(
                        'components_project_connection_warehouse_form.databricks.server.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.databricks.server.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#server-hostname"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.databricks.server.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.databricks.server.description.part_3',
                            )}
                        </p>
                    }
                    required
                    disabled={disabled}
                    placeholder={t(
                        'components_project_connection_warehouse_form.databricks.server.placeholder',
                    )}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.httpPath"
                    {...form.getInputProps('warehouse.httpPath')}
                    label={t(
                        'components_project_connection_warehouse_form.databricks.http_path.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.databricks.http_path.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#http-path"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.databricks.http_path.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.databricks.http_path.description.part_3',
                            )}
                        </p>
                    }
                    required
                    disabled={disabled}
                    placeholder={t(
                        'components_project_connection_warehouse_form.databricks.http_path.placeholder',
                    )}
                />
                <PasswordInput
                    name="warehouse.personalAccessToken"
                    {...form.getInputProps('warehouse.personalAccessToken')}
                    label={t(
                        'components_project_connection_warehouse_form.databricks.access_token.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.databricks.access_token.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.databricks.access_token.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.databricks.access_token.description.part_3',
                            )}
                        </p>
                    }
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.catalog"
                    {...form.getInputProps('warehouse.catalog')}
                    label={t(
                        'components_project_connection_warehouse_form.databricks.catalog.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.databricks.catalog.description',
                    )}
                    required
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack>
                        <StartOfWeekSelect disabled={disabled} />
                        <Stack spacing="xs">
                            <Stack spacing={0}>
                                <Text fw={500}>
                                    {t(
                                        'components_project_connection_warehouse_form.databricks.compute.label',
                                    )}
                                </Text>
                                <Text c="dimmed" size="xs">
                                    {t(
                                        'components_project_connection_warehouse_form.databricks.compute.description',
                                    )}
                                </Text>
                            </Stack>
                            <FormSection name="compute">
                                <Stack>
                                    {computes.map((field, index) => (
                                        <Group
                                            // @ts-expect-error
                                            key={field.key}
                                            noWrap
                                            spacing="xs"
                                        >
                                            <TextInput
                                                style={{
                                                    flexGrow: 1,
                                                }}
                                                size="xs"
                                                {...form.getInputProps(
                                                    `warehouse.compute.${index}.name`,
                                                )}
                                                placeholder={t(
                                                    'components_project_connection_warehouse_form.databricks.compute.placeholder',
                                                )}
                                                required
                                            />
                                            <TextInput
                                                style={{
                                                    flexGrow: 1,
                                                }}
                                                size="xs"
                                                {...form.getInputProps(
                                                    `warehouse.compute.${index}.httpPath`,
                                                )}
                                                placeholder={t(
                                                    'components_project_connection_warehouse_form.databricks.compute.http_path',
                                                )}
                                                required
                                            />
                                            <Tooltip
                                                variant="xs"
                                                label={t(
                                                    'components_project_connection_warehouse_form.databricks.compute.remove',
                                                )}
                                            >
                                                <ActionIcon
                                                    size="sm"
                                                    onClick={() =>
                                                        removeCompute(index)
                                                    }
                                                    style={{
                                                        flexGrow: 0,
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    ))}
                                    <Button
                                        variant="default"
                                        size="xs"
                                        sx={(theme) => ({
                                            alignSelf: 'flex-end',
                                            boxShadow: theme.shadows.subtle,
                                        })}
                                        leftIcon={
                                            <MantineIcon icon={IconPlus} />
                                        }
                                        onClick={addCompute}
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.databricks.compute.add',
                                        )}
                                    </Button>
                                </Stack>
                            </FormSection>
                        </Stack>
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.databricks.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default DatabricksForm;
