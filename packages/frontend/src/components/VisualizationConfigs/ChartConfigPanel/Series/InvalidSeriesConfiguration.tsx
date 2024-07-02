import { Stack, Text } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const InvalidSeriesConfiguration: FC<{ itemId: string }> = ({ itemId }) => {
    const { t } = useTranslation();

    return (
        <Stack>
            <Text color="gray.6">
                <span
                    style={{
                        width: '100%',
                    }}
                >
                    {t('components_visualization_configs_chart.series.tried')}{' '}
                    {itemId}
                </span>
            </Text>
        </Stack>
    );
};

export default InvalidSeriesConfiguration;
