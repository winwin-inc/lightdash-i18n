import { Group, Stack, Text, type TextInputProps } from '@mantine/core';
import isNil from 'lodash/isNil';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import z from 'zod';
import FilterNumberInput from './FilterNumberInput';

interface Props extends Omit<TextInputProps, 'type' | 'value' | 'onChange'> {
    value?: unknown[];
    onChange: (value: unknown[]) => void;
}

const numberRangeSchema = z.tuple([
    z.number().nullable().optional(),
    z.number().nullable().optional(),
]);

const FilterNumberRangeInput: FC<Props> = ({
    value,
    disabled,
    placeholder,
    onChange,
    autoFocus,
    ...rest
}) => {
    const { t } = useTranslation();
    const parsed = numberRangeSchema.safeParse(value);
    const min = parsed.success ? parsed.data[0] : undefined;
    const max = parsed.success ? parsed.data[1] : undefined;

    let errorMessage: string | undefined;
    if (!isNil(min) || !isNil(max)) {
        if (isNil(min) || isNil(max)) {
            errorMessage = t(
                'components_common_filters.number_range.both_required',
            );
        } else if (min > max) {
            errorMessage = t(
                'components_common_filters.number_range.min_less_than_max',
            );
        }
    }

    return (
        <Stack spacing={2} w="100%">
            <Group noWrap align="start" spacing="xs">
                <FilterNumberInput
                    error={!!errorMessage}
                    disabled={disabled}
                    autoFocus={true}
                    placeholder={t(
                        'components_common_filters.number_range.min',
                    )}
                    {...rest}
                    value={value?.[0]}
                    onChange={(newValue) => {
                        onChange([newValue, value?.[1]]);
                    }}
                />

                <Text
                    color="dimmed"
                    mt={7}
                    sx={{ whiteSpace: 'nowrap' }}
                    size="xs"
                >
                    –
                </Text>

                <FilterNumberInput
                    error={!!errorMessage}
                    disabled={disabled}
                    placeholder={t(
                        'components_common_filters.number_range.max',
                    )}
                    {...rest}
                    value={value?.[1]}
                    onChange={(newValue) => {
                        onChange([value?.[0], newValue]);
                    }}
                />
            </Group>
            {errorMessage && (
                <Text color="red" size="xs">
                    {errorMessage}
                </Text>
            )}
        </Stack>
    );
};

export default FilterNumberRangeInput;
