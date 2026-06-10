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
    /** 移动端：与内部 Select/MultiSelect 一致用 80vw，且勿用 Popover size middleware（会压成 chip 宽度） */
    dropdownMobile: {
        width: '80vw',
        maxWidth: '80vw',
        minWidth: '80vw',
        boxSizing: 'border-box',
    },
    /** 查看模式：内部下拉打开时补全高度，超出则限制 60vh */
    dropdownWithSubOpen: {
        minHeight: 'min(400px, 60vh)',
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
    },
    /** 编辑模式：内容本身较高，仅补全 minHeight，不压到 60vh 避免展开下拉时出现滚动条 */
    dropdownWithSubOpenEdit: {
        minHeight: 'min(520px, 60vh)',
        maxHeight: 'none',
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
