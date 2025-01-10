import {
    SemanticLayerType,
    type CubeSemanticLayerConnection,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp, IconTrash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type z } from 'zod';

import MantineIcon from '../common/MantineIcon';
import { cubeSemanticLayerFormSchema } from './types';

type Props = {
    isLoading: boolean;
    semanticLayerConnection?: CubeSemanticLayerConnection;
    onSubmit: (data: z.infer<typeof cubeSemanticLayerFormSchema>) => void;
    onDelete: () => void;
};

const CubeSemanticLayerForm: FC<Props> = ({
    isLoading,
    semanticLayerConnection,
    onSubmit,
    onDelete,
}) => {
    const { t } = useTranslation();

    const form = useForm<z.infer<typeof cubeSemanticLayerFormSchema>>({
        validate: {
            ...zodResolver(cubeSemanticLayerFormSchema),
            // Custom validation for token since when there is no semanticLayerConnection it is required at the form level (there's also backend validation)
            token: (value) =>
                !semanticLayerConnection && value.length < 1
                    ? t('components_settings_semantic_layer.cube.error.token')
                    : null,
        },
        initialValues: {
            type: SemanticLayerType.CUBE,
            token: '',
            domain: semanticLayerConnection?.domain ?? '',
        },
    });

    const handleDelete = useCallback(async () => {
        await onDelete();
        form.setInitialValues({
            type: SemanticLayerType.CUBE,
            token: '',
            domain: '',
        });
        form.reset();
    }, [form, onDelete]);

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack>
                <PasswordInput
                    autoComplete="off"
                    {...form.getInputProps('token')}
                    placeholder={
                        semanticLayerConnection
                            ? '**************'
                            : t(
                                  'components_settings_semantic_layer.cube.form.password',
                              )
                    }
                    label={
                        <Group display="inline-flex" spacing="xs">
                            {t(
                                'components_settings_semantic_layer.cube.form.token',
                            )}
                            <Tooltip
                                maw={400}
                                label={
                                    <Text fw={400}>
                                        {t(
                                            'components_settings_semantic_layer.cube.form.token_tooltip.part_1',
                                        )}{' '}
                                        <Text span fw={500}>
                                            {t(
                                                'components_settings_semantic_layer.cube.form.token_tooltip.part_2',
                                            )}{' '}
                                            {'>'}{' '}
                                            {t(
                                                'components_settings_semantic_layer.cube.form.token_tooltip.part_3',
                                            )}{' '}
                                            {'>'}{' '}
                                            {t(
                                                'components_settings_semantic_layer.cube.form.token_tooltip.part_4',
                                            )}
                                        </Text>
                                        .
                                    </Text>
                                }
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <TextInput
                    {...form.getInputProps('domain')}
                    placeholder={t(
                        'components_settings_semantic_layer.cube.form.domain.placeholder',
                    )}
                    label={
                        <Group display="inline-flex" spacing="xs">
                            {t(
                                'components_settings_semantic_layer.cube.form.domain.title',
                            )}
                            <Tooltip
                                maw={400}
                                label={
                                    <Text fw={400}>
                                        {t(
                                            'components_settings_semantic_layer.cube.form.domain_tip.part_1',
                                        )}{' '}
                                        <Text span fw={500}>
                                            {t(
                                                'components_settings_semantic_layer.cube.form.domain_tip.part_2',
                                            )}{' '}
                                            {'>'}{' '}
                                            {t(
                                                'components_settings_semantic_layer.cube.form.domain_tip.part_3',
                                            )}
                                        </Text>
                                        .
                                    </Text>
                                }
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <Flex justify="end" align="center" gap="sm">
                    <Button
                        type="submit"
                        disabled={!form.isValid()}
                        loading={isLoading}
                    >
                        {t('components_settings_semantic_layer.cube.save')}
                    </Button>
                    <ActionIcon
                        variant="transparent"
                        onClick={handleDelete}
                        disabled={!Boolean(semanticLayerConnection)}
                        c="red"
                    >
                        <MantineIcon icon={IconTrash} size="md" />
                    </ActionIcon>
                </Flex>
            </Stack>
        </form>
    );
};

export default CubeSemanticLayerForm;
