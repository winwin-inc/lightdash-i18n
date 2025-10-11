import type {
    AiAgentToolResult,
    ToolProposeChangeArgs,
} from '@lightdash/common';
import {
    Badge,
    Button,
    type DefaultMantineColor,
    Group,
    Stack,
} from '@mantine-8/core';
import { IconExternalLink, IconGitBranch, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useChange } from '../../../../../../../features/changesets/hooks/useChange';
import { useRevertChangeMutation } from '../../../../hooks/useProjectAiAgents';
import { ToolCallPaper } from '../ToolCallPaper';
import { ChangeRenderer } from './ChangeRenderer';

interface Props
    extends Pick<ToolProposeChangeArgs, 'change' | 'entityTableName'> {
    defaultOpened?: boolean;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    toolResult:
        | Extract<AiAgentToolResult, { toolName: 'proposeChange' }>
        | undefined;
}

const CHANGE_COLORS = {
    update: 'blue',
    create: 'green',
} as const satisfies Record<'update' | 'create', DefaultMantineColor>;

export const AiProposeChangeToolCall = ({
    change,
    entityTableName,
    defaultOpened = true,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
    toolResult,
}: Props) => {
    const { t } = useTranslation();

    const changeType = change.value.type;
    const changeColor: DefaultMantineColor =
        CHANGE_COLORS[changeType] ?? 'gray';

    const { mutate: revertChange, isLoading } = useRevertChangeMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );

    const metadata = toolResult?.metadata;
    const isSuccessResult = metadata?.status === 'success';
    const changeUuid = isSuccessResult ? metadata.changeUuid : undefined;

    const { isLoading: isLoadingChange, error: changeError } = useChange(
        projectUuid,
        changeUuid,
    );

    const isChangeDeleted = changeError?.error?.statusCode === 404;
    const isRejectedByMetadata =
        isSuccessResult && metadata?.userFeedback === 'rejected';

    const buttonText = isChangeDeleted
        ? t('ai_copilot_chat_elements_response_message.reverted')
        : isRejectedByMetadata
        ? t('ai_copilot_chat_elements_response_message.rejected')
        : t('ai_copilot_chat_elements_response_message.reject');

    const handleReject = () => {
        if (changeUuid) {
            revertChange({ promptUuid, changeUuid });
        }
    };

    return (
        <ToolCallPaper
            defaultOpened={defaultOpened}
            icon={IconGitBranch}
            hasError={!isSuccessResult}
            title={
                <Group gap="xs">
                    <span>
                        {isSuccessResult
                            ? t(
                                  'ai_copilot_chat_elements_response_message.semantic_layer_changes',
                              )
                            : t(
                                  'ai_copilot_chat_elements_response_message.failed_to_update_semantic_layer',
                              )}
                    </span>

                    {isSuccessResult && (
                        <Badge
                            radius="sm"
                            size="sm"
                            variant="light"
                            color={changeColor}
                        >
                            {changeType}
                        </Badge>
                    )}
                </Group>
            }
            rightAction={
                isSuccessResult && (
                    <Button
                        component="a"
                        href={`/generalSettings/projectManagement/${projectUuid}/changesets`}
                        target="_blank"
                        variant="subtle"
                        size="compact-xs"
                        rightSection={
                            <MantineIcon icon={IconExternalLink} size={14} />
                        }
                        // do not bubble up event to close the collapsible
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        {t(
                            'ai_copilot_chat_elements_response_message.view_changeset',
                        )}
                    </Button>
                )
            }
        >
            <Stack gap="xs" mt="xs">
                <ChangeRenderer
                    change={change}
                    entityTableName={entityTableName}
                />

                {isSuccessResult && (
                    <Group w="100%" justify="flex-end" pr="xs">
                        <Button
                            variant="default"
                            size="compact-xs"
                            leftSection={<MantineIcon icon={IconX} size={12} />}
                            onClick={handleReject}
                            disabled={
                                isRejectedByMetadata ||
                                isChangeDeleted ||
                                isLoading ||
                                isLoadingChange
                            }
                            loading={isLoading}
                        >
                            {buttonText}
                        </Button>
                    </Group>
                )}
            </Stack>
        </ToolCallPaper>
    );
};
