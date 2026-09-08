// STUB: TipTap-based PromptComposer not ported — textarea keeps AppGenerate compiling.
import { Box, Group, Stack, Textarea } from '@mantine-8/core';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type ClipboardEvent as ReactClipboardEvent,
    type ReactNode,
} from 'react';

export type PromptComposerHandle = {
    editor: null;
    getText: () => string;
    clear: () => void;
    focus: () => void;
    insertContent: (content: unknown[]) => void;
};

type Props = {
    variant?: 'card' | 'inline';
    size?: 'sm' | 'md' | 'lg';
    accent?: 'none' | 'indigo';
    placeholder?: string;
    defaultValue?: string;
    autoFocus?: boolean;
    disabled?: boolean;
    submitDisabled?: boolean;
    extensions?: unknown[];
    onSubmit?: (text: string) => void;
    onEmptyChange?: (isEmpty: boolean) => void;
    onValueChange?: (text: string) => void;
    onPaste?: (event: ReactClipboardEvent) => void;
    onMouseDown?: () => void;
    onEditorReady?: (editor: null) => void;
    shouldBlockSubmit?: (editor: null) => boolean;
    header?: ReactNode;
    attachments?: ReactNode;
    toolbarLeft?: ReactNode;
    toolbarRight?: ReactNode;
    className?: string;
};

const PromptComposer = forwardRef<PromptComposerHandle, Props>(
    function PromptComposer(
        {
            placeholder = '',
            defaultValue = '',
            autoFocus = false,
            disabled = false,
            submitDisabled = false,
            onSubmit,
            onEmptyChange,
            onValueChange,
            onPaste,
            onMouseDown,
            onEditorReady,
            shouldBlockSubmit,
            header,
            attachments,
            toolbarLeft,
            toolbarRight,
            className,
        },
        ref,
    ) {
        const [value, setValue] = useState(defaultValue);
        const textareaRef = useRef<HTMLTextAreaElement>(null);

        useImperativeHandle(
            ref,
            () => ({
                editor: null,
                getText: () => value,
                clear: () => {
                    setValue('');
                    onEmptyChange?.(true);
                    onValueChange?.('');
                },
                focus: () => textareaRef.current?.focus(),
                insertContent: () => {
                    // STUB: TipTap insertContent not available
                },
            }),
            [value, onEmptyChange, onValueChange],
        );

        useEffect(() => {
            onEditorReady?.(null);
        }, [onEditorReady]);

        return (
            <Stack gap="xs" className={className} onMouseDown={onMouseDown}>
                {header}
                <Textarea
                    ref={textareaRef}
                    placeholder={placeholder}
                    value={value}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    minRows={3}
                    autosize
                    onPaste={onPaste}
                    onChange={(e) => {
                        const next = e.currentTarget.value;
                        setValue(next);
                        onEmptyChange?.(next.trim().length === 0);
                        onValueChange?.(next);
                    }}
                    onKeyDown={(e) => {
                        if (
                            e.key === 'Enter' &&
                            !e.shiftKey &&
                            !submitDisabled &&
                            !shouldBlockSubmit?.(null)
                        ) {
                            e.preventDefault();
                            onSubmit?.(value);
                        }
                    }}
                />
                {attachments}
                {(toolbarLeft || toolbarRight) && (
                    <Group justify="space-between" wrap="nowrap">
                        <Box>{toolbarLeft}</Box>
                        <Box>{toolbarRight}</Box>
                    </Group>
                )}
            </Stack>
        );
    },
);

export default PromptComposer;
