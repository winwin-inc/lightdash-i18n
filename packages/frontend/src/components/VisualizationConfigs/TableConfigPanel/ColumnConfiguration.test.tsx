import { ChartType } from '@lightdash/common';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type FC, useCallback, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MantineProvider from '../../../providers/MantineProvider';
import ColumnConfiguration from './ColumnConfiguration';

/**
 * ColumnConfiguration 只从 useVisualizationContext() 取 visualizationConfig / pivotDimensions。
 * 这里用最小 mock 代替整个 VisualizationProvider，让 updateColumnProperty 保持为可断言的 vi.fn()。
 */
const visualizationContext = vi.hoisted(() => ({
    current: undefined as unknown,
}));

vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => visualizationContext.current,
}));

const FIELD_ID = 'orders_col_a';
const FIELD_LABEL_DEFAULT = 'Col A';

type ColumnPropertiesLike = { name?: string };

type HarnessProps = {
    fieldId: string;
    fieldLabelDefault: string;
    initialName: string | undefined;
    onUpdate: (fieldId: string, properties: ColumnPropertiesLike) => void;
};

/**
 * 复刻 useTableConfig 的回流语义：
 * updateColumnProperty 写入后父级 state 更新，getFieldLabelOverride 立刻返回新名字。
 * 测试不依赖真实 provider，但也不能丢掉这层「写入后再读回」的行为，
 * 否则 blur 路径会误判成「名字没变」而重复写入。
 */
const Harness: FC<HarnessProps> = ({
    fieldId,
    fieldLabelDefault,
    initialName,
    onUpdate,
}) => {
    const [name, setName] = useState<string | undefined>(initialName);

    const updateColumnProperty = useCallback(
        (updatedFieldId: string, properties: ColumnPropertiesLike) => {
            onUpdate(updatedFieldId, properties);
            if ('name' in properties) {
                setName(properties.name);
            }
        },
        [onUpdate],
    );

    const getFieldLabelOverride = useCallback(
        (queriedFieldId: string) =>
            queriedFieldId === fieldId ? name : undefined,
        [fieldId, name],
    );

    const chartConfig = useMemo(
        () => ({
            updateColumnProperty,
            isColumnVisible: () => true,
            isColumnFrozen: () => false,
            getFieldLabelOverride,
            getFieldLabelDefault: () => fieldLabelDefault,
            columnProperties: {},
            setLocalColumnWidth: () => {},
        }),
        [updateColumnProperty, getFieldLabelOverride, fieldLabelDefault],
    );

    // useVisualizationContext() 在 ColumnConfiguration 渲染期间读取
    visualizationContext.current = {
        pivotDimensions: undefined,
        visualizationConfig: { chartType: ChartType.TABLE, chartConfig },
    };

    return <ColumnConfiguration fieldId={fieldId} />;
};

type SetupOptions = {
    fieldLabelDefault?: string;
    initialName?: string;
};

const setup = ({
    fieldLabelDefault = FIELD_LABEL_DEFAULT,
    initialName,
}: SetupOptions = {}) => {
    const updateColumnProperty = vi.fn();
    const view = render(
        <MantineProvider>
            <Harness
                fieldId={FIELD_ID}
                fieldLabelDefault={fieldLabelDefault}
                initialName={initialName}
                onUpdate={updateColumnProperty}
            />
        </MantineProvider>,
    );

    return {
        ...view,
        input: screen.getByRole('textbox'),
        updateColumnProperty,
    };
};

const typeName = (input: HTMLElement, value: string) => {
    fireEvent.change(input, { target: { value } });
};

describe('ColumnConfiguration 列名提交规则', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('commits once on blur without waiting for the debounce', () => {
        const { input, updateColumnProperty } = setup();

        typeName(input, 'X');
        // 不推进定时器，直接失焦（用户点保存 / 点走输入框）
        fireEvent.blur(input);

        expect(updateColumnProperty).toHaveBeenCalledTimes(1);
        expect(updateColumnProperty).toHaveBeenCalledWith(FIELD_ID, {
            name: 'X',
        });
    });

    it('does not commit again on blur after the debounce already committed', () => {
        const { input, updateColumnProperty } = setup();

        typeName(input, 'X');
        act(() => {
            vi.advanceTimersByTime(600);
        });

        // debounce 已提交
        expect(updateColumnProperty).toHaveBeenCalledTimes(1);
        expect(updateColumnProperty).toHaveBeenCalledWith(FIELD_ID, {
            name: 'X',
        });

        // 名字已写回配置 → 再失焦不得重复写
        fireEvent.blur(input);
        expect(updateColumnProperty).toHaveBeenCalledTimes(1);
    });

    it('does not commit when blurring without any edit', () => {
        const { input, updateColumnProperty } = setup();

        fireEvent.blur(input);
        act(() => {
            vi.advanceTimersByTime(600);
        });

        expect(updateColumnProperty).not.toHaveBeenCalled();
    });

    it('commits undefined when the name is set back to the default label', () => {
        const { input, updateColumnProperty } = setup({
            initialName: 'My column',
        });

        // 改回默认名（清掉自定义名）→ 写成 undefined，而不是空字符串
        typeName(input, FIELD_LABEL_DEFAULT);
        fireEvent.blur(input);

        expect(updateColumnProperty).toHaveBeenCalledTimes(1);
        expect(updateColumnProperty).toHaveBeenCalledWith(FIELD_ID, {
            name: undefined,
        });
    });

    it.each([
        { initialName: undefined, typed: 'X' },
        { initialName: 'My column', typed: 'Y' },
    ])(
        'produces the same payload from blur and debounce (%o)',
        ({ initialName, typed }) => {
            const blurRun = setup({ initialName });
            typeName(blurRun.input, typed);
            fireEvent.blur(blurRun.input);
            const blurCalls = blurRun.updateColumnProperty.mock.calls;

            // 先卸载，避免两次 render 的输入框同时存在 / 定时器互相干扰
            blurRun.unmount();

            const debounceRun = setup({ initialName });
            typeName(debounceRun.input, typed);
            act(() => {
                vi.advanceTimersByTime(600);
            });
            const debounceCalls = debounceRun.updateColumnProperty.mock.calls;

            expect(blurCalls).toEqual(debounceCalls);
            expect(blurCalls).toEqual([[FIELD_ID, { name: typed }]]);
        },
    );
});
