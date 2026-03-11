import { createStyles } from '@mantine/core';

/** 筛选弹窗下拉区域样式：单个筛选展开与「添加筛选器」弹窗共用，内部下拉打开时占位高度、内容区 flex 沉底 */
export const useFilterDropdownStyles = createStyles(() => ({
    /** Popover.Dropdown 整块：仅限制宽度，高度随内容，不裁切内部下拉 */
    dropdown: {
        maxWidth: 'min(90vw, 500px)',
        width: 'min(90vw, 500px)',
        maxHeight: 'none',
        overflow: 'visible',
    },
    /** 内部下拉打开时：预留高度，露出应用按钮 */
    dropdownWithSubOpen: {
        minHeight: 'min(400px, 80vh)',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
    },
    /** 与 dropdownWithSubOpen 配合：内容区占满剩余高度，应用按钮自然在底部 */
    dropdownContent: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        '& > *': {
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
        },
        '& > * > *:first-child': {
            flex: 1,
            minHeight: 0,
        },
    },
}));
