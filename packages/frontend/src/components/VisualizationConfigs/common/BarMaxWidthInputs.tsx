import { Group, NumberInput, Stack, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Config } from './Config';

const pxSuffix = (
    <Text component="span" size="xs" c="gray.5" pr={6}>
        px
    </Text>
);

type Props = {
    translationPrefix: string;
    desktopValue: number | undefined;
    mobileValue: number | undefined;
    onDesktopChange: (value: number | undefined) => void;
    onMobileChange: (value: number | undefined) => void;
};

export const BarMaxWidthInputs: FC<Props> = ({
    translationPrefix,
    desktopValue,
    mobileValue,
    onDesktopChange,
    onMobileChange,
}) => {
    const { t } = useTranslation();

    const parseValue = (value: string | number) =>
        value === '' || value == null ? undefined : Number(value);

    return (
        <Stack spacing={4}>
            <Text size="xs" fw={500} c="gray.6">
                {t(`${translationPrefix}.bar_max_width_section`)}
            </Text>
            <Group spacing="md" align="flex-end" wrap="nowrap">
                <Tooltip
                    variant="xs"
                    label={t(`${translationPrefix}.bar_max_width_hint`)}
                >
                    <Group spacing="xs" wrap="nowrap" align="baseline">
                        <Config.Label>
                            {t(`${translationPrefix}.bar_max_width`)}
                        </Config.Label>
                        <NumberInput
                            type="number"
                            maw={56}
                            value={desktopValue ?? ''}
                            placeholder={t(
                                `${translationPrefix}.bar_max_width_placeholder`,
                            )}
                            min={1}
                            rightSection={pxSuffix}
                            rightSectionWidth={32}
                            onChange={(value) =>
                                onDesktopChange(parseValue(value))
                            }
                        />
                    </Group>
                </Tooltip>
                <Tooltip
                    variant="xs"
                    label={t(`${translationPrefix}.bar_max_width_mobile_hint`)}
                >
                    <Group spacing="xs" wrap="nowrap" align="baseline">
                        <Config.Label>
                            {t(`${translationPrefix}.bar_max_width_mobile`)}
                        </Config.Label>
                        <NumberInput
                            type="number"
                            maw={56}
                            value={mobileValue ?? ''}
                            placeholder={t(
                                `${translationPrefix}.bar_max_width_mobile_placeholder`,
                            )}
                            min={1}
                            rightSection={pxSuffix}
                            rightSectionWidth={32}
                            onChange={(value) =>
                                onMobileChange(parseValue(value))
                            }
                        />
                    </Group>
                </Tooltip>
            </Group>
        </Stack>
    );
};
