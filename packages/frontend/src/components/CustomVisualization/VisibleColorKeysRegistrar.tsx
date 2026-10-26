import { useLayoutEffect, type FC } from 'react';

type Props = {
    /** 看板是否开启「同步图表颜色」；关闭时不注册 */
    enabled: boolean;
    /** 当前图可见系列名 */
    keys: string[];
    /** 追加可见系列名到看板色表 */
    registerVisibleColorKeys: (keys: string[]) => void;
};

/**
 * 把当前图可见系列名注册到看板色表。
 *
 * 用「子组件 + effect」而不是在渲染期写 ref：
 * - 渲染阶段不写 ref、不 setState，避免渲染副作用；
 * - effect 依赖包含 registerVisibleColorKeys 引用，看板色表重置
 *   （provider 重建 register 回调）后会自动重新注册，
 *   避免自定义图独有的系列名从看板色表里消失。
 *
 * keys 用内容签名（JSON 字符串）做依赖，而不是数组引用，
 * 这样父组件每次渲染产生的新数组不会造成重复注册。
 * 渲染期只计算签名，JSON.parse 放在 effect 里做（渲染期不做解析）。
 *
 * 用 useLayoutEffect 而不是 useEffect：与标准图
 * （LightdashVisualization/VisualizationProvider）保持一致，
 * 色表重置时自定义图不会先闪一帧哈希兜底色再重建 view。
 */
const VisibleColorKeysRegistrar: FC<Props> = ({
    enabled,
    keys,
    registerVisibleColorKeys,
}) => {
    // 内容签名：父组件每次渲染产生的新数组（内容相同）不会造成重复注册
    const keysSignature = JSON.stringify(keys);

    useLayoutEffect(() => {
        if (!enabled) return;
        const visibleKeys = JSON.parse(keysSignature) as string[];
        if (visibleKeys.length === 0) return;
        registerVisibleColorKeys(visibleKeys);
    }, [enabled, keysSignature, registerVisibleColorKeys]);

    return null;
};

export default VisibleColorKeysRegistrar;
