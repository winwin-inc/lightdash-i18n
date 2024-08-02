import { ActionIcon, Divider, Group, Stack, Title } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { BarChartFieldConfiguration } from './BarChartFieldConfiguration';
import { BarChartStyling } from './BarChartStyling';

export const BarChartConfig = () => {
    const { t } = useTranslation();
    const [isFieldConfigurationOpen, setIsFieldConfigurationOpen] =
        useState(true);
    const [isStylingOpen, setIsStylingOpen] = useState(false);

    return (
        <Stack spacing="xs" mb="lg">
            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    {t('features_sql_runner_bar_chart_configuration.data')}
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() =>
                            setIsFieldConfigurationOpen(
                                !isFieldConfigurationOpen,
                            )
                        }
                        icon={
                            isFieldConfigurationOpen
                                ? IconChevronDown
                                : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isFieldConfigurationOpen && <BarChartFieldConfiguration />}

            <Divider />

            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    {t('features_sql_runner_bar_chart_configuration.styling')}
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() => setIsStylingOpen(!isStylingOpen)}
                        icon={
                            isStylingOpen ? IconChevronDown : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isStylingOpen && <BarChartStyling />}
        </Stack>
    );
};
