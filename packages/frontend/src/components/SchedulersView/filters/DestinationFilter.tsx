import {
    Badge,
    Button,
    Checkbox,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type DestinationType } from '../../../features/scheduler/hooks/useSchedulerFilters';
import classes from './FormatFilter.module.css';

interface DestinationFilterProps {
    selectedDestinations: DestinationType[];
    setSelectedDestinations: (destinations: DestinationType[]) => void;
    availableDestinations: DestinationType[];
}

const DestinationFilter: FC<DestinationFilterProps> = ({
    selectedDestinations,
    setSelectedDestinations,
    availableDestinations,
}) => {
    const { t } = useTranslation();
    const hasSelectedDestinations = selectedDestinations.length > 0;

    const DESTINATION_LABELS: Record<DestinationType, string> = {
        slack: t('components_schedulers_view_filters_destination_filter.slack'),
        email: t('components_schedulers_view_filters_destination_filter.email'),
        msteams: t(
            'components_schedulers_view_filters_destination_filter.msteams',
        ),
    };

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={t(
                        'components_schedulers_view_filters_destination_filter.filter_by_destination',
                    )}
                >
                    <Button
                        h={32}
                        c="gray.7"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
                        px="sm"
                        className={
                            hasSelectedDestinations
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedDestinations ? (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="indigo.6"
                                    circle
                                    styles={{
                                        root: {
                                            minWidth: 18,
                                            height: 18,
                                            padding: '0 4px',
                                        },
                                    }}
                                >
                                    {selectedDestinations.length}
                                </Badge>
                            ) : null
                        }
                    >
                        {t(
                            'components_schedulers_view_filters_destination_filter.destination',
                        )}
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="dark.3" fw={600}>
                        {t(
                            'components_schedulers_view_filters_destination_filter.filter_by',
                        )}
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Stack gap="xs">
                            {availableDestinations.map((destination) => (
                                <Checkbox
                                    key={destination}
                                    label={DESTINATION_LABELS[destination]}
                                    checked={selectedDestinations.includes(
                                        destination,
                                    )}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() => {
                                        if (
                                            selectedDestinations.includes(
                                                destination,
                                            )
                                        ) {
                                            setSelectedDestinations(
                                                selectedDestinations.filter(
                                                    (d) => d !== destination,
                                                ),
                                            );
                                        } else {
                                            setSelectedDestinations([
                                                ...selectedDestinations,
                                                destination,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default DestinationFilter;
