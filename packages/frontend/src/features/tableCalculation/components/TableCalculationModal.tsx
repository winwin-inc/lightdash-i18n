import {
    CustomFormatType,
    getErrorMessage,
    getItemId,
    NumberSeparator,
    TableCalculationType,
    type CustomFormat,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Modal,
    Paper,
    Select,
    Stack,
    Tabs,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconCalculator,
    IconMaximize,
    IconMinimize,
} from '@tabler/icons-react';
import { useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { type ValueOf } from 'type-fest';
import MantineIcon from '../../../components/common/MantineIcon';
import { FormatForm } from '../../../components/Explorer/FormatForm';
import useToaster from '../../../hooks/toaster/useToaster';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
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
    const { colors } = theme;
    const [isExpanded, toggleExpanded] = useToggle(false);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    const { t } = useTranslation();
    const { addToastError } = useToaster();

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
                currency: tableCalculation?.format?.currency,
                compact: tableCalculation?.format?.compact,
                prefix: tableCalculation?.format?.prefix,
                suffix: tableCalculation?.format?.suffix,
                custom: tableCalculation?.format?.custom,
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
        // throw error if sql is empty
        if (sql.length === 0) {
            addToastError({
                title: t('features_table_calculation_modal.tips.empty'),
                key: 'table-calculation-modal',
            });
            return;
        }
        // throw error if name is empty
        if (name.length === 0) {
            addToastError({
                title: t('features_table_calculation_modal.tips.name'),
                key: 'table-calculation-modal',
            });
            return;
        }
        try {
            onSave({
                name: getUniqueTableCalculationName(name, tableCalculations),
                displayName: name,
                sql,
                format: data.format,
                type: data.type,
            });
        } catch (e) {
            addToastError({
                title: t('features_table_calculation_modal.tips.error'),
                subtitle: getErrorMessage(e),
                key: 'table-calculation-modal',
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
        <Modal.Root
            opened={opened}
            onClose={onClose}
            size="xl"
            centered
            styles={{
                content: {
                    minWidth: isExpanded ? '90vw' : 'auto',
                    height: isExpanded ? '80vh' : 'auto',
                },
            }}
        >
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: isExpanded ? '90vh' : '60vh',
                }}
            >
                <Modal.Header
                    sx={(themeProps) => ({
                        borderBottom: `1px solid ${themeProps.colors.gray[2]}`,
                        padding: themeProps.spacing.sm,
                    })}
                >
                    <Group spacing="xs">
                        <Paper p="xs" withBorder radius="sm">
                            <MantineIcon icon={IconCalculator} size="sm" />
                        </Paper>
                        <Text color="dark.7" fw={700} fz="md">
                            {tableCalculation
                                ? t('features_table_calculation_modal.edit')
                                : t('features_table_calculation_modal.create')}
                            {tableCalculation ? (
                                <Text span fw={400}>
                                    {' '}
                                    - {tableCalculation.displayName}
                                </Text>
                            ) : null}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <form
                    name="table_calculation"
                    onSubmit={handleSubmit}
                    style={{ display: 'contents' }}
                >
                    <Modal.Body
                        p={0}
                        sx={{
                            flex: 1,
                        }}
                    >
                        <Stack p="sm" spacing="xs">
                            <TextInput
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
                                        borderColor: colors.gray[2],
                                        borderWidth: 1,
                                        borderStyle: 'solid',
                                        borderTop: 'none',
                                        height: isExpanded
                                            ? 'calc(90vh - 400px)'
                                            : 'auto',
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
                                    <SqlForm
                                        form={form}
                                        isFullScreen={isExpanded}
                                        focusOnRender={true}
                                        onCmdEnter={() => {
                                            if (submitButtonRef.current) {
                                                submitButtonRef.current.click();
                                            }
                                        }}
                                    />
                                </Tabs.Panel>
                                <Tabs.Panel value="format" p="sm">
                                    <FormatForm
                                        formatInputProps={getFormatInputProps}
                                        setFormatFieldValue={
                                            setFormatFieldValue
                                        }
                                        format={form.values.format}
                                    />
                                </Tabs.Panel>
                            </Tabs>

                            <Tooltip
                                position="right"
                                withArrow
                                multiline
                                maw={400}
                                variant="xs"
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
                                    sx={{
                                        alignSelf: 'flex-start',
                                    }}
                                    {...form.getInputProps('type')}
                                    onChange={(value) => {
                                        const tcType = Object.values(
                                            TableCalculationType,
                                        ).find((type) => type === value);
                                        if (tcType)
                                            form.setFieldValue(`type`, tcType);
                                    }}
                                    data={Object.values(TableCalculationType)}
                                />
                            </Tooltip>
                        </Stack>
                    </Modal.Body>

                    <Box
                        sx={(themeProps) => ({
                            borderTop: `1px solid ${themeProps.colors.gray[2]}`,
                            padding: themeProps.spacing.sm,
                            backgroundColor: themeProps.white,
                            position: 'sticky',
                            bottom: 0,
                            width: '100%',
                            zIndex: getDefaultZIndex('modal'),
                        })}
                    >
                        <Group position="apart">
                            <Tooltip
                                label={t(
                                    'features_table_calculation_modal.form.expand',
                                )}
                                variant="xs"
                            >
                                <ActionIcon
                                    variant="outline"
                                    onClick={toggleExpanded}
                                >
                                    <MantineIcon
                                        icon={
                                            isExpanded
                                                ? IconMinimize
                                                : IconMaximize
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>

                            <Group spacing="xs">
                                <Button
                                    variant="default"
                                    h={32}
                                    onClick={onClose}
                                >
                                    {t(
                                        'features_table_calculation_modal.form.cancel',
                                    )}
                                </Button>
                                <Button
                                    h={32}
                                    type="submit"
                                    ref={submitButtonRef}
                                    data-testid="table-calculation-save-button"
                                >
                                    {tableCalculation
                                        ? t(
                                              'features_table_calculation_modal.form.save_changes',
                                          )
                                        : t(
                                              'features_table_calculation_modal.form.create',
                                          )}
                                </Button>
                            </Group>
                        </Group>
                    </Box>
                </form>
            </Modal.Content>
        </Modal.Root>
    );
};

export default TableCalculationModal;
