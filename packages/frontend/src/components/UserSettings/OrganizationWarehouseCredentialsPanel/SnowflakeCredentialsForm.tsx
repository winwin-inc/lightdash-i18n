import {
    Anchor,
    Select,
    Stack,
    Switch,
    TextInput,
    Textarea,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { SnowflakeOAuthInput } from '../../common/Authentication/SnowflakeOAuthInput';
import FormCollapseButton from '../../ProjectConnection/FormCollapseButton';
import FormSection from '../../ProjectConnection/Inputs/FormSection';

type Props = {
    form: UseFormReturnType<any>;
    disabled: boolean;
    showName?: boolean;
    onAuthenticated?: (isAuthenticated: boolean) => void;
};

const useDaysOfWeekOptions = () => {
    const { t } = useTranslation();

    return [
        t(
            'components_warehouse_credentials_panel_snowflake_credentials_form.week_options.monday',
        ),
        t(
            'components_warehouse_credentials_panel_snowflake_credentials_form.week_options.tuesday',
        ),
        t(
            'components_warehouse_credentials_panel_snowflake_credentials_form.week_options.wednesday',
        ),
        t(
            'components_warehouse_credentials_panel_snowflake_credentials_form.week_options.thursday',
        ),
        t(
            'components_warehouse_credentials_panel_snowflake_credentials_form.week_options.friday',
        ),
        t(
            'components_warehouse_credentials_panel_snowflake_credentials_form.week_options.saturday',
        ),
        t(
            'components_warehouse_credentials_panel_snowflake_credentials_form.week_options.sunday',
        ),
    ].map((x, index) => ({ value: index.toString(), label: x }));
};

export const SnowflakeCredentialsForm: FC<Props> = ({
    form,
    disabled,
    showName = true,
    onAuthenticated,
}) => {
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);

    const daysOfWeekOptions = useDaysOfWeekOptions();

    return (
        <Stack spacing="xs">
            {showName && (
                <TextInput
                    required
                    size="xs"
                    label={t(
                        'components_warehouse_credentials_panel_snowflake_credentials_form.name.label',
                    )}
                    disabled={disabled}
                    {...form.getInputProps('name')}
                />
            )}

            <Textarea
                size="xs"
                label={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.description.label',
                )}
                placeholder={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.description.placeholder',
                )}
                disabled={disabled}
                {...form.getInputProps('description')}
            />

            <TextInput
                required
                size="xs"
                label={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.account.label',
                )}
                placeholder={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.account.placeholder',
                )}
                description={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.account.description',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.account')}
            />

            <Select
                name="warehouse.authenticationType"
                {...form.getInputProps('warehouse.authenticationType')}
                // TODO: default value is not being recognized. private key is always being selected
                defaultValue={'SSO'}
                label={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.authentication_type.label',
                )}
                description={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.authentication_type.description',
                )}
                data={['SSO']}
                disabled={true}
            />
            <SnowflakeOAuthInput onAuthenticated={onAuthenticated} />

            <TextInput
                required
                size="xs"
                label={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.database.label',
                )}
                placeholder={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.database.placeholder',
                )}
                description={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.database.description',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.database')}
            />

            <TextInput
                required
                size="xs"
                label={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.warehouse.label',
                )}
                placeholder={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.warehouse.placeholder',
                )}
                description={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.warehouse.description',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.warehouse')}
            />

            <TextInput
                required
                size="xs"
                label={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.schema.label',
                )}
                placeholder={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.schema.placeholder',
                )}
                description={t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.schema.description',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.schema')}
            />

            <FormSection isOpen={isOpen} name="advanced">
                <Stack spacing="xs" style={{ marginTop: '8px' }}>
                    <Switch
                        size="xs"
                        label={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.always.label',
                        )}
                        description={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.always.description',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.override', {
                            type: 'checkbox',
                        })}
                    />

                    <Switch
                        size="xs"
                        label={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.require.label',
                        )}
                        description={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.require.description',
                        )}
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.requireUserCredentials',
                            {
                                type: 'checkbox',
                            },
                        )}
                    />

                    <Switch
                        size="xs"
                        label={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.keep.label',
                        )}
                        description={
                            <p>
                                {t(
                                    'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.keep.description.part_1',
                                )}{' '}
                                <Anchor
                                    target="_blank"
                                    href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                    rel="noreferrer"
                                >
                                    {t(
                                        'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.keep.description.part_2',
                                    )}
                                </Anchor>
                                {t(
                                    'components_warehouse_credentials_panel_snowflake_credentials_form.advanced.keep.description.part_3',
                                )}
                            </p>
                        }
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.clientSessionKeepAlive',
                            {
                                type: 'checkbox',
                            },
                        )}
                    />

                    <TextInput
                        size="xs"
                        label={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.query_tag.label',
                        )}
                        description={
                            <p>
                                {t(
                                    'components_warehouse_credentials_panel_snowflake_credentials_form.query_tag.description.part_1',
                                )}{' '}
                                <Anchor
                                    target="_blank"
                                    href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                    rel="noreferrer"
                                >
                                    {t(
                                        'components_warehouse_credentials_panel_snowflake_credentials_form.query_tag.description.part_2',
                                    )}
                                </Anchor>
                                {t(
                                    'components_warehouse_credentials_panel_snowflake_credentials_form.query_tag.description.part_3',
                                )}
                            </p>
                        }
                        disabled={disabled}
                        {...form.getInputProps('credentials.queryTag')}
                    />

                    <TextInput
                        size="xs"
                        label={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.url_override.label',
                        )}
                        description={
                            <p>
                                {t(
                                    'components_warehouse_credentials_panel_snowflake_credentials_form.url_override.description',
                                )}
                            </p>
                        }
                        disabled={disabled}
                        {...form.getInputProps('credentials.accessUrl')}
                    />

                    <Select
                        size="xs"
                        clearable
                        placeholder={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.start_of_week.placeholder',
                        )}
                        label={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.start_of_week.label',
                        )}
                        description={t(
                            'components_warehouse_credentials_panel_snowflake_credentials_form.start_of_week.description',
                        )}
                        data={daysOfWeekOptions}
                        disabled={disabled}
                        {...form.getInputProps('credentials.startOfWeek')}
                        value={form.values.credentials?.startOfWeek?.toString()}
                        onChange={(value) =>
                            form.setFieldValue(
                                'credentials.startOfWeek',
                                value ? parseInt(value) : null,
                            )
                        }
                    />
                </Stack>
            </FormSection>

            <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                {t(
                    'components_warehouse_credentials_panel_snowflake_credentials_form.advanced_configuration_options',
                )}
            </FormCollapseButton>
        </Stack>
    );
};
