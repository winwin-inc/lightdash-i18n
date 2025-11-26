import {
    CompactConfigMap,
    CustomFormatType,
    NumberSeparator,
    applyCustomFormat,
    convertCustomFormatToFormatExpression,
    currencies,
    findCompactConfig,
    getCompactOptionsForFormatType,
    type CustomFormat,
} from '@lightdash/common';
import {
    Anchor,
    Flex,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type GetInputProps } from '@mantine/form/lib/types';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type ValueOf } from 'type-fest';

type Props = {
    formatInputProps: (
        path: keyof CustomFormat,
    ) => ReturnType<GetInputProps<CustomFormat>>;
    format: CustomFormat;
    setFormatFieldValue: (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => void;
};

const formatTypeOptions = [
    CustomFormatType.DEFAULT,
    CustomFormatType.PERCENT,
    CustomFormatType.CURRENCY,
    CustomFormatType.NUMBER,
    CustomFormatType.BYTES_SI,
    CustomFormatType.BYTES_IEC,
    CustomFormatType.CUSTOM,
];

const useFormatTypeLabels = () => {
    const { t } = useTranslation();

    return {
        [CustomFormatType.ID]: t(
            'components_explorer_format_form.type_labels.id',
        ),
        [CustomFormatType.DATE]: t(
            'components_explorer_format_form.type_labels.date',
        ),
        [CustomFormatType.TIMESTAMP]: t(
            'components_explorer_format_form.type_labels.timestamp',
        ),
        [CustomFormatType.DEFAULT]: t(
            'components_explorer_format_form.type_labels.default',
        ),
        [CustomFormatType.PERCENT]: t(
            'components_explorer_format_form.type_labels.percent',
        ),
        [CustomFormatType.CURRENCY]: t(
            'components_explorer_format_form.type_labels.currency',
        ),
        [CustomFormatType.NUMBER]: t(
            'components_explorer_format_form.type_labels.number',
        ),
        [CustomFormatType.BYTES_SI]: t(
            'components_explorer_format_form.type_labels.bytes_si',
        ),
        [CustomFormatType.BYTES_IEC]: t(
            'components_explorer_format_form.type_labels.bytes_iec',
        ),
        [CustomFormatType.CUSTOM]: t(
            'components_explorer_format_form.type_labels.custom',
        ),
    } as const;
};

const formatCurrencyOptions = currencies.map((c) => {
    const currencyFormat = Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: c,
    });

    return {
        value: c,
        label: `${c} (${currencyFormat
            .format(1234.56)
            .replace(/\u00A0/, ' ')})`,
    };
});

export const FormatForm: FC<Props> = ({
    formatInputProps,
    setFormatFieldValue,
    format,
}) => {
    const { t } = useTranslation();
    const formatType = format.type;

    const validCompactValue = useMemo(() => {
        const currentCompact = format.compact;
        if (!currentCompact) return null;

        const validCompacts = getCompactOptionsForFormatType(formatType);
        const compactConfig = findCompactConfig(currentCompact);

        return compactConfig && validCompacts.includes(compactConfig.compact)
            ? currentCompact
            : null;
    }, [format.compact, formatType]);

    const formatSeparatorOptions = [
        {
            value: NumberSeparator.DEFAULT,
            label: t('components_explorer_format_form.default_separator'),
        },
        {
            value: NumberSeparator.COMMA_PERIOD,
            label: '100,000.00',
        },
        {
            value: NumberSeparator.SPACE_PERIOD,
            label: '100 000.00',
        },
        {
            value: NumberSeparator.PERIOD_COMMA,
            label: '100.000,00',
        },
        {
            value: NumberSeparator.NO_SEPARATOR_PERIOD,
            label: '100000.00',
        },
    ];

    const formatTypeLabels = useFormatTypeLabels();

    return (
        <Stack>
            <Flex>
                <Select
                    withinPortal
                    w={200}
                    label={t('components_explorer_format_form.type.label')}
                    data={formatTypeOptions.map((type) => ({
                        value: type,
                        label:
                            type === CustomFormatType.BYTES_SI
                                ? t(
                                      'components_explorer_format_form.type.data.bytes_si',
                                  )
                                : type === CustomFormatType.BYTES_IEC
                                ? t(
                                      'components_explorer_format_form.type.data.bytes_iec',
                                  )
                                : formatTypeLabels[type],
                    }))}
                    {...{
                        ...formatInputProps('type'),
                        onChange: (value) => {
                            if (value) {
                                setFormatFieldValue('type', value);
                                setFormatFieldValue('compact', undefined);
                            }
                        },
                    }}
                />

                {formatType !== CustomFormatType.DEFAULT && (
                    <Text ml="md" mt={30} w={200} color="gray.6">
                        {t(
                            'components_explorer_format_form.type.content.part_1',
                        )}{' '}
                        {applyCustomFormat(
                            CustomFormatType.PERCENT === formatType
                                ? '0.754321'
                                : '1234.56789',
                            format,
                        )}
                    </Text>
                )}
                {[
                    CustomFormatType.CURRENCY,
                    CustomFormatType.NUMBER,
                    CustomFormatType.PERCENT,
                    CustomFormatType.BYTES_SI,
                    CustomFormatType.BYTES_IEC,
                ].includes(formatType) && (
                    <Text ml="md" mt={30} w={200} color="gray.6">
                        {t('components_explorer_format_form.format.format')}:{' '}
                        {convertCustomFormatToFormatExpression(format)}
                    </Text>
                )}
            </Flex>
            {formatType === CustomFormatType.CUSTOM && (
                <TextInput
                    label={t('components_explorer_format_form.format.label')}
                    placeholder={t(
                        'components_explorer_format_form.format.placeholder',
                    )}
                    description={
                        <p>
                            {t(
                                'components_explorer_format_form.format.description.part_1',
                            )}
                            <Anchor
                                href="https://customformats.com"
                                target="_blank"
                            >
                                {t(
                                    'components_explorer_format_form.format.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_explorer_format_form.format.description.part_3',
                            )}
                        </p>
                    }
                    {...formatInputProps('custom')}
                />
            )}
            {[
                CustomFormatType.CURRENCY,
                CustomFormatType.NUMBER,
                CustomFormatType.PERCENT,
                CustomFormatType.BYTES_SI,
                CustomFormatType.BYTES_IEC,
            ].includes(formatType) && (
                <Flex>
                    {formatType === CustomFormatType.CURRENCY && (
                        <Select
                            withinPortal
                            mr="md"
                            w={200}
                            searchable
                            label={t(
                                'components_explorer_format_form.currency.label',
                            )}
                            data={formatCurrencyOptions}
                            {...formatInputProps('currency')}
                        />
                    )}
                    <NumberInput
                        // NOTE: Mantine's NumberInput component is not working properly when initial value in useForm is undefined
                        type="number"
                        min={0}
                        w={200}
                        label={t('components_explorer_format_form.round.label')}
                        placeholder={t(
                            'components_explorer_format_form.round.placeholder',
                        )}
                        {...{
                            ...formatInputProps('round'),
                            // Explicitly set value to undefined so the API doesn't received invalid values
                            onChange: (value) => {
                                setFormatFieldValue(
                                    'round',
                                    value === '' ? undefined : value,
                                );
                            },
                        }}
                    />
                    <Select
                        withinPortal
                        w={200}
                        ml="md"
                        label={t(
                            'components_explorer_format_form.separator_style.label',
                        )}
                        data={formatSeparatorOptions}
                        {...formatInputProps('separator')}
                    />
                </Flex>
            )}
            {[
                CustomFormatType.CURRENCY,
                CustomFormatType.NUMBER,
                CustomFormatType.BYTES_SI,
                CustomFormatType.BYTES_IEC,
            ].includes(formatType) && (
                <Flex>
                    <Select
                        withinPortal
                        mr="md"
                        w={200}
                        clearable
                        label={t(
                            'components_explorer_format_form.compact.label',
                        )}
                        placeholder={
                            formatType === CustomFormatType.BYTES_SI
                                ? t(
                                      'components_explorer_format_form.compact.placeholder.part_1',
                                  )
                                : formatType === CustomFormatType.BYTES_IEC
                                ? t(
                                      'components_explorer_format_form.compact.placeholder.part_2',
                                  )
                                : t(
                                      'components_explorer_format_form.compact.placeholder.part_3',
                                  )
                        }
                        data={getCompactOptionsForFormatType(formatType).map(
                            (c) => ({
                                value: c,
                                label: CompactConfigMap[c].label,
                            }),
                        )}
                        {...{
                            ...formatInputProps('compact'),
                            // Override value to ensure invalid compact values are cleared
                            value: validCompactValue,
                            onChange: (value) => {
                                // Explicitly set value to undefined so the API doesn't received invalid values
                                setFormatFieldValue(
                                    'compact',
                                    !value || !(value in CompactConfigMap)
                                        ? undefined
                                        : value,
                                );
                            },
                        }}
                    />

                    {formatType === CustomFormatType.NUMBER && (
                        <>
                            <TextInput
                                w={200}
                                mr="md"
                                label={t(
                                    'components_explorer_format_form.perfix.label',
                                )}
                                placeholder={t(
                                    'components_explorer_format_form.perfix.placeholder',
                                )}
                                {...formatInputProps('prefix')}
                            />
                            <TextInput
                                w={200}
                                label={t(
                                    'components_explorer_format_form.suffix.label',
                                )}
                                placeholder={t(
                                    'components_explorer_format_form.suffix.placeholder',
                                )}
                                {...formatInputProps('suffix')}
                            />
                        </>
                    )}
                </Flex>
            )}
        </Stack>
    );
};
