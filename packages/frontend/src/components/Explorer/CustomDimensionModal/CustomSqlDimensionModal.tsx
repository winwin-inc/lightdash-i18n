import {
    CustomDimensionType,
    DimensionType,
    getItemId,
    snakeCaseName,
    type CustomSqlDimension,
} from '@lightdash/common';
import {
    Button,
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
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { SqlEditor } from '../../../features/tableCalculation/components/SqlForm';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCustomDimensionsAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';

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
    const { showToastSuccess } = useToaster();
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
                    <Title order={4}>
                        {t(
                            'components_explorer_custom_sql_dimension_modal.modal.title',
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
                </>
            }
        >
            <form onSubmit={handleOnSubmit}>
                <Stack>
                    <TextInput
                        label={t(
                            'components_explorer_custom_sql_dimension_modal.form.label.label',
                        )}
                        required
                        placeholder={t(
                            'components_explorer_custom_sql_dimension_modal.form.label.placeholder',
                        )}
                        {...form.getInputProps('customDimensionLabel')}
                    />
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
                    <Select
                        withinPortal={true}
                        label={t(
                            'components_explorer_custom_sql_dimension_modal.form.select.label',
                        )}
                        data={Object.values(DimensionType)}
                        {...form.getInputProps('dimensionType')}
                    />
                    <Button ml="auto" type="submit">
                        {isEditing
                            ? t(
                                  'components_explorer_custom_sql_dimension_modal.form.save',
                              )
                            : t(
                                  'components_explorer_custom_sql_dimension_modal.form.create',
                              )}
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};
