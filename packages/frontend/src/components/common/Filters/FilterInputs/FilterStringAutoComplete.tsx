import { type FilterableItem } from '@lightdash/common';
import {
    Group,
    Highlight,
    Loader,
    MultiSelect,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    type MultiSelectProps,
    type MultiSelectValueProps,
} from '@mantine/core';
import { IconAlertCircle, IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import useHealth from '../../../../hooks/health/useHealth';
import {
    MAX_AUTOCOMPLETE_RESULTS,
    useFieldValues,
} from '../../../../hooks/useFieldValues';
import MantineIcon from '../../MantineIcon';
import useFiltersContext from '../useFiltersContext';
import MultiValuePastePopover from './MultiValuePastePopover';
import { formatDisplayValue } from './utils';

type Props = Omit<MultiSelectProps, 'data' | 'onChange'> & {
    filterId: string;
    field: FilterableItem;
    values: string[];
    suggestions: string[];
    onChange: (values: string[]) => void;
    singleValue?: boolean;
};

// Single value component that mimics a single select behavior - maxSelectedValues={1} behaves weirdly so we don't use it.
const SingleValueComponent = ({
    value,
    label,
    onRemove,
    ...others
}: MultiSelectValueProps & { value: string }) => {
    return (
        <div {...others}>
            <Text size="xs" lineClamp={1}>
                {label}
            </Text>
        </div>
    );
};

const FilterStringAutoComplete: FC<Props> = ({
    filterId,
    values,
    field,
    suggestions: initialSuggestionData,
    disabled,
    onChange,
    placeholder,
    onDropdownOpen,
    onDropdownClose,
    singleValue,
    ...rest
}) => {
    const { t } = useTranslation();

    const multiSelectRef = useRef<HTMLInputElement>(null);
    const {
        projectUuid,
        getAutocompleteFilterGroup,
        dashboardSlug,
        dashboardName,
    } = useFiltersContext();
    if (!projectUuid) {
        throw new Error(t('components_common_filters_inputs.filters_error'));
    }

    const { data: healthData } = useHealth();

    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();

    const [forceRefresh, setForceRefresh] = useState<boolean>(false);

    const autocompleteFilterGroup = useMemo(
        () => getAutocompleteFilterGroup(filterId, field),
        [field, filterId, getAutocompleteFilterGroup],
    );

    const {
        isInitialLoading,
        results: resultsSet,
        refreshedAt,
        refetch,
        error,
        isError,
    } = useFieldValues(
        search,
        initialSuggestionData,
        projectUuid,
        field,
        filterId,
        autocompleteFilterGroup,
        true,
        forceRefresh,
        {
            refetchOnMount: 'always',
        },
        undefined,
        {
            dashboardSlug,
            dashboardName,
        },
    );

    useEffect(() => {
        if (forceRefresh) {
            refetch().then().catch(console.error); // This will skip queryKey cache from react query and refetch from backend
            setForceRefresh(false);
        }
    }, [forceRefresh, refetch]);
    const results = useMemo(() => [...resultsSet], [resultsSet]);

    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    // 跟踪下拉框是否打开
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    // 保存下拉框元素的引用
    const dropdownElementRef = useRef<HTMLElement | null>(null);

    // 防抖关闭定时器引用
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 关闭下拉框的函数
    const closeDropdown = useCallback(() => {
        if (isDropdownOpen) {
            multiSelectRef.current?.blur();
        }
    }, [isDropdownOpen]);

    // 启动防抖关闭
    const startDebouncedClose = useCallback(() => {
        // 清除之前的定时器
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }
        // 设置新的定时器
        closeTimeoutRef.current = setTimeout(() => {
            closeTimeoutRef.current = null;
            closeDropdown();
        }, 500);
    }, [closeDropdown]);

    // 取消防抖关闭
    const cancelDebouncedClose = useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, []);

    // 查找并保存下拉框元素引用
    const findDropdownElement = useCallback(() => {
        if (!multiSelectRef.current) {
            return null;
        }

        // 方法1: 优先查找所有可见的 role="listbox" 元素（这是实际的下拉列表）
        const allListboxes = document.querySelectorAll('[role="listbox"]');
        const inputRect = multiSelectRef.current.getBoundingClientRect();

        // 优先通过位置匹配找到正确的 listbox
        for (const listbox of allListboxes) {
            const rect = listbox.getBoundingClientRect();
            // 检查是否可见且与输入框位置相关
            if (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.top > 0 // 确保下拉框在视口中
            ) {
                const horizontalDiff = Math.abs(rect.left - inputRect.left);
                const verticalDiff = rect.top - inputRect.bottom;

                // 放宽匹配条件：水平位置相近，下拉框在输入框下方或稍微重叠
                if (
                    horizontalDiff < 100 && // 水平位置相近（放宽到100px）
                    verticalDiff >= -20 // 下拉框在输入框下方或稍微重叠（放宽到20px）
                ) {
                    return listbox as HTMLElement;
                }
            }
        }

        // 方法2: 通过 aria-owns 查找实际的 listbox（备用方法）
        const inputId = multiSelectRef.current.id;
        if (inputId) {
            // 先找到 combobox 包装器
            const combobox = document.querySelector(
                `[aria-controls="${inputId}"], [aria-labelledby="${inputId}"]`,
            ) as HTMLElement | null;

            if (combobox) {
                // 从 combobox 的 aria-owns 获取 listbox 的 ID
                const listboxId = combobox.getAttribute('aria-owns');
                if (listboxId) {
                    // 查找实际的 listbox 元素
                    const listbox = document.querySelector(
                        `#${listboxId}, [id="${listboxId}"]`,
                    ) as HTMLElement | null;
                    if (listbox) {
                        const rect = listbox.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            return listbox;
                        }
                    }
                }
            }
        }

        // 方法3: 查找 data-combobox-dropdown 或包含选项的容器
        const comboboxDropdown = document.querySelector(
            '[data-combobox-dropdown], [data-mantine-dropdown]',
        ) as HTMLElement | null;
        if (comboboxDropdown) {
            const rect = comboboxDropdown.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return comboboxDropdown;
            }
        }

        return null;
    }, []);

    // 检查鼠标是否在下拉框或输入框范围内
    const isMouseInSelectArea = useCallback(
        (x: number, y: number): boolean => {
            // 检查输入框
            if (multiSelectRef.current) {
                const inputRect =
                    multiSelectRef.current.getBoundingClientRect();
                const inInput =
                    x >= inputRect.left &&
                    x <= inputRect.right &&
                    y >= inputRect.top &&
                    y <= inputRect.bottom;

                if (inInput) {
                    return true;
                }
            }

            // 检查下拉框（每次都重新查找，确保获取最新的位置和大小）
            const dropdown = findDropdownElement();
            if (dropdown) {
                // 更新引用
                if (dropdownElementRef.current !== dropdown) {
                    dropdownElementRef.current = dropdown;
                }
                const rect = dropdown.getBoundingClientRect();
                const inDropdown =
                    x >= rect.left &&
                    x <= rect.right &&
                    y >= rect.top &&
                    y <= rect.bottom;

                if (inDropdown) {
                    return true;
                }
            }

            return false;
        },
        [findDropdownElement],
    );

    // 数据加载完成后，重新查找下拉框（因为下拉框高度会变化）
    useEffect(() => {
        if (!isDropdownOpen || singleValue || isInitialLoading) return;

        // 数据加载完成后，延迟重新查找下拉框（等待 DOM 更新）
        const timeoutId = setTimeout(() => {
            dropdownElementRef.current = findDropdownElement();
        }, 100);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [isInitialLoading, isDropdownOpen, singleValue, findDropdownElement]);

    // 监听鼠标移动，只在鼠标离开下拉框范围时关闭
    useEffect(() => {
        if (!isDropdownOpen || singleValue) return;

        // 下拉框打开时，延迟查找下拉框元素（等待渲染）
        const timeoutId = setTimeout(() => {
            dropdownElementRef.current = findDropdownElement();
        }, 100);

        const handleMouseMove = (event: MouseEvent) => {
            const isInside = isMouseInSelectArea(event.clientX, event.clientY);

            if (isInside) {
                // 鼠标在下拉框内，取消防抖（保持打开）
                cancelDebouncedClose();
            } else {
                // 鼠标离开下拉框，启动防抖关闭（只在第一次离开时启动，不会因为移动而重置）
                if (!closeTimeoutRef.current) {
                    startDebouncedClose();
                }
            }
        };

        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousemove', handleMouseMove);
            cancelDebouncedClose(); // 清理时取消防抖
            dropdownElementRef.current = null; // 清理引用
        };
    }, [
        isDropdownOpen,
        singleValue,
        isMouseInSelectArea,
        findDropdownElement,
        cancelDebouncedClose,
        startDebouncedClose,
    ]);

    // 组件卸载时清理定时器
    useEffect(() => {
        return () => {
            cancelDebouncedClose();
        };
    }, [cancelDebouncedClose]);

    const handleChange = useCallback(
        (updatedValues: string[]) => {
            if (singleValue && updatedValues.length > 1) {
                onChange([updatedValues[updatedValues.length - 1]]);
            } else {
                onChange(uniq(updatedValues));
            }

            // 单选模式：立即关闭下拉框
            if (singleValue) {
                cancelDebouncedClose(); // 取消可能存在的防抖
                multiSelectRef.current?.blur();
            }
            // 多选模式：不在这里处理关闭，由鼠标移动事件处理
            // 如果鼠标在下拉框内，会取消防抖；如果离开，会触发防抖关闭
        },
        [onChange, singleValue],
    );

    const handleAdd = useCallback(
        (newValue: string) => {
            if (singleValue) {
                handleChange([newValue]);
            } else {
                handleChange([...values, newValue]);
            }
            return newValue;
        },
        [handleChange, values, singleValue],
    );

    const handleAddMultiple = useCallback(
        (newValues: string[]) => {
            if (singleValue && newValues.length > 0) {
                handleChange([newValues[newValues.length - 1]]);
            } else {
                handleChange([...values, ...newValues]);
            }
            return newValues;
        },
        [handleChange, values, singleValue],
    );

    const handlePaste = useCallback(
        (event: React.ClipboardEvent<HTMLInputElement>) => {
            const clipboardData = event.clipboardData.getData('Text');
            if (clipboardData.includes(',') || clipboardData.includes('\n')) {
                setTempPasteValues(clipboardData);
                setPastePopUpOpened(true);
            }
        },
        [],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter' && search !== '') {
                handleAdd(search);
                handleResetSearch();
            }
        },
        [handleAdd, handleResetSearch, search],
    );

    useEffect(() => {
        if (singleValue && values.length > 1) {
            handleChange([values[values.length - 1]]);
        }
    }, [values, singleValue, handleChange]);

    const data = useMemo(() => {
        // Mantine does not show value tag if value is not found in data
        // so we need to add it manually here
        // also we are merging status indicator as a first item
        return uniq([...results, ...values]).map((value) => ({
            value,
            label: formatDisplayValue(value),
        }));
    }, [results, values]);

    const searchedMaxResults = resultsSet.size >= MAX_AUTOCOMPLETE_RESULTS;
    // memo override component so list doesn't scroll to the top on each click
    const DropdownComponentOverride = useCallback(
        ({ children, ...props }: { children: ReactNode }) => (
            <Stack w="100%" spacing={0}>
                <ScrollArea {...props}>
                    {searchedMaxResults ? (
                        <Text
                            color="dimmed"
                            size="xs"
                            px="sm"
                            pt="xs"
                            pb="xxs"
                            bg="white"
                        >
                            {t(
                                'components_common_filters_inputs.scroll_area.part_1',
                            )}{' '}
                            {MAX_AUTOCOMPLETE_RESULTS}{' '}
                            {t(
                                'components_common_filters_inputs.scroll_area.part_2',
                            )}{' '}
                            {search
                                ? t(
                                      'components_common_filters_inputs.scroll_area.part_3',
                                  )
                                : t(
                                      'components_common_filters_inputs.scroll_area.part_4',
                                  )}{' '}
                            {t(
                                'components_common_filters_inputs.scroll_area.part_5',
                            )}
                        </Text>
                    ) : null}

                    {children}
                </ScrollArea>
                {healthData?.hasCacheAutocompleResults ? (
                    <>
                        <Tooltip
                            withinPortal
                            position="left"
                            label={t(
                                'components_common_filters_inputs.autocomple_results.refresh',
                            )}
                        >
                            <Text
                                color="dimmed"
                                size="xs"
                                px="sm"
                                p="xxs"
                                sx={(theme) => ({
                                    cursor: 'pointer',
                                    borderTop: `1px solid ${theme.colors.gray[2]}`,
                                    '&:hover': {
                                        backgroundColor: theme.colors.gray[1],
                                    },
                                })}
                                onClick={() => setForceRefresh(true)}
                            >
                                {t(
                                    'components_common_filters_inputs.autocomple_results.loaded',
                                )}{' '}
                                {refreshedAt.toLocaleString()}
                            </Text>
                        </Tooltip>
                    </>
                ) : null}
            </Stack>
        ),
        [
            searchedMaxResults,
            search,
            refreshedAt,
            healthData?.hasCacheAutocompleResults,
            t,
        ],
    );

    return (
        <MultiValuePastePopover
            opened={pastePopUpOpened}
            onClose={() => {
                setPastePopUpOpened(false);
                setTempPasteValues(undefined);
                handleResetSearch();
            }}
            onMultiValue={() => {
                if (!tempPasteValues) {
                    setPastePopUpOpened(false);
                    return;
                }
                const clipboardDataArray = tempPasteValues
                    .split(/\,|\n/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                handleAddMultiple(clipboardDataArray);
            }}
            onSingleValue={() => {
                if (!tempPasteValues) {
                    setPastePopUpOpened(false);
                    return;
                }
                handleAdd(tempPasteValues);
            }}
        >
            <MultiSelect
                ref={multiSelectRef}
                size="xs"
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                creatable
                valueComponent={singleValue ? SingleValueComponent : undefined}
                /**
                 * Opts out of Mantine's default condition and always allows adding, as long as not
                 * an empty query.
                 */
                shouldCreate={(query) =>
                    query.trim().length > 0 && !values.includes(query)
                }
                getCreateLabel={(query) => (
                    <Group spacing="xxs">
                        <MantineIcon icon={IconPlus} color="blue" size="sm" />
                        <Text color="blue">
                            {t('components_common_filters_inputs.add')} "{query}
                            "
                        </Text>
                    </Group>
                )}
                styles={{
                    item: {
                        // makes add new item button sticky to bottom
                        '&:last-child:not([value])': {
                            position: 'sticky',
                            bottom: 4,
                            // casts shadow on the bottom of the list to avoid transparency
                            boxShadow: '0 4px 0 0 white',
                        },
                        '&:last-child:not([value]):not(:hover)': {
                            background: 'white',
                        },
                    },
                    values: {
                        maxWidth: '100%',
                        flexWrap: 'wrap',
                    },
                    value: {
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    },
                    input: {
                        maxWidth: '100%',
                        flex: '1 1 auto',
                        minWidth: 0,
                    },
                    wrapper: {
                        maxWidth: '100%',
                    },
                }}
                disableSelectedItemFiltering
                searchable
                clearable={singleValue}
                clearSearchOnChange
                {...rest}
                searchValue={search}
                onSearchChange={setSearch}
                limit={MAX_AUTOCOMPLETE_RESULTS}
                onPaste={handlePaste}
                nothingFound={
                    isInitialLoading
                        ? t('components_common_filters_inputs.no_data.loading')
                        : t(
                              'components_common_filters_inputs.no_data.no_results',
                          )
                }
                rightSection={
                    isInitialLoading ? (
                        <Loader size="xs" color="gray" />
                    ) : isError ? (
                        <Tooltip
                            label={
                                error?.error?.message ||
                                t(
                                    'components_common_filters_inputs.filter_not_available',
                                )
                            }
                            withinPortal
                        >
                            <MantineIcon icon={IconAlertCircle} color="red" />
                        </Tooltip>
                    ) : null
                }
                dropdownComponent={DropdownComponentOverride}
                itemComponent={({ label, ...others }) =>
                    others.disabled ? (
                        <Text color="dimmed" {...others}>
                            {label}
                        </Text>
                    ) : (
                        <Highlight highlight={search} {...others}>
                            {label}
                        </Highlight>
                    )
                }
                data={data}
                value={values}
                onDropdownOpen={() => {
                    setIsDropdownOpen(true);
                    onDropdownOpen?.();
                }}
                onDropdownClose={() => {
                    setIsDropdownOpen(false);
                    cancelDebouncedClose(); // 取消防抖，因为下拉框已经关闭
                    dropdownElementRef.current = null; // 清理下拉框引用
                    handleResetSearch();
                    onDropdownClose?.();
                }}
                onChange={handleChange}
                onCreate={handleAdd}
                onKeyDown={handleKeyDown}
            />
        </MultiValuePastePopover>
    );
};

export default FilterStringAutoComplete;
