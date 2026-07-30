import {
    Group,
    MultiSelect,
    ScrollArea,
    Stack,
    Text,
    type MultiSelectProps,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
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

import { useIsMobileDevice } from '../../../../hooks/useIsMobileDevice';
import MantineIcon from '../../MantineIcon';
import classes from './FilterMultiStringInput.module.css';
import FilterMultiValueActions from './FilterMultiValueActions';
import MultiValuePastePopover from './MultiValuePastePopover';
import { formatDisplayValue } from './utils';

type Props = Omit<MultiSelectProps, 'data' | 'onChange'> & {
    values: string[];
    onChange: (values: string[]) => void;
    /** 缂栬緫妯″紡涓?true 鏃跺惎鐢ㄣ€岄紶鏍囩Щ鍑轰笅鎷夊尯鍩熷垯鏀惰捣銆嶏紱鏌ョ湅妯″紡涓嶄紶鎴?false锛屼笉鏀惰捣 */
    closeDropdownOnMouseLeave?: boolean;
};

const FilterMultiStringInput: FC<Props> = ({
    values,
    disabled,
    onChange,
    placeholder,
    closeDropdownOnMouseLeave = false,
    onDropdownOpen: onDropdownOpenProp,
    onDropdownClose: onDropdownCloseProp,
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

    // 璺熻█涓嬫媺妗嗘槸鍚︽墦寮€
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    // 淇濆瓨涓嬫媺妗嗗厓绱犵殑寮曠敤
    const dropdownElementRef = useRef<HTMLElement | null>(null);

    // 闃叉姈鍏抽棴瀹氭椂鍣ㄥ紩鐢?
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 鍏抽棴涓嬫媺妗嗙殑鍑芥暟
    const closeDropdown = useCallback(() => {
        if (isDropdownOpen) {
            multiSelectRef.current?.blur();
        }
    }, [isDropdownOpen]);

    // 鍚姩闃叉姈鍏抽棴
    const startDebouncedClose = useCallback(() => {
        // 娓呴櫎涔嬪墠鐨勫畾鏃跺櫒
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }
        // 璁剧疆鏂扮殑瀹氭椂鍣?
        closeTimeoutRef.current = setTimeout(() => {
            closeTimeoutRef.current = null;
            closeDropdown();
        }, 500);
    }, [closeDropdown]);

    // 鍙栨秷闃叉姈鍏抽棴
    const cancelDebouncedClose = useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, []);

    // 鏌ユ壘骞朵繚瀛樹笅鎷夋鍏冪礌寮曠敤
    const findDropdownElement = useCallback(() => {
        if (!multiSelectRef.current) {
            return null;
        }

        // 鏂规硶1: 浼樺厛鏌ユ壘鎵€鏈夊彲瑙佺殑 role="listbox" 鍏冪礌锛堣繖鏄疄闄呯殑涓嬫媺鍒楄〃锛?
        const allListboxes = document.querySelectorAll('[role="listbox"]');
        const inputRect = multiSelectRef.current.getBoundingClientRect();

        // 浼樺厛閫氳繃浣嶇疆鍖归厱鎵惧埌姝ｇ‘鐨?listbox
        for (const listbox of allListboxes) {
            const rect = listbox.getBoundingClientRect();
            // 妫€鏌ユ槸鍚﹀彲瑙佷笖涓庤緭鍏ユ浣嶇疆鐩稿叧
            if (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.top > 0 // 纭繚涓嬫媺妗嗗湪瑙嗗彛涓?
            ) {
                const horizontalDiff = Math.abs(rect.left - inputRect.left);
                const verticalDiff = rect.top - inputRect.bottom;

                // 鏀惧鍖归厱鏉′欢锛氭按骞充綅缃浉杩戯紝涓嬫媺妗嗗湪杈撳叆妗嗕笅鏂规垨绋嶅井閲嶅彔
                if (
                    horizontalDiff < 100 && // 姘村钩浣嶇疆鐩歌繎锛堟斁瀹藉埌100px锛?
                    verticalDiff >= -20 // 涓嬫媺妗嗗湪杈撳叆妗嗕笅鏂规垨绋嶅井閲嶅彔锛堟斁瀹藉埌20px锛?
                ) {
                    return listbox as HTMLElement;
                }
            }
        }

        // 鏂规硶2: 閫氳繃 aria-owns 鏌ユ壘瀹為檯鐨?listbox锛堝鐢ㄦ柟娉曪級
        const inputId = multiSelectRef.current.id;
        if (inputId) {
            // 鍏堟壘鍒?combobox 鍖呰鍣?
            const combobox = document.querySelector(
                `[aria-controls="${inputId}"], [aria-labelledby="${inputId}"]`,
            ) as HTMLElement | null;

            if (combobox) {
                // 浠?combobox 鐨?aria-owns 鑾峰彇 listbox 鐨?ID
                const listboxId = combobox.getAttribute('aria-owns');
                if (listboxId) {
                    // 鏌ユ壘瀹為檯鐨?listbox 鍏冪礌
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

        // 鏂规硶3: 鏌ユ壘 data-combobox-dropdown
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
    // 妫€娴嬫槸鍚﹀湪涓嬫媺妗嗘垨杈撳叆妗嗚寖鍥村唴
    const isMouseInSelectArea = useCallback(
        (x: number, y: number): boolean => {
            // 妫€鏌ヨ緭鍏ユ
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

            // 妫€鏌ヤ笅鎷夋锛堟瘡娆￠兘閲嶆柊鏌ユ壘锛岀‘淇濊幏鍙栨渶鏂扮殑浣嶇疆鍜屽ぇ灏忥級
            const dropdown = findDropdownElement();
            if (dropdown) {
                // 鏇存柊寮曠敤
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

    // 妫€娴嬫槸鍚︿负绉诲姩璁惧
    const isMobileDevice = useIsMobileDevice();

    // 缂栬緫妯″紡涓嬶細榧犳爣绂诲紑涓嬫媺妗嗚寖鍥存椂鍏抽棴锛堜粎PC绔級锛涙煡鐪嬫ā寮忎笉鍚敤
    useEffect(() => {
        if (!isDropdownOpen) return;
        if (!closeDropdownOnMouseLeave) return;
        if (isMobileDevice) return;

        // 涓嬫媺妗嗘墦寮€鏃讹紝寤惰繜鏌ユ壘涓嬫媺妗嗗厓绱狅紙绛夊緟娓叉煋锛?
        const timeoutId = setTimeout(() => {
            dropdownElementRef.current = findDropdownElement();
        }, 100);

        const handleMouseMove = (event: MouseEvent) => {
            const isInside = isMouseInSelectArea(event.clientX, event.clientY);

            if (isInside) {
                // 榧犳爣鍦ㄤ笅鎷夋鍐咃紝鍙栨秷闃叉姈锛堜繚鎸佹墦寮€锛?
                cancelDebouncedClose();
            } else {
                // 榧犳爣绂诲紑涓嬫媺妗嗭紝鍚姩闃叉姈鍏抽棴锛堝彧鍦ㄧ涓€娆＄寮€鏃跺惎鍔紝涓嶄細鍥犱负绉诲姩鑰岄噸缃級
                if (!closeTimeoutRef.current) {
                    startDebouncedClose();
                }
            }
        };

        // 鐩戝惉榧犳爣绉诲姩锛堜粎PC绔級
        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousemove', handleMouseMove);
            cancelDebouncedClose(); // 娓呯悊鏃跺彇娑堥槻鎶?
            dropdownElementRef.current = null; // 娓呯悊寮曠敤
        };
    }, [
        isDropdownOpen,
        closeDropdownOnMouseLeave,
        isMouseInSelectArea,
        findDropdownElement,
        cancelDebouncedClose,
        startDebouncedClose,
        isMobileDevice,
    ]);

    // 缁勪欢鍗歌浇鏃舵竻鐞嗗畾鏃跺櫒
    useEffect(() => {
        return () => {
            cancelDebouncedClose();
        };
    }, [cancelDebouncedClose]);

    const handleChange = useCallback(
        (updatedValues: string[]) => {
            onChange(uniq(updatedValues));
            // 绉诲姩绔閫夋ā寮忥細閫夋嫨鍚庡欢杩熷叧闂紝鎻愬崌绉诲姩绔綋楠?
            if (isMobileDevice) {
                cancelDebouncedClose();
                setTimeout(() => {
                    multiSelectRef.current?.blur();
                }, 300);
            }
        },
        [onChange, isMobileDevice, cancelDebouncedClose],
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

    /*
     * Foot of the dropdown action row.
     *
     * The visible candidates for this component are the data items
     * themselves (results is always empty here); the bulk action is only
     * useful when the data set expands beyond what is already selected.
     * We still render the buttons for parity with the autocomplete variant
     * \u2014 they end up disabled when nothing would be added.
     */
    const handleSelectAll = useCallback(() => {
        const toAdd = data
            .map((item) => item.value)
            .filter((value) => !values.includes(value));
        if (toAdd.length === 0) return;
        handleChange([...values, ...toAdd]);
    }, [data, values, handleChange]);

    const handleClearAll = useCallback(() => {
        if (values.length === 0) return;
        handleChange([]);
    }, [values, handleChange]);

    // Stable reference to the latest state for the memoized dropdownComponent
    // override. Keeps the wrapper identity constant so MultiSelect does not
    // reset its internal scroll position on selection.
    const dropdownStateRef = useRef({
        data,
        values,
        search,
        handleSelectAll,
        handleClearAll,
    });
    dropdownStateRef.current = {
        data,
        values,
        search,
        handleSelectAll,
        handleClearAll,
    };

    const DropdownComponentOverride = useCallback<
        (props: { children: ReactNode; [k: string]: unknown }) => ReactNode
    >(({ children, ...props }) => {
        const {
            data: latestData,
            values: latestValues,
            search: latestSearch,
        } = dropdownStateRef.current;
        // Wrap items in ScrollArea so the candidate list scrolls
        // independently of the action row at the bottom. Without this
        // inner ScrollArea both pieces share the outer Box's overflow
        // scroll and the last candidate ends up glued to the action
        // row, looking visually "locked" at the bottom.
        return (
            <Stack w="100%" spacing={0}>
                <ScrollArea {...props}>{children}</ScrollArea>
                <FilterMultiValueActions
                    candidates={latestData.map((item) => item.value)}
                    selected={latestValues}
                    search={latestSearch}
                    onSelectAll={dropdownStateRef.current.handleSelectAll}
                    onClear={dropdownStateRef.current.handleClearAll}
                />
            </Stack>
        );
    }, []);

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
                classNames={{
                    item: classes.item,
                    values: classes.values,
                    value: classes.value,
                    input: classes.input,
                    wrapper: classes.wrapper,
                    dropdown: classes.dropdown,
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
                dropdownComponent={DropdownComponentOverride}
                data={data}
                value={values}
                onDropdownOpen={() => {
                    setIsDropdownOpen(true);
                    onDropdownOpenProp?.();
                }}
                onDropdownClose={() => {
                    setIsDropdownOpen(false);
                    cancelDebouncedClose(); // 鍙栨秷闃叉姈锛屽洜涓轰笅鎷夋宸茬粡鍏抽棴
                    dropdownElementRef.current = null; // 娓呯悊涓嬫媺妗嗗紩鐢?
                    handleResetSearch();
                    onDropdownCloseProp?.();
                }}
                onChange={handleChange}
                onCreate={handleAdd}
            />
        </MultiValuePastePopover>
    );
};

export default FilterMultiStringInput;
