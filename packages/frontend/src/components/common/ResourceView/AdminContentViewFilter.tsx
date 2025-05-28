import {
    Center,
    Divider,
    SegmentedControl,
    type SegmentedControlProps,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../MantineIcon';

type AdminContentViewFilterProps = {
    withDivider?: boolean;
    segmentedControlProps?: Omit<
        SegmentedControlProps,
        'data' | 'value' | 'onChange'
    >;
    value: 'all' | 'shared';
    onChange: (value: 'all' | 'shared') => void;
};

const AdminContentViewFilter: React.FC<AdminContentViewFilterProps> = ({
    withDivider = true,
    segmentedControlProps,
    value,
    onChange,
}) => {
    const { t } = useTranslation();

    return (
        <>
            {withDivider && (
                <Divider
                    orientation="vertical"
                    w={1}
                    h={20}
                    sx={{
                        alignSelf: 'center',
                    }}
                />
            )}

            <SegmentedControl
                size="xs"
                radius="md"
                {...segmentedControlProps}
                data={[
                    {
                        value: 'shared',
                        label: (
                            <Center px={'xxs'}>
                                <Text size="sm" color="gray.7">
                                    {t(
                                        'components_common_admin_content.shared_with_me',
                                    )}
                                </Text>
                            </Center>
                        ),
                    },
                    {
                        value: 'all',
                        label: (
                            <Center px={'xxs'}>
                                <Tooltip
                                    withArrow
                                    withinPortal
                                    position="top"
                                    label={t(
                                        'components_common_admin_content.view_all',
                                    )}
                                >
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        color="gray.6"
                                    />
                                </Tooltip>
                                <Text size="sm" color="gray.7" ml={'xxs'}>
                                    {t(
                                        'components_common_admin_content.admin_content_view',
                                    )}
                                </Text>
                            </Center>
                        ),
                    },
                ]}
                value={value}
                onChange={(newValue) => {
                    onChange(newValue as 'all' | 'shared');
                }}
            />
        </>
    );
};

export default AdminContentViewFilter;
