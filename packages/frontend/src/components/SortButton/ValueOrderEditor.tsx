import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    ActionIcon,
    Box,
    Divider,
    Group,
    Loader,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconGripVertical,
    IconInfoCircle,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import {
    type FC,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../common/MantineIcon';

export type ValueOrderEditorProps = {
    /** Selected values, the array order is the expected order (first = first). */
    values: string[];
    /** Candidate values coming from the database. */
    candidateValues: string[];
    /** Whether the candidate values are being fetched. */
    isCandidatesLoading: boolean;
    /** Error message of the candidate values request, if any. */
    candidatesError: string | undefined;
    /** Disables every interaction of the editor. */
    isDisabled?: boolean;
    /**
     * Called with the current search term, debounced by the editor.
     * The initial (empty) term is not emitted: the parent owns the first load.
     */
    onSearchChange: (search: string) => void;
    /** Called with the new list of selected values, in the new order. */
    onChange: (values: string[]) => void;
};

const SEARCH_DEBOUNCE_MS = 300;
const CANDIDATES_MAX_HEIGHT = 160;

// TODO(i18n): these labels are not translated yet, they are only used as
// accessible names of the row actions.
const MOVE_UP_LABEL = 'Move up';
const MOVE_DOWN_LABEL = 'Move down';
const REMOVE_LABEL = 'Remove value';

/**
 * Editor for the custom value order of a dimension.
 *
 * The values can only come from `candidateValues` (values coming from the
 * database), the user is not allowed to type arbitrary values. Values that are
 * already selected but are not part of the current candidates are kept (and
 * flagged as missing) so that a configuration is never silently lost.
 */
export const ValueOrderEditor: FC<ValueOrderEditorProps> = ({
    values,
    candidateValues,
    isCandidatesLoading,
    candidatesError,
    isDisabled = false,
    onSearchChange,
    onChange,
}) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const lastEmittedSearch = useRef<string>('');
    const onSearchChangeRef = useRef(onSearchChange);

    useEffect(() => {
        onSearchChangeRef.current = onSearchChange;
    }, [onSearchChange]);

    // Debounced server side search. The callback is kept in a ref so that a new
    // function identity on every parent render does not restart the debounce.
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (lastEmittedSearch.current === search) return;
            lastEmittedSearch.current = search;
            onSearchChangeRef.current(search);
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [search]);

    const selectedValues = useMemo(() => new Set(values), [values]);

    const availableCandidates = useMemo(
        () => candidateValues.filter((candidate) => !selectedValues.has(candidate)),
        [candidateValues, selectedValues],
    );

    // Values that are selected but cannot be found in the current candidates.
    // While loading (or on error) we cannot tell, so nothing is flagged.
    const missingValues = useMemo(() => {
        if (isCandidatesLoading || candidatesError !== undefined) {
            return new Set<string>();
        }
        const candidates = new Set(candidateValues);
        return new Set(values.filter((value) => !candidates.has(value)));
    }, [candidateValues, candidatesError, isCandidatesLoading, values]);

    const handleAdd = useCallback(
        (value: string) => {
            if (selectedValues.has(value)) return;
            onChange([...values, value]);
        },
        [onChange, selectedValues, values],
    );

    const handleRemove = useCallback(
        (index: number) => {
            onChange(values.filter((_, valueIndex) => valueIndex !== index));
        },
        [onChange, values],
    );

    const handleMove = useCallback(
        (index: number, offset: number) => {
            const targetIndex = index + offset;
            if (targetIndex < 0 || targetIndex >= values.length) return;
            const nextValues = [...values];
            const [movedValue] = nextValues.splice(index, 1);
            nextValues.splice(targetIndex, 0, movedValue);
            onChange(nextValues);
        },
        [onChange, values],
    );

    const handleDragEnd = useCallback(
        (result: DropResult) => {
            const { source, destination } = result;
            if (!destination) return;
            if (destination.index === source.index) return;
            const nextValues = [...values];
            const [movedValue] = nextValues.splice(source.index, 1);
            nextValues.splice(destination.index, 0, movedValue);
            onChange(nextValues);
        },
        [onChange, values],
    );

    return (
        <Stack spacing="xs" sx={{ width: '100%' }}>
            <Group spacing="xs" position="apart" noWrap>
                <Text size="sm" fw={500}>
                    {t('components_sort_button.custom_order')}
                </Text>
                <Tooltip
                    label={t('components_sort_button.custom_order_tooltip')}
                    withArrow
                    position="top"
                >
                    <MantineIcon icon={IconInfoCircle} size="sm" color="gray" />
                </Tooltip>
            </Group>

            <TextInput
                size="xs"
                placeholder={t(
                    'components_sort_button.custom_order_search_placeholder',
                )}
                icon={<MantineIcon icon={IconSearch} size="sm" />}
                value={search}
                disabled={isDisabled}
                onChange={(event) => setSearch(event.currentTarget.value)}
            />

            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable
                    droppableId="value-order-selected-values"
                    direction="vertical"
                >
                    {(provided) => (
                        <Stack
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            spacing={2}
                        >
                            {values.map((value, index) => {
                                const isMissing = missingValues.has(value);

                                return (
                                    <Draggable
                                        key={`${value}-${index}`}
                                        draggableId={`${value}-${index}`}
                                        index={index}
                                        isDragDisabled={isDisabled}
                                    >
                                        {(
                                            draggableProvided,
                                            snapshot,
                                        ) => (
                                            <Group
                                                ref={
                                                    draggableProvided.innerRef
                                                }
                                                {...draggableProvided.draggableProps}
                                                noWrap
                                                spacing="xs"
                                                px="xs"
                                                py={4}
                                                data-testid="value-order-item"
                                                data-value={value}
                                                data-missing={
                                                    isMissing
                                                        ? 'true'
                                                        : 'false'
                                                }
                                                sx={(theme) => ({
                                                    borderRadius:
                                                        theme.radius.sm,
                                                    backgroundColor:
                                                        snapshot.isDragging
                                                            ? theme.white
                                                            : theme.colors
                                                                  .gray[0],
                                                    opacity: isMissing
                                                        ? 0.55
                                                        : 1,
                                                })}
                                            >
                                                <Text
                                                    size="xs"
                                                    color="dimmed"
                                                    sx={{
                                                        width: 16,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {index + 1}
                                                </Text>

                                                <Box
                                                    {...draggableProvided.dragHandleProps}
                                                    sx={{
                                                        opacity: 0.6,
                                                        cursor: 'grab',
                                                        '&:hover': { opacity: 1 },
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={IconGripVertical}
                                                        size="sm"
                                                    />
                                                </Box>

                                                <Box
                                                    sx={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    <Tooltip
                                                        label={t(
                                                            'components_sort_button.custom_order_missing_value',
                                                        )}
                                                        withArrow
                                                        position="top"
                                                        disabled={!isMissing}
                                                    >
                                                        <Text
                                                            size="sm"
                                                            color={
                                                                isMissing
                                                                    ? 'dimmed'
                                                                    : undefined
                                                            }
                                                            truncate
                                                        >
                                                            {value}
                                                        </Text>
                                                    </Tooltip>
                                                </Box>

                                                <ActionIcon
                                                    size="sm"
                                                    variant="subtle"
                                                    aria-label={MOVE_UP_LABEL}
                                                    disabled={
                                                        isDisabled ||
                                                        index === 0
                                                    }
                                                    onClick={() =>
                                                        handleMove(index, -1)
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconArrowUp}
                                                        size="sm"
                                                    />
                                                </ActionIcon>

                                                <ActionIcon
                                                    size="sm"
                                                    variant="subtle"
                                                    aria-label={
                                                        MOVE_DOWN_LABEL
                                                    }
                                                    disabled={
                                                        isDisabled ||
                                                        index ===
                                                            values.length - 1
                                                    }
                                                    onClick={() =>
                                                        handleMove(index, 1)
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconArrowDown}
                                                        size="sm"
                                                    />
                                                </ActionIcon>

                                                <ActionIcon
                                                    size="sm"
                                                    variant="subtle"
                                                    aria-label={
                                                        REMOVE_LABEL
                                                    }
                                                    disabled={isDisabled}
                                                    onClick={() =>
                                                        handleRemove(index)
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconX}
                                                        size="sm"
                                                    />
                                                </ActionIcon>
                                            </Group>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {provided.placeholder}
                        </Stack>
                    )}
                </Droppable>
            </DragDropContext>

            <Box>
                <Group spacing="xs" position="apart" noWrap mb={4}>
                    <Text size="xs" fw={500} color="dimmed">
                        {t('components_sort_button.custom_order_candidates')}
                    </Text>
                    {isCandidatesLoading && <Loader size="xs" />}
                </Group>

                {candidatesError !== undefined && (
                    <Text size="xs" color="red">
                        {candidatesError}
                    </Text>
                )}

                {!isCandidatesLoading &&
                    candidatesError === undefined &&
                    availableCandidates.length === 0 && (
                        <Text size="xs" color="dimmed">
                            {t(
                                'components_sort_button.custom_order_no_candidates',
                            )}
                        </Text>
                    )}

                {availableCandidates.length > 0 && (
                    <Box
                        sx={{
                            maxHeight: CANDIDATES_MAX_HEIGHT,
                            overflowY: 'auto',
                        }}
                    >
                        {availableCandidates.map((candidate) => (
                            <UnstyledButton
                                key={candidate}
                                onClick={() => handleAdd(candidate)}
                                disabled={isDisabled}
                                data-testid="value-order-candidate"
                                data-value={candidate}
                                sx={(theme) => ({
                                    display: 'block',
                                    width: '100%',
                                    padding: theme.spacing.xs,
                                    borderRadius: theme.radius.sm,
                                    '&:hover': {
                                        backgroundColor:
                                            theme.colors.gray[0],
                                    },
                                })}
                            >
                                <Text size="sm">{candidate}</Text>
                            </UnstyledButton>
                        ))}
                    </Box>
                )}
            </Box>

            <Divider my={2} />

            <Stack spacing={2}>
                <Text size="xs" color="dimmed">
                    {t('components_sort_button.custom_order_others_hint')}
                </Text>
                <Text size="xs" color="dimmed">
                    {t('components_sort_button.custom_order_limit_hint')}
                </Text>
            </Stack>
        </Stack>
    );
};

export default ValueOrderEditor;
