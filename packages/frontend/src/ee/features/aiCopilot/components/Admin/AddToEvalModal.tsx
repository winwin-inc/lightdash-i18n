import {
    type ApiAppendEvaluationRequest,
    type ApiCreateEvaluationRequest,
} from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import {
    useAiAgentEvaluations,
    useAppendToEvaluation,
    useCreateEvaluation,
} from '../../hooks/useAiAgentEvaluations';

type AddToEvalModalProps = {
    isOpen: boolean;
    onClose: () => void;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

export const AddToEvalModal: FC<AddToEvalModalProps> = ({
    isOpen,
    onClose,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
}) => {
    const { t } = useTranslation();

    const [createMode, setCreateMode] = useState(false);

    const { data: evaluations, isLoading: isLoadingEvals } =
        useAiAgentEvaluations(projectUuid, agentUuid);

    const createEvaluationMutation = useCreateEvaluation(
        projectUuid,
        agentUuid,
        { showToastButton: true },
    );
    const appendToEvaluationMutation = useAppendToEvaluation(
        projectUuid,
        agentUuid,
    );

    const form = useForm({
        initialValues: {
            selectedEvalUuid: '',
            newEvalName: '',
        },
        validate: {
            selectedEvalUuid: (value: string) =>
                !createMode && !value
                    ? t('ai_agent_form_setup_admin.please_select_an_evaluation')
                    : null,
            newEvalName: (value: string) =>
                createMode && !value
                    ? t(
                          'ai_agent_form_setup_admin.please_enter_an_evaluation_name',
                      )
                    : null,
        },
    });

    const handleSubmit = async (values: typeof form.values) => {
        const promptData = {
            promptUuid,
            threadUuid,
        };

        try {
            if (createMode) {
                // Create new evaluation with the prompt
                const createData: ApiCreateEvaluationRequest = {
                    title: values.newEvalName,
                    prompts: [promptData],
                };
                await createEvaluationMutation.mutateAsync(createData);
            } else {
                // Add prompt to existing evaluation
                const appendData: ApiAppendEvaluationRequest = {
                    prompts: [promptData],
                };
                await appendToEvaluationMutation.mutateAsync({
                    evalUuid: values.selectedEvalUuid,
                    data: appendData,
                });
            }
            onClose();
            form.reset();
            setCreateMode(false);
        } catch (error) {
            // Error is handled by the mutation
        }
    };

    return (
        <MantineModal
            opened={isOpen}
            onClose={() => {
                onClose();
                form.reset();
                setCreateMode(false);
            }}
            title={t('ai_agent_form_setup_admin.add_to_eval.add_prompt')}
            size="lg"
        >
            {isLoadingEvals ? (
                <Stack align="center" py="lg">
                    <Loader size="md" />
                    <Text size="sm" c="dimmed">
                        {t(
                            'ai_agent_form_setup_admin.add_to_eval.loading_evaluations',
                        )}
                    </Text>
                </Stack>
            ) : (
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack>
                        <Text size="sm" c="dimmed">
                            {t(
                                'ai_agent_form_setup_admin.add_to_eval.add_prompt_description',
                            )}
                        </Text>

                        {!createMode ? (
                            <Select
                                label={t(
                                    'ai_agent_form_setup_admin.add_to_eval.select_evaluation',
                                )}
                                placeholder={t(
                                    'ai_agent_form_setup_admin.add_to_eval.choose_an_evaluation_set',
                                )}
                                data={
                                    evaluations?.map((evaluation) => ({
                                        value: evaluation.evalUuid,
                                        label: evaluation.title,
                                    })) || []
                                }
                                {...form.getInputProps('selectedEvalUuid')}
                                searchable
                            />
                        ) : (
                            <TextInput
                                label={t(
                                    'ai_agent_form_setup_admin.add_to_eval.evaluation_name',
                                )}
                                placeholder={t(
                                    'ai_agent_form_setup_admin.add_to_eval.enter_evaluation_name',
                                )}
                                {...form.getInputProps('newEvalName')}
                            />
                        )}

                        <Group justify="space-between" mt="md">
                            {!createMode ? (
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() => {
                                        setCreateMode(true);
                                        form.setFieldValue(
                                            'selectedEvalUuid',
                                            '',
                                        );
                                    }}
                                >
                                    {t(
                                        'ai_agent_form_setup_admin.add_to_eval.new_evaluation',
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon icon={IconArrowLeft} />
                                    }
                                    onClick={() => {
                                        setCreateMode(false);
                                        form.setFieldValue('newEvalName', '');
                                    }}
                                >
                                    {t(
                                        'ai_agent_form_setup_admin.add_to_eval.back',
                                    )}
                                </Button>
                            )}

                            <Group>
                                <Button
                                    variant="subtle"
                                    onClick={() => {
                                        onClose();
                                        form.reset();
                                        setCreateMode(false);
                                    }}
                                >
                                    {t(
                                        'ai_agent_form_setup_admin.add_to_eval.cancel',
                                    )}
                                </Button>
                                <Button
                                    type="submit"
                                    loading={
                                        createEvaluationMutation.isLoading ||
                                        appendToEvaluationMutation.isLoading
                                    }
                                >
                                    {createMode
                                        ? t(
                                              'ai_agent_form_setup_admin.add_to_eval.create_and_add',
                                          )
                                        : t(
                                              'ai_agent_form_setup_admin.add_to_eval.add_to_eval',
                                          )}
                                </Button>
                            </Group>
                        </Group>
                    </Stack>
                </form>
            )}
        </MantineModal>
    );
};
