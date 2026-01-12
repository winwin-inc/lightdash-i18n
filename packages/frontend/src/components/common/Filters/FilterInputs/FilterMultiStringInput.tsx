import { Group, MultiSelect, Text, type MultiSelectProps } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../MantineIcon';
import MultiValuePastePopover from './MultiValuePastePopover';
import { formatDisplayValue } from './utils';

type Props = Omit<MultiSelectProps, 'data' | 'onChange'> & {
    values: string[];
    onChange: (values: string[]) => void;
};

const FilterMultiStringInput: FC<Props> = ({
    values,
    disabled,
    onChange,
    placeholder,
    ...rest
}) => {
    const { t } = useTranslation();

    const multiSelectRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();

    const [resultsSets] = useState([]);

    const results = useMemo(() => [...resultsSets], [resultsSets]);

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

        // 方法3: 查找 data-combobox-dropdown
        const comboboxDropdown = document.querySelector(
            '[data-combobox-dropdown]',
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

    // 监听鼠标移动，只在鼠标离开下拉框范围时关闭
    useEffect(() => {
        if (!isDropdownOpen) return;

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
            onChange(uniq(updatedValues));
            // 不在这里处理关闭，由鼠标移动事件处理
            // 如果鼠标在下拉框内，会取消防抖；如果离开，会触发防抖关闭
        },
        [onChange],
    );

    const handleAdd = useCallback(
        (newValue: string) => {
            handleChange([...values, newValue]);
            return newValue;
        },
        [handleChange, values],
    );

    const handleAddMultiple = useCallback(
        (newValues: string[]) => {
            handleChange([...values, ...newValues]);
            return newValues;
        },
        [handleChange, values],
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

    const data = useMemo(() => {
        // Mantine does not show value tag if value is not found in data
        // so we need to add it manually here
        // also we are merging status indicator as a first item
        return uniq([...results, ...values]).map((value) => ({
            value,
            label: formatDisplayValue(value),
        }));
    }, [results, values]);

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
                disableSelectedItemFiltering={false}
                searchable
                clearSearchOnChange
                {...rest}
                searchValue={search}
                onSearchChange={setSearch}
                onPaste={handlePaste}
                nothingFound={t(
                    'components_common_filters_inputs.add_filter_tip',
                )}
                data={data}
                value={values}
                onDropdownOpen={() => {
                    setIsDropdownOpen(true);
                }}
                onDropdownClose={() => {
                    setIsDropdownOpen(false);
                    cancelDebouncedClose(); // 取消防抖，因为下拉框已经关闭
                    dropdownElementRef.current = null; // 清理下拉框引用
                    handleResetSearch();
                }}
                onChange={handleChange}
                onCreate={handleAdd}
            />
        </MultiValuePastePopover>
    );
};

export default FilterMultiStringInput;
