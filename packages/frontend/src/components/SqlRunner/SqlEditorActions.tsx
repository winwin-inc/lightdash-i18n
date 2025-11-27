import { ActionIcon, CopyButton, Flex, Tooltip } from '@mantine/core';
import {
    IconCheck,
    IconClipboard,
    IconTextWrap,
    IconTextWrapDisabled,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../common/MantineIcon';

export const SqlEditorActions: FC<{
    isSoftWrapEnabled: boolean;
    clipboardContent?: string | undefined;
    onToggleSoftWrap: () => void;
}> = ({ isSoftWrapEnabled, onToggleSoftWrap, clipboardContent }) => {
    const { t } = useTranslation();

    return (
        <Flex
            pos="absolute"
            bottom={0}
            right={0}
            // Avoids potential collision with ScrollArea scrollbar:
            mr={5}
        >
            <Tooltip
                label={
                    isSoftWrapEnabled
                        ? t(
                              'components_sql_runner_actions.disable_editor_soft_wrap',
                          )
                        : t(
                              'components_sql_runner_actions.enable_editor_soft_wrap',
                          )
                }
                withArrow
                position="left"
            >
                <ActionIcon onClick={onToggleSoftWrap} color="gray">
                    {isSoftWrapEnabled ? (
                        <MantineIcon icon={IconTextWrapDisabled} />
                    ) : (
                        <MantineIcon icon={IconTextWrap} />
                    )}
                </ActionIcon>
            </Tooltip>
            <CopyButton value={clipboardContent ?? ''} timeout={2000}>
                {({ copied, copy }) => (
                    <Tooltip
                        label={
                            copied
                                ? t(
                                      'components_sql_runner_actions.copied_to_clipboard',
                                  )
                                : t('components_sql_runner_actions.copy')
                        }
                        withArrow
                        position="right"
                        color={copied ? 'green' : 'dark'}
                    >
                        <ActionIcon
                            color={copied ? 'teal' : 'gray'}
                            onClick={copy}
                        >
                            {copied ? (
                                <IconCheck size="1rem" />
                            ) : (
                                <IconClipboard size="1rem" />
                            )}
                        </ActionIcon>
                    </Tooltip>
                )}
            </CopyButton>
        </Flex>
    );
};
