import { DateGranularity } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Text,
    useMantineTheme,
} from '@mantine/core';
import {
    IconCalendarSearch,
    IconChevronDown,
    IconChevronUp,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';

type Props = {
    isEditMode: boolean;
};

export const DateZoom: FC<Props> = ({ isEditMode }) => {
    const { t } = useTranslation();
    const theme = useMantineTheme();
    const [showOpenIcon, setShowOpenIcon] = useState(false);

    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
    const setIsDateZoomDisabled = useDashboardContext(
        (c) => c.setIsDateZoomDisabled,
    );
    const { track } = useTracking();

    useEffect(() => {
        if (isEditMode) setDateZoomGranularity(undefined);
    }, [isEditMode, setDateZoomGranularity]);

    if (isDateZoomDisabled) {
        if (isEditMode)
            return (
                <Button
                    variant="outline"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconCalendarSearch} />}
                    onClick={() => setIsDateZoomDisabled(false)}
                    sx={(themeStyles) => ({
                        borderStyle: 'dashed',
                        borderWidth: '1px',
                        borderColor: themeStyles.colors.gray[4],
                    })}
                >
                    + {t('features_date_zoom.add_date_zoom')}
                </Button>
            );
        return null;
    }

    return (
        <Menu
            withinPortal
            withArrow
            closeOnItemClick
            closeOnClickOutside
            offset={-1}
            position="bottom-end"
            disabled={isEditMode}
            onOpen={() => setShowOpenIcon(true)}
            onClose={() => setShowOpenIcon(false)}
        >
            <Menu.Target>
                <Group spacing={0} sx={{ position: 'relative' }}>
                    {isEditMode && (
                        <ActionIcon
                            size="xs"
                            variant="subtle"
                            onClick={() => setIsDateZoomDisabled(true)}
                            sx={(themeStyles) => ({
                                position: 'absolute',
                                top: -6,
                                left: -6,
                                zIndex: 1,
                                backgroundColor: themeStyles.white,
                            })}
                        >
                            <MantineIcon icon={IconX} size={12} />
                        </ActionIcon>
                    )}
                    <Button
                        size="xs"
                        variant="default"
                        loaderPosition="center"
                        disabled={isEditMode}
                        sx={{
                            borderColor: dateZoomGranularity
                                ? theme.colors.blue['6']
                                : 'default',
                        }}
                        leftIcon={<MantineIcon icon={IconCalendarSearch} />}
                        rightIcon={
                            <MantineIcon
                                icon={
                                    showOpenIcon
                                        ? IconChevronUp
                                        : IconChevronDown
                                }
                            />
                        }
                    >
                        <Text>
                            {t('features_date_zoom.date_zoom')}
                            {dateZoomGranularity ? `:` : null}{' '}
                            {dateZoomGranularity ? (
                                <Text span fw={500}>
                                    {dateZoomGranularity}
                                </Text>
                            ) : null}
                        </Text>
                    </Button>
                </Group>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label fz={10}>
                    {t('features_date_zoom.guanularity')}
                </Menu.Label>
                <Menu.Item
                    fz="xs"
                    onClick={() => {
                        track({
                            name: EventName.DATE_ZOOM_CLICKED,
                            properties: {
                                granularity: 'default',
                            },
                        });

                        setDateZoomGranularity(undefined);
                    }}
                    bg={
                        dateZoomGranularity === undefined
                            ? theme.colors.blue['6']
                            : 'white'
                    }
                    disabled={dateZoomGranularity === undefined}
                    sx={{
                        '&[disabled]': {
                            color:
                                dateZoomGranularity === undefined
                                    ? 'white'
                                    : 'black',
                        },
                    }}
                >
                    {t('features_date_zoom.default')}
                </Menu.Item>
                {Object.values(DateGranularity).map((granularity) => (
                    <Menu.Item
                        fz="xs"
                        key={granularity}
                        onClick={() => {
                            track({
                                name: EventName.DATE_ZOOM_CLICKED,
                                properties: {
                                    granularity,
                                },
                            });
                            setDateZoomGranularity(granularity);
                        }}
                        disabled={dateZoomGranularity === granularity}
                        bg={
                            dateZoomGranularity === granularity
                                ? theme.colors.blue['6']
                                : 'white'
                        }
                        sx={{
                            '&[disabled]': {
                                color:
                                    dateZoomGranularity === granularity
                                        ? 'white'
                                        : 'black',
                            },
                        }}
                    >
                        {granularity}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
