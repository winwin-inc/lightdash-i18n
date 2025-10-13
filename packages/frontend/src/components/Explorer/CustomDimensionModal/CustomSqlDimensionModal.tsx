import {
    capitalize,
    convertFieldRefToFieldId,
    CustomDimensionType,
    DimensionType,
    getAllReferences,
    getItemId,
    snakeCaseName,
    type CustomSqlDimension,
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
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconMaximize, IconMinimize, IconSql } from '@tabler/icons-react';
import { useEffect, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { SqlEditor } from '../../../features/tableCalculation/components/SqlForm';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCustomDimensionsAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import MantineIcon from '../../common/MantineIcon';

type FormValues = {
    customDimensionLabel: string;
    sql: string;
    dimensionType: DimensionType;
};
const generateCustomSqlDimensionId = (label: string) => snakeCaseName(label);

export const CustomSqlDimensionModal: FC<{
    isEditing: boolean;
    table: string;
    item?: CustomSqlDimension;
}> = ({ isEditing, table, item }) => {
    const theme = useMantineTheme();
    const { colors } = theme;
    const { showToastSuccess, showToastError } = useToaster();
    const { setAceEditor } = useCustomDimensionsAceEditorCompleter();
    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const addCustomDimension = useExplorerContext(
        (context) => context.actions.addCustomDimension,
    );
    const editCustomDimension = useExplorerContext(
        (context) => context.actions.editCustomDimension,
    );
    const [isExpanded, toggleExpanded] = useToggle(false);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    const { t } = useTranslation();

    const form = useForm<FormValues>({
        initialValues: {
            customDimensionLabel: '',
            sql: '',
            dimensionType: DimensionType.STRING,
        },
        validate: {
            customDimensionLabel: (label) => {
                if (!label) return null;

                const customDimensionId = generateCustomSqlDimensionId(label);

                if (isEditing && item && customDimensionId === item.id) {
                    return null;
                }

                const isInvalid = [
                    ...tableCalculations,
                    ...(customDimensions ?? []),
                ].some(
                    (i) =>
                        getItemId(i).toLowerCase().trim() ===
                        customDimensionId.toLowerCase().trim(),
                );

                return isInvalid
                    ? t(
                          'components_explorer_custom_sql_dimension_modal.tips.is_exists',
                      )
                    : null;
            },
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (isEditing && item) {
            setFieldValue('customDimensionLabel', item.name);
            setFieldValue('sql', item.sql);
            setFieldValue('dimensionType', item.dimensionType);
        }
    }, [setFieldValue, item, isEditing]);

    const handleOnSubmit = form.onSubmit((values) => {
        const sanitizedId = generateCustomSqlDimensionId(
            values.customDimensionLabel,
        );

        try {
            if (!values.sql) {
                throw new Error(
                    t(
                        'components_explorer_custom_sql_dimension_modal.tips.sql_is_required',
                    ),
                );
            }
            // Validate all references in SQL
            const fieldIds = getAllReferences(values.sql).map((ref) => {
                try {
                    return convertFieldRefToFieldId(ref);
                } catch (error) {
                    return null;
                }
            });

            if (fieldIds.some((id) => id === null)) {
                throw new Error(
                    t(
                        'components_explorer_custom_sql_dimension_modal.tips.invalid_field_reference',
                    ),
                );
            }

            // Only proceed if all conversions succeeded
            let customDim: CustomSqlDimension = {
                id: sanitizedId,
                name: values.customDimensionLabel,
                table,
                type: CustomDimensionType.SQL,
                sql: values.sql,
                dimensionType: values.dimensionType,
            };

            if (isEditing && item) {
                editCustomDimension({ ...customDim, id: item.id }, item.id);
                showToastSuccess({
                    title: t(
                        'components_explorer_custom_sql_dimension_modal.tips.edit_success',
                    ),
                });
            } else {
                addCustomDimension(customDim);
                showToastSuccess({
                    title: t(
                        'components_explorer_custom_sql_dimension_modal.tips.add_success',
                    ),
                });
            }

            form.reset();
            toggleModal();
        } catch (error) {
            showToastError({
                title: t(
                    'components_explorer_custom_sql_dimension_modal.tips.error',
                ),
                subtitle:
                    error instanceof Error
                        ? error.message
                        : t(
                              'components_explorer_custom_sql_dimension_modal.tips.error_message',
                          ),
            });
        }
    });

    return (
        <Modal.Root
            opened={true}
            onClose={() => {
                toggleModal(undefined);
                form.reset();
            }}
            size="xl"
            centered
            styles={{
                content: {
                    minWidth: isExpanded ? '90vw' : 'auto',
                    height: isExpanded ? '70vh' : 'auto',
                },
            }}
        >
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
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
                            <MantineIcon icon={IconSql} size="sm" />
                        </Paper>
                        <Text color="dark.7" fw={700} fz="md">
                            {isEditing
                                ? t(
                                      'components_explorer_custom_sql_dimension_modal.modal.edit',
                                  )
                                : t(
                                      'components_explorer_custom_sql_dimension_modal.modal.create',
                                  )}{' '}
                            {t(
                                'components_explorer_custom_sql_dimension_modal.modal.title',
                            )}
                            {item ? (
                                <Text span fw={400}>
                                    {' '}
                                    - {item.name}
                                </Text>
                            ) : null}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <form
                    onSubmit={handleOnSubmit}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                    }}
                >
                    <Modal.Body
                        p={0}
                        sx={{
                            flex: 1,
                            overflow: 'auto',
                            height: isExpanded ? '100%' : 'auto',
                        }}
                    >
                        <Stack p="sm" spacing="xs">
                            <Group position="apart">
                                <TextInput
                                    label={t(
                                        'components_explorer_custom_sql_dimension_modal.form.label.label',
                                    )}
                                    required
                                    placeholder={t(
                                        'components_explorer_custom_sql_dimension_modal.form.label.placeholder',
                                    )}
                                    style={{ flex: 1 }}
                                    {...form.getInputProps(
                                        'customDimensionLabel',
                                    )}
                                    data-testid="CustomSqlDimensionModal/LabelInput"
                                />
                                <Select
                                    sx={{
                                        alignSelf: 'flex-start',
                                    }}
                                    withinPortal={true}
                                    label={t(
                                        'components_explorer_custom_sql_dimension_modal.form.label.select',
                                    )}
                                    data={Object.values(DimensionType).map(
                                        (type) => ({
                                            value: type,
                                            label: capitalize(type),
                                        }),
                                    )}
                                    {...form.getInputProps('dimensionType')}
                                />
                            </Group>
                            <Box
                                sx={{
                                    border: `1px solid ${colors.gray[2]}`,
                                    borderRadius: theme.radius.sm,
                                }}
                            >
                                <SqlEditor
                                    mode="sql"
                                    placeholder={t(
                                        'components_explorer_custom_sql_dimension_modal.form.sql.placeholder',
                                    )}
                                    theme="github"
                                    width="100%"
                                    maxLines={Infinity}
                                    minLines={isExpanded ? 25 : 8}
                                    setOptions={{
                                        autoScrollEditorIntoView: true,
                                    }}
                                    onLoad={setAceEditor}
                                    isFullScreen={isExpanded}
                                    enableLiveAutocompletion
                                    enableBasicAutocompletion
                                    showPrintMargin={false}
                                    wrapEnabled={true}
                                    gutterBackgroundColor={colors.gray['1']}
                                    {...form.getInputProps('sql')}
                                />
                            </Box>
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
                                    'components_explorer_custom_sql_dimension_modal.form.tooltip.expand_collapse',
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
                                    onClick={() => {
                                        toggleModal(undefined);
                                        form.reset();
                                    }}
                                >
                                    {t(
                                        'components_explorer_custom_sql_dimension_modal.form.cancel',
                                    )}
                                </Button>
                                <Button
                                    h={32}
                                    type="submit"
                                    ref={submitButtonRef}
                                >
                                    {isEditing
                                        ? t(
                                              'components_explorer_custom_sql_dimension_modal.form.save',
                                          )
                                        : t(
                                              'components_explorer_custom_sql_dimension_modal.form.create',
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
