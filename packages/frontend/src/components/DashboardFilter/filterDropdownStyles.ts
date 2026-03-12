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
    /** 内部下拉打开时：其他筛选器（编辑已有筛选）使用，默认预留高度 */
    dropdownWithSubOpen: {
        minHeight: 'min(400px, 60vh)',
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
    },
    /** 添加全局/tab 筛选器：弹窗打开即占位默认高度，从第二个切回第一个时高度不丢失 */
    dropdownAddFilterWithSubOpen: {
        minHeight: 'min(520px, 60vh)',
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
    },
    /** 与 dropdownWithSubOpen / dropdownAddFilterWithSubOpen 配合：内容区占满剩余高度，应用按钮自然在底部 */
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
