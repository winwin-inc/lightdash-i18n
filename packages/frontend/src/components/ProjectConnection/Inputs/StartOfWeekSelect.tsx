import { Alert, Select, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';

const daysOfWeekOptions = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
].map((x, index) => ({ value: index.toString(), label: x }));

const StartOfWeekSelect: FC<{
    disabled: boolean;
    isRedeployRequired?: boolean;
}> = ({ disabled, isRedeployRequired = true }) => {
    const form = useFormContext();
    const field = form.getInputProps('warehouse.startOfWeek');
    const { t } = useTranslation();

    return (
        <>
            <Select
                name="warehouse.startOfWeek"
                clearable
                placeholder="Auto"
                label={t(
                    'components_project_connection_warehouse_form.inputs.label',
                )}
                description={t(
                    'components_project_connection_warehouse_form.inputs.description',
                )}
                data={daysOfWeekOptions}
                value={field.value?.toString()}
                onChange={(value) =>
                    field.onChange(value ? parseInt(value) : null)
                }
                disabled={disabled}
                dropdownPosition="top"
            />
            {isRedeployRequired && parseInt(field.value) >= 0 && (
                <Alert
                    icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                    title={t(
                        'components_project_connection_warehouse_form.inputs.alert.title',
                    )}
                    color="blue"
                >
                    {t(
                        'components_project_connection_warehouse_form.inputs.alert.content.part_1',
                    )}{' '}
                    <Text fw={500}>
                        <code>
                            {t(
                                'components_project_connection_warehouse_form.inputs.alert.content.part_2',
                            )}
                            {field.value}
                        </code>
                    </Text>{' '}
                    {t(
                        'components_project_connection_warehouse_form.inputs.alert.content.part_3',
                    )}
                </Alert>
            )}
        </>
    );
};

export default StartOfWeekSelect;
