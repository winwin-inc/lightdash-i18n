import { type DashboardFilterRule } from '@lightdash/common';
import {
    Button,
    CloseButton,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../common/MantineIcon';

type Props = {
    isEditMode: boolean;
    filterRule: DashboardFilterRule;
    onRemove?: () => void;
};

const InvalidFilter: FC<Props> = ({ isEditMode, filterRule, onRemove }) => {
    const { t } = useTranslation();
    const theme = useMantineTheme();

    return (
        <Tooltip
            position="top-start"
            withinPortal
            offset={0}
            arrowOffset={16}
            label={
                <Text span>
                    <Text span color="gray.6">
                        {t(
                            'components_dashboard_filter.filter_invalid.unknown',
                        )}
                    </Text>
                    <Text span> {filterRule.target.fieldId}</Text>
                </Text>
            }
        >
            <Button
                size="xs"
                variant="default"
                radius="md"
                data-disabled
                leftIcon={
                    <MantineIcon
                        icon={IconAlertTriangle}
                        color="red.6"
                        style={{ color: theme.colors.red[6] }}
                    />
                }
                sx={{
                    '&[data-disabled="true"]': {
                        pointerEvents: 'all',
                    },
                }}
                rightIcon={
                    isEditMode && <CloseButton size="sm" onClick={onRemove} />
                }
            >
                <Text fz="xs">
                    <Text fw={600} span>
                        {t(
                            'components_dashboard_filter.filter_invalid.invalid_filter',
                        )}
                    </Text>
                </Text>
            </Button>
        </Tooltip>
    );
};

export default InvalidFilter;
