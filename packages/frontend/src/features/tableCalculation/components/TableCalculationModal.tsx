import {
    CustomFormatType,
    getItemId,
    NumberSeparator,
    TableCalculationType,
    type CustomFormat,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Modal,
    Select,
    Stack,
    Tabs,
    TextInput,
    Tooltip,
    useMantineTheme,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconMaximize, IconMinimize } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { type ValueOf } from 'type-fest';
import MantineIcon from '../../../components/common/MantineIcon';
import { FormatForm } from '../../../components/Explorer/FormatForm';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { getUniqueTableCalculationName } from '../utils';
import { SqlForm } from './SqlForm';

type Props = ModalProps & {
    tableCalculation?: TableCalculation;
    onSave: (tableCalculation: TableCalculation) => void;
};

type TableCalculationFormInputs = {
    name: string;
    sql: string;
    format: CustomFormat;
    type?: TableCalculationType;
};

const TableCalculationModal: FC<Props> = ({
    opened,
    tableCalculation,
    onSave,
    onClose,
}) => {
    const theme = useMantineTheme();
    const [isFullscreen, toggleFullscreen] = useToggle(false);

    const { showToastError } = useToaster();
    const { t } = useTranslation();

    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );

    const form = useForm<TableCalculationFormInputs>({
        initialValues: {
            name: tableCalculation?.displayName || '',
            sql: tableCalculation?.sql || '',
            type: tableCalculation?.type || TableCalculationType.NUMBER,
            format: {
                type:
                    tableCalculation?.format?.type || CustomFormatType.DEFAULT,
                round: tableCalculation?.format?.round,
                separator:
                    tableCalculation?.format?.separator ||
                    NumberSeparator.DEFAULT,
                currency: tableCalculation?.format?.currency || 'USD',
                compact: tableCalculation?.format?.compact,
                prefix: tableCalculation?.format?.prefix,
                suffix: tableCalculation?.format?.suffix,
            },
        },
        validate: {
            name: (label) => {
                if (!label) return null;

                if (
                    tableCalculation &&
                    tableCalculation.displayName === label
                ) {
                    return null;
                }

                const isInvalid = [
                    ...tableCalculations,
                    ...(customDimensions ?? []),
                ].some(
                    (i) =>
                        getItemId(i).toLowerCase().trim() ===
                        label.toLowerCase().trim(),
                );

                return isInvalid
                    ? t('features_table_calculation_modal.tips.invalid')
                    : null;
            },
        },
    });

    const handleSubmit = form.onSubmit((data) => {
        const { name, sql } = data;
        if (sql.length === 0)
            return showToastError({
                title: t('features_table_calculation_modal.tips.empty'),
            });

        try {
            onSave({
                name: getUniqueTableCalculationName(name, tableCalculations),
                displayName: name,
                sql,
                format: data.format,
                type: data.type,
            });
        } catch (e) {
            showToastError({
                title: t('features_table_calculation_modal.tips.error'),
                subtitle: e.message,
            });
        }
    });

    const getFormatInputProps = (path: keyof CustomFormat) => {
        return form.getInputProps(`format.${path}`);
    };

    const setFormatFieldValue = (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => {
        return form.setFieldValue(`format.${path}`, value);
    };

    return (
        <Modal
            opened={opened}
            onClose={() => onClose()}
            size="xl"
            title={
                tableCalculation
                    ? t('features_table_calculation_modal.tips.edit')
                    : t('features_table_calculation_modal.tips.add')
            }
            styles={{
                title: {
                    fontSize: theme.fontSizes.md,
                    fontWeight: 700,
                },
                body: {
                    paddingBottom: 0,
                },
                content: {
                    maxHeight: '70vh !important',
                },
            }}
            fullScreen={isFullscreen}
        >
            <form name="table_calculation" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        mb="sm"
                        label={t(
                            'features_table_calculation_modal.form.name.label',
                        )}
                        required
                        placeholder={t(
                            'features_table_calculation_modal.form.name.placeholder',
                        )}
                        data-testid="table-calculation-name-input"
                        {...form.getInputProps('name')}
                    />

                    <Tabs
                        defaultValue="sqlEditor"
                        color="indigo"
                        variant="outline"
                        radius="xs"
                        styles={{
                            panel: {
                                borderColor: theme.colors.gray[2],
                                borderWidth: 1,
                                borderStyle: 'solid',
                                borderTop: 'none',
                                height: isFullscreen
                                    ? 'calc(100vh - 260px)'
                                    : '100%',
                            },
                        }}
                    >
                        <Tabs.List>
                            <Tabs.Tab value="sqlEditor">
                                {t(
                                    'features_table_calculation_modal.form.tabs.sql',
                                )}
                            </Tabs.Tab>
                            <Tabs.Tab value="format">
                                {t(
                                    'features_table_calculation_modal.form.tabs.format',
                                )}
                            </Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="sqlEditor">
                            <SqlForm form={form} isFullScreen={isFullscreen} />
                        </Tabs.Panel>
                        <Tabs.Panel value="format">
                            <FormatForm
                                formatInputProps={getFormatInputProps}
                                setFormatFieldValue={setFormatFieldValue}
                                format={form.values.format}
                            />
                        </Tabs.Panel>
                    </Tabs>
                    <Tooltip
                        position="bottom"
                        withArrow
                        multiline
                        maw={400}
                        withinPortal
                        label={t(
                            'features_table_calculation_modal.form.tooltip.label',
                        )}
                    >
                        <Select
                            label={t(
                                'features_table_calculation_modal.form.tooltip.select.label',
                            )}
                            id="download-type"
                            {...form.getInputProps('type')}
                            onChange={(value) => {
                                const tcType = Object.values(
                                    TableCalculationType,
                                ).find((type) => type === value);
                                if (tcType) form.setFieldValue(`type`, tcType);
                            }}
                            data={Object.values(TableCalculationType)}
                        ></Select>
                    </Tooltip>
                </Stack>

                <Stack
                    sx={() => ({
                        position: 'sticky',
                        backgroundColor: 'white',
                        bottom: 0,
                        zIndex: 2,
                    })}
                >
                    <Group
                        position="apart"
                        sx={() => ({
                            padding: theme.spacing.md,
                        })}
                    >
                        <ActionIcon
                            variant="outline"
                            onClick={toggleFullscreen}
                        >
                            <MantineIcon
                                icon={
                                    isFullscreen ? IconMinimize : IconMaximize
                                }
                            />
                        </ActionIcon>

                        <Group>
                            <Button variant="outline" onClick={onClose}>
                                {t(
                                    'features_table_calculation_modal.form.cancel',
                                )}
                            </Button>
                            <Button
                                type="submit"
                                data-testid="table-calculation-save-button"
                            >
                                {t(
                                    'features_table_calculation_modal.form.save',
                                )}
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default TableCalculationModal;
