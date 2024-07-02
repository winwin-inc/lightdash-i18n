import { CartesianSeriesType } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    type Icon,
} from '@tabler/icons-react';
import { forwardRef, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../common/MantineIcon';

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    icon: Icon;
    label: string;
    description: string;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ icon, ...others }: ItemProps, ref) => (
        <div ref={ref} {...others}>
            <MantineIcon icon={icon} />
        </div>
    ),
);

const useChartTypeOptions = () => {
    const { t } = useTranslation();

    return [
        {
            value: CartesianSeriesType.BAR,
            label: t(
                'components_visualization_configs_chart.series.type_options.bar',
            ),
            icon: IconChartBar,
        },
        {
            value: CartesianSeriesType.LINE,
            label: t(
                'components_visualization_configs_chart.series.type_options.line',
            ),
            icon: IconChartLine,
        },
        {
            value: CartesianSeriesType.AREA,
            label: t(
                'components_visualization_configs_chart.series.type_options.area',
            ),
            icon: IconChartArea,
        },
        {
            value: CartesianSeriesType.SCATTER,
            label: t(
                'components_visualization_configs_chart.series.type_options.scatter',
            ),
            icon: IconChartDots,
        },
    ];
};

type Props = {
    chartValue: string;
    showMixed: boolean;
    showLabel?: boolean;
} & Pick<SelectProps, 'onChange'>;

export const ChartTypeSelect: FC<Props> = ({
    chartValue,
    onChange,
    showMixed,
    showLabel = true,
}) => {
    const { t } = useTranslation();

    const chartTypeOptions = useChartTypeOptions();

    const options = useMemo(
        () => [
            ...chartTypeOptions,
            ...(showMixed
                ? [
                      {
                          value: 'mixed',
                          label: t(
                              'components_visualization_configs_chart.series.mixed',
                          ),
                          icon: IconChartAreaLine,
                      },
                  ]
                : []),
        ],
        [showMixed, chartTypeOptions, t],
    );

    const selectedChartIcon = useMemo(
        () => chartTypeOptions.find((type) => type.value === chartValue)?.icon,
        [chartValue, chartTypeOptions],
    );

    return (
        <Select
            label={
                showLabel &&
                t('components_visualization_configs_chart.series.type')
            }
            value={chartValue}
            data={options}
            onChange={onChange}
            itemComponent={SelectItem}
            icon={
                selectedChartIcon && (
                    <MantineIcon color="gray.8" icon={selectedChartIcon} />
                )
            }
            styles={{
                input: {
                    color: 'transparent',
                    width: '4px',
                },
            }}
        />
    );
};
