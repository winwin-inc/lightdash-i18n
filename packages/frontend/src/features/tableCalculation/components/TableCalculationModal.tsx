import {
    CustomFormatType,
    getErrorMessage,
    getItemId,
    isFormulaTableCalculation,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    NumberSeparator,
    TableCalculationTotalMode,
    TableCalculationType,
    type CustomFormat,
    type TableCalculation,
} from '@lightdash/common';
import { SUPPORTED_DIALECTS } from '@lightdash/formula';
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
import { useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { type ValueOf } from 'type-fest';

import { FormatForm } from '../../../components/Explorer/FormatForm';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    selectCustomDimensions,
    selectMetricQuery,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useCannotAuthorCustomSqlTableCalculations } from '../../../hooks/user/useCannotAuthorCustomSqlTableCalculations';
import useToaster from '../../../hooks/toaster/useToaster';
import { getUniqueTableCalculationName } from '../utils';
import { FormulaForm } from './FormulaForm/FormulaForm';
import { SqlForm } from './SqlForm';
import { TemplateViewer } from './TemplateViewer/TemplateViewer';

type Props = ModalProps & {
    tableCalculation?: TableCalculation;
    onSave: (tableCalculation: TableCalculation) => void;
};

type TableCalculationFormInputs = {
    name: string;
    sql: string;
    formula: string;
    format: CustomFormat;
    type?: TableCalculationType;
    totalMode?: TableCalculationTotalMode;
};

enum EditMode {
    SQL = 'sql',
    TEMPLATE = 'template',
    FORMULA = 'formula',
}

const useTableCalculationTypeLabels = () => {
    const { t } = useTranslation();

    return {
        [TableCalculationType.NUMBER]: t(
            'features_table_calculation_modal.type_labels.number',
        ),
        [TableCalculationType.STRING]: t(
            'features_table_calculation_modal.type_labels.string',
        ),
        [TableCalculationType.DATE]: t(
            'features_table_calculation_modal.type_labels.date',
        ),
        [TableCalculationType.TIMESTAMP]: t(
            'features_table_calculation_modal.type_labels.timestamp',
        ),
        [TableCalculationType.BOOLEAN]: t(
            'features_table_calculation_modal.type_labels.boolean',
        ),
    } as const;
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

    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const tableName = useExplorerSelector(selectTableName);
    const projectUuid = useProjectUuid();
    const { data: project } = useProject(projectUuid);
    const { data: explore } = useExplore(tableName);

    const formulaSupported = useMemo(() => {
        const warehouseType = project?.warehouseConnection?.type;
        return (
            !!warehouseType &&
            (SUPPORTED_DIALECTS as readonly string[]).includes(warehouseType)
        );
    }, [project?.warehouseConnection?.type]);

    const tableCalculationTypeLabels = useTableCalculationTypeLabels();

    // Default mode: formula if editing formula calc; template if template; else sql
    const hasTemplate = tableCalculation
        ? isTemplateTableCalculation(tableCalculation)
        : false;
    const hasFormula = tableCalculation
        ? isFormulaTableCalculation(tableCalculation)
        : false;
    const defaultMode = hasFormula
        ? EditMode.FORMULA
        : hasTemplate
          ? EditMode.TEMPLATE
          : formulaSupported
            ? EditMode.FORMULA
            : EditMode.SQL;
    const [editMode, setEditMode] = useState<EditMode>(defaultMode);
    const [formulaError, setFormulaError] = useState<string | null>(null);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    const { t } = useTranslation();
    const { addToastError } = useToaster();
    const cannotAuthorSqlTcs =
        useCannotAuthorCustomSqlTableCalculations(projectUuid) === true;

    const form = useForm<TableCalculationFormInputs>({
        initialValues: {
            name: tableCalculation?.displayName || '',
            sql:
                tableCalculation && isSqlTableCalculation(tableCalculation)
                    ? tableCalculation.sql
                    : '',
            formula:
                tableCalculation && isFormulaTableCalculation(tableCalculation)
                    ? tableCalculation.formula
                    : '=',
            type: tableCalculation?.type || TableCalculationType.NUMBER,
            totalMode:
                tableCalculation?.totalMode || TableCalculationTotalMode.FORMULA,
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
        const { name, sql, formula } = data;
        if (editMode === EditMode.SQL && cannotAuthorSqlTcs) {
            addToastError({
                title: t(
                    'features_table_calculation_modal.tips.no_sql_permission',
                ),
                key: 'table-calculation-modal',
            });
            return;
        }
        if (sql.length === 0 && editMode === EditMode.SQL) {
            addToastError({
                title: t('features_table_calculation_modal.tips.empty'),
                key: 'table-calculation-modal',
            });
            return;
        }
        if (
            editMode === EditMode.FORMULA &&
            (formula.trim().length === 0 || formula.trim() === '=')
        ) {
            addToastError({
                title: t('features_table_calculation_modal.tips.empty'),
                key: 'table-calculation-modal',
            });
            return;
        }
        if (editMode === EditMode.FORMULA && formulaError) {
            addToastError({
                title: formulaError,
                key: 'table-calculation-modal',
            });
            return;
        }
        if (name.length === 0) {
            addToastError({
                title: t('features_table_calculation_modal.tips.name'),
                key: 'table-calculation-modal',
            });
            return;
        }
        try {
            const isNewCalculation = !tableCalculation;
            const nameChanged =
                tableCalculation && tableCalculation.displayName !== name;

            let finalName: string;
            if (isNewCalculation || nameChanged) {
                finalName = getUniqueTableCalculationName(
                    name,
                    tableCalculations,
                    tableCalculation,
                );
            } else {
                finalName = tableCalculation.name;
            }

            if (
                editMode === EditMode.TEMPLATE &&
                tableCalculation &&
                isTemplateTableCalculation(tableCalculation)
            ) {
                onSave({
                    name: finalName,
                    displayName: name,
                    format: data.format,
                    type: data.type,
                    totalMode: data.totalMode,
                    template: tableCalculation.template,
                });
            } else if (editMode === EditMode.FORMULA) {
                const normalized = formula.trim().startsWith('=')
                    ? formula.trim()
                    : `=${formula.trim()}`;
                onSave({
                    name: finalName,
                    displayName: name,
                    format: data.format,
                    type: data.type,
                    totalMode: data.totalMode,
                    formula: normalized,
                });
            } else {
                onSave({
                    name: finalName,
                    displayName: name,
                    format: data.format,
                    type: data.type,
                    totalMode: data.totalMode,
                    sql,
                });
            }
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

                            {(hasTemplate || formulaSupported || hasFormula) && (
                                <Select
                                    label={t(
                                        'features_table_calculation_modal.form.calculation_mode.label',
                                    )}
                                    value={editMode}
                                    onChange={(value) =>
                                        setEditMode(value as EditMode)
                                    }
                                    data={[
                                        ...(formulaSupported || hasFormula
                                            ? [
                                                  {
                                                      value: EditMode.FORMULA,
                                                      label: t(
                                                          'features_table_calculation_modal.form.calculation_mode.dropdown.formula',
                                                      ),
                                                  },
                                              ]
                                            : []),
                                        {
                                            value: EditMode.SQL,
                                            label: t(
                                                'features_table_calculation_modal.form.calculation_mode.dropdown.raw_sql',
                                            ),
                                            disabled: cannotAuthorSqlTcs,
                                        },
                                        ...(hasTemplate
                                            ? [
                                                  {
                                                      value: EditMode.TEMPLATE,
                                                      label: t(
                                                          'features_table_calculation_modal.form.calculation_mode.dropdown.template',
                                                      ),
                                                  },
                                              ]
                                            : []),
                                    ]}
                                    mb="md"
                                />
                            )}

                            {editMode === EditMode.FORMULA ? (
                                <Tabs
                                    key="formula"
                                    defaultValue="formula"
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
                                        <Tabs.Tab value="formula">
                                            Formula
                                        </Tabs.Tab>
                                        <Tabs.Tab value="format">
                                            {t(
                                                'features_table_calculation_modal.form.tabs.format',
                                            )}
                                        </Tabs.Tab>
                                    </Tabs.List>
                                    <Tabs.Panel value="formula" p="sm">
                                        <FormulaForm
                                            explore={explore}
                                            metricQuery={metricQuery}
                                            formula={form.values.formula}
                                            initialFormula={
                                                form.values.formula
                                            }
                                            onChange={(value) =>
                                                form.setFieldValue(
                                                    'formula',
                                                    value,
                                                )
                                            }
                                            onValidationChange={setFormulaError}
                                            isFullScreen={isExpanded}
                                        />
                                        {formulaError ? (
                                            <Text color="red" size="sm" mt="xs">
                                                {formulaError}
                                            </Text>
                                        ) : null}
                                    </Tabs.Panel>
                                    <Tabs.Panel value="format" p="sm">
                                        <FormatForm
                                            formatInputProps={
                                                getFormatInputProps
                                            }
                                            setFormatFieldValue={
                                                setFormatFieldValue
                                            }
                                            format={form.values.format}
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            ) : editMode === EditMode.TEMPLATE ? (
                                <Tabs
                                    key="template"
                                    defaultValue="template"
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
                                        <Tabs.Tab value="template">
                                            {t(
                                                'features_table_calculation_modal.form.tabs.template',
                                            )}
                                        </Tabs.Tab>

                                        <Tabs.Tab value="format">
                                            {t(
                                                'features_table_calculation_modal.form.tabs.format',
                                            )}
                                        </Tabs.Tab>
                                    </Tabs.List>

                                    <Tabs.Panel value="template" p="sm">
                                        <TemplateViewer
                                            template={
                                                tableCalculation &&
                                                isTemplateTableCalculation(
                                                    tableCalculation,
                                                )
                                                    ? tableCalculation.template
                                                    : undefined
                                            }
                                            readOnly={true}
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="format" p="sm">
                                        <FormatForm
                                            formatInputProps={
                                                getFormatInputProps
                                            }
                                            setFormatFieldValue={
                                                setFormatFieldValue
                                            }
                                            format={form.values.format}
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            ) : (
                                <Tabs
                                    key="sql"
                                    defaultValue={'sqlEditor'}
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
                                            formatInputProps={
                                                getFormatInputProps
                                            }
                                            setFormatFieldValue={
                                                setFormatFieldValue
                                            }
                                            format={form.values.format}
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            )}

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
                                    data={Object.values(
                                        TableCalculationType,
                                    ).map((item) => {
                                        return {
                                            value: item,
                                            label:
                                                tableCalculationTypeLabels[
                                                    item
                                                ] || item,
                                        };
                                    })}
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
