import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type DashboardChartTile,
    type DashboardSqlChartTile,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Modal,
    Select,
    Stack,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useChartSummaries } from '../../../hooks/useChartSummaries';
import MantineIcon from '../../common/MantineIcon';

interface ChartUpdateModalProps extends ModalProps {
    onClose: () => void;
    hideTitle: boolean;
    onConfirm?: (
        newTitle: string | undefined,
        newChartUuid: string,
        shouldHideTitle: boolean,
    ) => void;
    tile: DashboardChartTile | DashboardSqlChartTile;
}

const ChartUpdateModal = ({
    onClose,
    onConfirm,
    hideTitle,
    tile,
    ...modalProps
}: ChartUpdateModalProps) => {
    const { t } = useTranslation();
    const form = useForm({
        initialValues: {
            uuid: isDashboardSqlChartTile(tile)
                ? tile.properties.savedSqlUuid
                : tile.properties.savedChartUuid,
            title: tile.properties.title,
            hideTitle,
        },
    });
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isInitialLoading } =
        useChartSummaries(projectUuid);

    const handleConfirm = form.onSubmit(
        ({
            title: newTitle,
            uuid: newChartUuid,
            hideTitle: shouldHideTitle,
        }) => {
            if (newChartUuid) {
                onConfirm?.(newTitle, newChartUuid, shouldHideTitle);
            }
        },
    );

    return (
        <Modal
            onClose={() => onClose?.()}
            title={
                <Title order={4}>
                    {t(
                        'components_dashboard_tiles_forms_update_chart.edit_tile_content',
                    )}
                </Title>
            }
            withCloseButton
            className="non-draggable"
            {...modalProps}
        >
            <form onSubmit={handleConfirm} name="Edit tile content">
                <Stack spacing="md">
                    <Flex align="flex-end" gap="xs">
                        <TextInput
                            label={t(
                                'components_dashboard_tiles_forms_update_chart.title',
                            )}
                            placeholder={tile.properties.chartName || undefined}
                            {...form.getInputProps('title')}
                            style={{ flex: 1 }}
                            disabled={form.values.hideTitle}
                        />
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="lg"
                            onClick={() =>
                                form.setFieldValue(
                                    'hideTitle',
                                    !form.values.hideTitle,
                                )
                            }
                        >
                            <MantineIcon
                                icon={
                                    form.values.hideTitle ? IconEyeOff : IconEye
                                }
                            />
                        </ActionIcon>
                    </Flex>
                    {isDashboardChartTileType(tile) &&
                        tile.properties.belongsToDashboard && (
                            <Select
                                styles={(theme) => ({
                                    separator: {
                                        position: 'sticky',
                                        top: 0,
                                        backgroundColor: 'white',
                                    },
                                    separatorLabel: {
                                        color: theme.colors.gray[6],
                                        fontWeight: 500,
                                    },
                                })}
                                id="savedChartUuid"
                                name="savedChartUuid"
                                label={t(
                                    'components_dashboard_tiles_forms_update_chart.select_chart',
                                )}
                                data={(savedCharts || []).map(
                                    ({ uuid, name, spaceName }) => {
                                        return {
                                            value: uuid,
                                            label: name,
                                            group: spaceName,
                                        };
                                    },
                                )}
                                disabled={isInitialLoading}
                                withinPortal
                                {...form.getInputProps('uuid')}
                                searchable
                                placeholder={t(
                                    'components_dashboard_tiles_forms_update_chart.search',
                                )}
                            />
                        )}
                    <Group spacing="xs" position="right" mt="md">
                        <Button onClick={() => onClose?.()} variant="outline">
                            {t(
                                'components_dashboard_tiles_forms_update_chart.cancel',
                            )}
                        </Button>
                        <Button type="submit">
                            {' '}
                            {t(
                                'components_dashboard_tiles_forms_update_chart.update',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartUpdateModal;
