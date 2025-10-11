import {
    BigqueryAuthenticationType,
    FeatureFlags,
    WarehouseTypes,
} from '@lightdash/common';
import type { SelectItem } from '@mantine/core';
import {
    Anchor,
    Button,
    FileInput,
    Group,
    Image,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck } from '@tabler/icons-react';
import { useState, type ChangeEvent, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import useHealth from '../../../hooks/health/useHealth';
import {
    useBigqueryDatasets,
    useIsBigQueryAuthenticated,
} from '../../../hooks/useBigquerySSO';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import { BigQueryDefaultValues } from './defaultValues';

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            name="warehouse.dataset"
            {...form.getInputProps('warehouse.dataset')}
            label={t(
                'components_project_connection_warehouse_form.big_query.dataset.label',
            )}
            description={
                <p>
                    {t(
                        'components_project_connection_warehouse_form.big_query.dataset.label_help.part_1',
                    )}
                    <b>
                        {t(
                            'components_project_connection_warehouse_form.big_query.dataset.label_help.part_2',
                        )}
                    </b>
                    {t(
                        'components_project_connection_warehouse_form.big_query.dataset.label_help.part_3',
                    )}{' '}
                    <Anchor
                        target="_blank"
                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#:~:text=This%20connection%20method%20requires%20local%20OAuth%20via%20gcloud."
                        rel="noreferrer"
                    >
                        {t(
                            'components_project_connection_warehouse_form.big_query.dataset.label_help.part_4',
                        )}
                        <b>
                            {t(
                                'components_project_connection_warehouse_form.big_query.dataset.label_help.part_5',
                            )}
                        </b>{' '}
                        {t(
                            'components_project_connection_warehouse_form.big_query.dataset.label_help.part_6',
                        )}
                    </Anchor>
                    .
                    <DocumentationHelpButton href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#data-set" />
                </p>
            }
            required
            disabled={disabled}
        />
    );
};

export const BigQuerySSOInput: FC<{
    isAuthenticated: boolean;
    disabled: boolean;
    openLoginPopup: () => void;
}> = ({ isAuthenticated, disabled, openLoginPopup }) => {
    if (isAuthenticated) return null;

    // Similar to ThirdPartySignInButton
    return (
        <>
            <Button
                onClick={() => {
                    openLoginPopup();
                }}
                variant="default"
                color="gray"
                disabled={disabled}
                leftIcon={
                    <Image
                        width={16}
                        src={
                            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTcuNiA5LjJsLS4xLTEuOEg5djMuNGg0LjhDMTMuNiAxMiAxMyAxMyAxMiAxMy42djIuMmgzYTguOCA4LjggMCAwIDAgMi42LTYuNnoiIGZpbGw9IiM0Mjg1RjQiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik05IDE4YzIuNCAwIDQuNS0uOCA2LTIuMmwtMy0yLjJhNS40IDUuNCAwIDAgMS04LTIuOUgxVjEzYTkgOSAwIDAgMCA4IDV6IiBmaWxsPSIjMzRBODUzIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNCAxMC43YTUuNCA1LjQgMCAwIDEgMC0zLjRWNUgxYTkgOSAwIDAgMCAwIDhsMy0yLjN6IiBmaWxsPSIjRkJCQzA1IiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNOSAzLjZjMS4zIDAgMi41LjQgMy40IDEuM0wxNSAyLjNBOSA5IDAgMCAwIDEgNWwzIDIuNGE1LjQgNS40IDAgMCAxIDUtMy43eiIgZmlsbD0iI0VBNDMzNSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTAgMGgxOHYxOEgweiIvPjwvZz48L3N2Zz4='
                        }
                        alt="Google logo"
                    />
                }
                sx={{ ':hover': { textDecoration: 'underline' } }}
            >
                Sign in with Google
            </Button>
        </>
    );
};

const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();

    const {
        data,
        error: bigqueryAuthError,
        refetch: refetchAuth,
    } = useIsBigQueryAuthenticated();
    const isAuthenticated = data !== undefined && bigqueryAuthError === null;
    const form = useFormContext();
    const project = form.getInputProps('warehouse.project');
    const [debouncedProject] = useDebouncedValue(project.value, 300);
    const health = useHealth();
    const isAdcEnabled = health.data?.auth.google?.enableGCloudADC;

    const isSsoEnabled = useFeatureFlagEnabled(FeatureFlags.BigquerySSO);
    // Fetching databases can only happen if user is authenticated
    // if user authenticates, and change to private_key
    // We will not make any queries, in case private_key is different
    const isSso =
        form.values.warehouse?.type === WarehouseTypes.BIGQUERY &&
        form.values.warehouse?.authenticationType ===
            BigqueryAuthenticationType.SSO;
    const {
        data: datasets,
        refetch: refetchDatasets,
        error: datasetsError,
    } = useBigqueryDatasets(
        isSsoEnabled && isAuthenticated && isSso,
        debouncedProject,
    );
    const [isOpen, toggleOpen] = useToggle(false);
    const [temporaryFile, setTemporaryFile] = useState<File | null>(null);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean = !(
        savedProject?.warehouseConnection?.type === WarehouseTypes.BIGQUERY &&
        savedProject?.warehouseConnection?.authenticationType ===
            BigqueryAuthenticationType.PRIVATE_KEY
    );
    const hasDatasets = datasets && datasets.length > 0;
    const executionProjectField = form.getInputProps(
        'warehouse.executionProject',
    );
    if (form.values.warehouse?.type !== WarehouseTypes.BIGQUERY) {
        throw new Error('Bigquery form is not used for this warehouse type');
    }

    // savedProject might not be loaded when the form is rendered, so we need to set the defaultValue also on a hook
    const defaultAuthenticationType = isSsoEnabled
        ? BigqueryAuthenticationType.SSO
        : BigqueryAuthenticationType.PRIVATE_KEY;

    const { mutate: openLoginPopup } = useGoogleLoginPopup(
        'bigquery',
        async () => {
            await refetchAuth();
            await refetchDatasets();
        },
    );
    const authenticationType: string =
        form.values.warehouse.authenticationType ?? defaultAuthenticationType;
    const locationField = form.getInputProps('warehouse.location');

    const onChangeFactory =
        (onChange: (value: string | undefined) => void) =>
        (e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value === '' ? undefined : e.target.value);
        };
    const authenticationTypes = [
        {
            value: BigqueryAuthenticationType.PRIVATE_KEY,
            label: t(
                'components_project_connection_warehouse_form.big_query.authentication_type.data.service_account',
            ),
        },
        isSsoEnabled && {
            value: BigqueryAuthenticationType.SSO,
            label: t(
                'components_project_connection_warehouse_form.big_query.authentication_type.data.user_account',
            ),
        },
        isAdcEnabled && {
            value: BigqueryAuthenticationType.ADC,
            label: t(
                'components_project_connection_warehouse_form.big_query.authentication_type.data.application_default_credentials',
            ),
        },
    ].filter(Boolean) as SelectItem[];
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                {(isSsoEnabled || isAdcEnabled) && (
                    <Group spacing="sm">
                        <Select
                            name="warehouse.authenticationType"
                            {...form.getInputProps(
                                'warehouse.authenticationType',
                            )}
                            defaultValue={defaultAuthenticationType}
                            label={t(
                                'components_project_connection_warehouse_form.big_query.authentication_type.label',
                            )}
                            description={
                                isAuthenticated ? (
                                    <Text mt="0" color="gray" fs="xs">
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.authentication_type.description.part_1',
                                        )}{' '}
                                        <Anchor
                                            href="#"
                                            onClick={() => {
                                                openLoginPopup();
                                            }}
                                        >
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.authentication_type.description.part_2',
                                            )}
                                        </Anchor>
                                    </Text>
                                ) : (
                                    t(
                                        'components_project_connection_warehouse_form.big_query.authentication_type.description.part_3',
                                    )
                                )
                            }
                            data={authenticationTypes}
                            required
                            disabled={disabled}
                            w={isAuthenticated ? '90%' : '100%'}
                        />
                        {isAuthenticated && (
                            <Tooltip
                                label={t(
                                    'components_project_connection_warehouse_form.big_query.authentication_type.tooltip',
                                )}
                            >
                                <Group mt="40px">
                                    <MantineIcon
                                        icon={IconCheck}
                                        color="green"
                                    />
                                </Group>
                            </Tooltip>
                        )}
                    </Group>
                )}

                {isSsoEnabled &&
                    authenticationType === BigqueryAuthenticationType.SSO && (
                        <BigQuerySSOInput
                            isAuthenticated={isAuthenticated}
                            disabled={disabled}
                            openLoginPopup={openLoginPopup}
                        />
                    )}
                <Group spacing="sm">
                    <TextInput
                        name="warehouse.project"
                        label={t(
                            'components_project_connection_warehouse_form.big_query.project.label',
                        )}
                        description={
                            <p>
                                <Anchor
                                    target="_blank"
                                    href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#project"
                                    rel="noreferrer"
                                >
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.project.description',
                                    )}
                                </Anchor>
                                .
                            </p>
                        }
                        required
                        {...form.getInputProps('warehouse.project')}
                        disabled={disabled}
                        labelProps={{ style: { marginTop: '8px' } }}
                        w={hasDatasets ? '90%' : '100%'}
                        error={
                            datasetsError ? (
                                <Text color="red">
                                    {datasetsError.error.message}
                                </Text>
                            ) : undefined
                        }
                    />
                    {hasDatasets && (
                        <Tooltip
                            label={t(
                                'components_project_connection_warehouse_form.big_query.project.tooltip',
                            )}
                        >
                            <Group mt="50px">
                                <MantineIcon icon={IconCheck} color="green" />
                            </Group>
                        </Tooltip>
                    )}
                </Group>

                <TextInput
                    name="warehouse.location"
                    label={t(
                        'components_project_connection_warehouse_form.big_query.location.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.big_query.location.description.part_1',
                            )}{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#dataset-locations"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.big_query.location.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.big_query.location.description.part_3',
                            )}
                        </p>
                    }
                    {...locationField}
                    onChange={onChangeFactory(locationField.onChange)}
                    disabled={disabled}
                />

                {isSsoEnabled &&
                authenticationType === BigqueryAuthenticationType.SSO ? (
                    <>
                        {/*
                // Autocomplete for datasets
               <Select  label="Dataset"
                    name='warehouse.dataset'
                    required
                    description={
                        <p>
                            This is the name of your dbt dataset: the dataset in your
                            warehouse where the output of your dbt models is written to.
                            If you're not sure what this is, check out the
                            <b> dataset </b>
                            value{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#:~:text=This%20connection%20method%20requires%20local%20OAuth%20via%20gcloud."
                                rel="noreferrer"
                            >
                                you've set in your dbt <b>profiles.yml</b> file
                            </Anchor>
                            .
                            <DocumentationHelpButton href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#data-set" />
                        </p>
                    }
                    placeholder={hasDatasets ? 'Choose dataset': 'Type project ID to filter datasets from BigQuery'}
                    disabled={!hasDatasets}
                        data={datasets?.map(d => ({
                            value: d.datasetId,
                            label: `${d.datasetId}`
                        })) || []}
                        onChange={(value) => {
                            const selectedDataset = datasets?.find(d => d.datasetId === value)
                            form.setFieldValue('warehouse.location', selectedDataset?.location)
                        }}
                />         */}
                    </>
                ) : authenticationType ===
                  BigqueryAuthenticationType.PRIVATE_KEY ? (
                    <>
                        <FileInput
                            name="warehouse.keyfileContents"
                            {...form.getInputProps(
                                'warehouse.keyfileContents',
                                {
                                    withError: true,
                                },
                            )}
                            label={t(
                                'components_project_connection_warehouse_form.big_query.key_file.label',
                            )}
                            // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                            // @ts-ignore
                            placeholder={
                                !requireSecrets
                                    ? '**************'
                                    : t(
                                          'components_project_connection_warehouse_form.big_query.key_file.placeholder',
                                      )
                            }
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.key_file.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#key-file"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.key_file.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.key_file.description.part_3',
                                    )}
                                </p>
                            }
                            required={requireSecrets}
                            accept="application/json"
                            value={temporaryFile}
                            onChange={(file) => {
                                if (!file) {
                                    form.setFieldValue(
                                        'warehouse.keyfileContents',
                                        null,
                                    );
                                    return;
                                }

                                const fileReader = new FileReader();
                                fileReader.onload = function (event) {
                                    const contents = event.target?.result;

                                    if (typeof contents === 'string') {
                                        try {
                                            setTemporaryFile(file);
                                            form.setFieldValue(
                                                'warehouse.keyfileContents',
                                                JSON.parse(contents),
                                            );
                                        } catch (error) {
                                            // 🤷‍♂️
                                            setTimeout(() => {
                                                form.setFieldError(
                                                    'warehouse.keyfileContents',
                                                    'Invalid JSON file',
                                                );
                                            });

                                            form.setFieldValue(
                                                'warehouse.keyfileContents',
                                                null,
                                            );
                                        }
                                    } else {
                                        form.setFieldValue(
                                            'warehouse.keyfileContents',
                                            null,
                                        );
                                        setTemporaryFile(null);
                                    }
                                };
                                fileReader.readAsText(file);
                            }}
                            disabled={disabled}
                        />
                    </>
                ) : (
                    /* BigqueryAuthenticationType.ADC */
                    <></>
                )}
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isSsoEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                {...form.getInputProps(
                                    'warehouse.requireUserCredentials',
                                    {
                                        type: 'checkbox',
                                    },
                                )}
                                label={t(
                                    'components_project_connection_warehouse_form.big_query.execution_project.switch',
                                )}
                                disabled={disabled}
                                defaultChecked={
                                    BigQueryDefaultValues.requireUserCredentials
                                }
                            />
                        )}
                        <TextInput
                            name="warehouse.executionProject"
                            label={t(
                                'components_project_connection_warehouse_form.big_query.execution_project.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.execution_project.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup#execution-project"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.execution_project.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.execution_project.description.part_3',
                                    )}
                                </p>
                            }
                            {...executionProjectField}
                            onChange={onChangeFactory(
                                executionProjectField.onChange,
                            )}
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label={t(
                                'components_project_connection_warehouse_form.big_query.timeout.label',
                            )}
                            defaultValue={BigQueryDefaultValues.timeoutSeconds}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.timeout.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#timeouts"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.timeout.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.timeout.description.part_3',
                                    )}
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <Select
                            name="warehouse.priority"
                            {...form.getInputProps('warehouse.priority')}
                            defaultValue={BigQueryDefaultValues.priority}
                            label={t(
                                'components_project_connection_warehouse_form.big_query.priority.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.priority.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#priority"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.priority.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.priority.description.part_3',
                                    )}
                                </p>
                            }
                            data={[
                                {
                                    value: 'interactive',
                                    label: t(
                                        'components_project_connection_warehouse_form.big_query.priority.data.interactive',
                                    ),
                                },
                                {
                                    value: 'batch',
                                    label: t(
                                        'components_project_connection_warehouse_form.big_query.priority.data.batch',
                                    ),
                                },
                            ]}
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.retries"
                            {...form.getInputProps('warehouse.retries')}
                            defaultValue={BigQueryDefaultValues.retries}
                            label={t(
                                'components_project_connection_warehouse_form.big_query.retries.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.retries.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#retries"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.retries.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.retries.description.part_3',
                                    )}
                                </p>
                            }
                            required
                        />

                        <NumberInput
                            name="warehouse.maximumBytesBilled"
                            {...form.getInputProps(
                                'warehouse.maximumBytesBilled',
                            )}
                            defaultValue={
                                BigQueryDefaultValues.maximumBytesBilled
                            }
                            label={t(
                                'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#maximum-bytes-billed"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.description.part_3',
                                    )}
                                </p>
                            }
                            disabled={disabled}
                        />

                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.big_query.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default BigQueryForm;
