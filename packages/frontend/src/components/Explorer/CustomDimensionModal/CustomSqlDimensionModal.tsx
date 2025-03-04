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
    Button,
    Group,
    Modal,
    ScrollArea,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSql } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

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
                throw new Error('SQL is required');
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
                    'Invalid field references in SQL. References must be of the format "table.field", e.g "orders.id"',
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
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={() => {
                toggleModal(undefined);
                form.reset();
            }}
            title={
                <>
                    <Group spacing="xs">
                        <MantineIcon icon={IconSql} size="lg" color="gray.7" />
                        <Title order={4}>
                            {t(
                                'components_explorer_custom_sql_dimension_modal.modal.edit',
                                {
                                    title: isEditing
                                        ? t(
                                              'components_explorer_custom_sql_dimension_modal.modal.edit',
                                          )
                                        : t(
                                              'components_explorer_custom_sql_dimension_modal.modal.create',
                                          ),
                                },
                            )}
                            {item ? (
                                <Text span fw={400}>
                                    {' '}
                                    - {item.name}
                                </Text>
                            ) : null}
                        </Title>
                    </Group>
                </>
            }
            styles={{
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            }}
        >
            <form onSubmit={handleOnSubmit}>
                <Stack p="md" pb="xs" spacing="xs">
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
                            {...form.getInputProps('customDimensionLabel')}
                        />
                        <Select
                            sx={{
                                alignSelf: 'flex-start',
                            }}
                            withinPortal={true}
                            label={t(
                                'components_explorer_custom_sql_dimension_modal.form.label.select',
                            )}
                            data={Object.values(DimensionType).map((type) => ({
                                value: type,
                                label: capitalize(type),
                            }))}
                            {...form.getInputProps('dimensionType')}
                        />
                    </Group>
                    <ScrollArea h={'150px'}>
                        <SqlEditor
                            mode="sql"
                            placeholder={t(
                                'components_explorer_custom_sql_dimension_modal.form.sql.placeholder',
                            )}
                            theme="github"
                            width="100%"
                            maxLines={Infinity}
                            minLines={8}
                            setOptions={{
                                autoScrollEditorIntoView: true,
                            }}
                            onLoad={setAceEditor}
                            isFullScreen={false}
                            enableLiveAutocompletion
                            enableBasicAutocompletion
                            showPrintMargin={false}
                            wrapEnabled={true}
                            gutterBackgroundColor={theme.colors.gray['1']}
                            {...form.getInputProps('sql')}
                        />
                    </ScrollArea>

                    <Group>
                        <Button ml="auto" type="submit">
                            {isEditing
                                ? t(
                                      'components_explorer_custom_sql_dimension_modal.form.save',
                                  )
                                : t(
                                      'components_explorer_custom_sql_dimension_modal.form.create',
                                  )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
